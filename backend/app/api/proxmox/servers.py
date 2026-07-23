from fastapi import APIRouter, Depends, Request, HTTPException, Query, Form, status, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from loguru import logger
from typing import List
import ssl
import asyncio
import httpx
import websockets

from ...db import get_db
from ...models import ProxmoxServer, VMInstance, User, IPAMAllocation, IPAMNetwork, VMSnapshotArchive
from app.schemas import ProxmoxServerCreate, ProxmoxServerUpdate, ProxmoxServerResponse
from ...proxmox import ProxmoxClient, get_proxmox_resources, _run_in_executor
from ...auth import get_current_user, PermissionChecker, require_permission, check_permission
from ...logging_service import LoggingService
from ...ipam_service import IPAMService
from ._helpers import (check_vm_access, require_vm_access, _get_proxmox_client,
                        get_next_vmid, archive_and_delete_snapshots,
                        save_vm_instance, get_vm_instance, soft_delete_vm_instance,
                        can_view_all_instances, get_owned_vmids)

router = APIRouter()


def _attach_workspaces(db: Session, servers: list) -> None:
    """Прикрепить к каждому серверу список рабочих областей, в которых он состоит.

    Пишет транзиентный атрибут ``server.workspaces`` (список словарей), который
    затем читает Pydantic-схема ``ProxmoxServerResponse`` через ``from_attributes``.
    """
    from ...models import WorkspaceServer, Workspace

    if not servers:
        return

    server_ids = [s.id for s in servers]
    rows = (
        db.query(WorkspaceServer.server_id, Workspace.id, Workspace.name, Workspace.color)
        .join(Workspace, Workspace.id == WorkspaceServer.workspace_id)
        .filter(WorkspaceServer.server_id.in_(server_ids))
        .all()
    )

    mapping: dict[int, list] = {}
    for sid, wid, wname, wcolor in rows:
        mapping.setdefault(sid, []).append({"id": wid, "name": wname, "color": wcolor})

    for s in servers:
        s.workspaces = mapping.get(s.id, [])


# ==================== Proxmox Server CRUD ====================

@router.get("/api/servers", response_model=List[ProxmoxServerResponse])
def list_proxmox_servers(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """Получить список всех Proxmox серверов (фильтруется по активному workspace)"""
    from ...api.workspaces import get_workspace_server_ids
    from ...models import WorkspaceUser, WorkspaceServer

    is_privileged = current_user.is_admin or (
        current_user.role and current_user.role.name in ('admin', 'moderator')
    )

    if is_privileged:
        # Privileged: use workspace filter only
        server_ids = get_workspace_server_ids(request, db, current_user)
        query = db.query(ProxmoxServer).order_by(ProxmoxServer.id)
        if server_ids is not None:
            query = query.filter(ProxmoxServer.id.in_(server_ids))
        servers = query.all()
        _attach_workspaces(db, servers)
        return servers

    # Non-privileged user: must be directly assigned AND server must be in one of their workspaces
    assigned_ids = {s.id for s in current_user.assigned_servers}

    # Collect server IDs accessible through user's workspaces
    user_ws_ids = {
        r.workspace_id for r in
        db.query(WorkspaceUser.workspace_id).filter(WorkspaceUser.user_id == current_user.id).all()
    }
    if user_ws_ids:
        ws_server_ids = {
            r.server_id for r in
            db.query(WorkspaceServer.server_id).filter(
                WorkspaceServer.workspace_id.in_(user_ws_ids)
            ).all()
        }
    else:
        ws_server_ids = set()

    # Intersect: directly assigned AND within user's workspaces
    effective_ids = assigned_ids & ws_server_ids

    # Also apply active-workspace header filter on top
    ws_filter = get_workspace_server_ids(request, db, current_user)
    if ws_filter is not None:
        effective_ids = effective_ids & set(ws_filter)

    if not effective_ids:
        return []

    servers = db.query(ProxmoxServer).filter(ProxmoxServer.id.in_(effective_ids)).order_by(ProxmoxServer.id).all()
    _attach_workspaces(db, servers)
    return servers


@router.post("/api/servers", response_model=ProxmoxServerResponse, status_code=status.HTTP_201_CREATED)
def create_proxmox_server(
    server_data: ProxmoxServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:create"))
):
    """Добавить новый Proxmox сервер"""
    # Разрешаем несколько серверов с одинаковым IP (например, разные порты или кластеры)
    # Проверяем только дубликаты имён
    existing = db.query(ProxmoxServer).filter(ProxmoxServer.name == server_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Server with name '{server_data.name}' already exists"
        )
    
    server = ProxmoxServer(**server_data.model_dump())
    db.add(server)
    db.commit()
    db.refresh(server)

    # Сразу проверяем подключение, чтобы статус is_online отобразился без задержки
    # в 30 секунд (период monitoring_worker.run_server_availability_check).
    try:
        client = _get_proxmox_client(server)
        if client.is_connected():
            server.update_status(True)
        else:
            server.update_status(False, "Failed to connect")
        db.commit()
        db.refresh(server)
    except Exception as e:
        logger.warning(f"Initial connectivity check failed for {server.name}: {e}")
        try:
            server.update_status(False, str(e))
            db.commit()
            db.refresh(server)
        except Exception:
            db.rollback()

    # Если сервер онлайн — мгновенно подтягиваем VM/LXC в локальный кэш,
    # чтобы NodeDetailPage и InstancesPage сразу увидели инстансы (без ожидания
    # 10-секундного цикла vm_cache_sync).
    if server.is_online:
        try:
            from ...workers.monitoring_worker import monitoring_worker
            monitoring_worker.sync_vm_cache()
        except Exception as e:
            logger.warning(f"Initial VM cache sync failed for server {server.name}: {e}")

    # Уведомляем все подключённые клиенты, что сервер добавлен — фронтенд
    # сразу инвалидирует список серверов и список VM.
    try:
        from ...websocket_manager import broadcast_event
        broadcast_event(
            "server_added",
            server_id=server.id,
            name=server.name,
            is_online=bool(server.is_online),
        )
    except Exception as e:
        logger.debug(f"Failed to broadcast server_added: {e}")

    logger.info(f"User {current_user.username} added Proxmox server: {server.name}")
    return server




@router.get("/api/servers/{server_id}", response_model=ProxmoxServerResponse)
def get_proxmox_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """Получить информацию о конкретном Proxmox сервере"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    _attach_workspaces(db, [server])
    return server


@router.get("/api/servers/{server_id}/cluster-info")
def get_server_cluster_info(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """
    Получить информацию о кластерном режиме сервера.
    Возвращает is_cluster=true если сервер в кластере (HA доступна).
    """
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            return JSONResponse(content={
                "server_id": server_id,
                "server_name": server.name,
                "is_cluster": False,
                "error": "Cannot connect to server"
            })
        
        is_cluster = client.is_cluster()
        nodes = client.get_nodes()
        node_names = [n.get('node') for n in nodes if n.get('node')]
        # Fallback: если get_nodes() вернул пустой список (например, нет прав),
        # используем hostname сервера как имя ноды
        if not node_names:
            node_names = [server.hostname]

        return JSONResponse(content={
            "server_id": server_id,
            "server_name": server.name,
            "is_cluster": is_cluster,
            "node_count": len(node_names),
            "nodes": node_names
        })
    except Exception as e:
        logger.error(f"Error checking cluster info for server {server_id}: {e}")
        return JSONResponse(content={
            "server_id": server_id,
            "server_name": server.name,
            "is_cluster": False,
            "error": str(e)
        })


@router.put("/api/servers/{server_id}", response_model=ProxmoxServerResponse)
def update_proxmox_server(
    server_id: int,
    server_data: ProxmoxServerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:update"))
):
    """Обновить Proxmox сервер"""
    from ...proxmox import clear_server_cache
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    # Если изменились учётные данные - очищаем кеш
    update_data = server_data.model_dump(exclude_unset=True)

    # Пустая строка в полях учётных данных означает "не менять" (клиент
    # присылает их пустыми, т.к. секреты не возвращаются с бэкенда) —
    # иначе она затирает реальный токен/пароль и сервер уходит в offline.
    for cred_field in ('api_token_name', 'api_token_value', 'password'):
        if update_data.get(cred_field) == '':
            update_data.pop(cred_field)

    if any(key in update_data for key in ['password', 'api_token_name', 'api_token_value', 'api_user']):
        clear_server_cache(server.ip_address)
        logger.info(f"Cleared cache for server {server.ip_address} due to credential update")
    
    # Update only provided fields
    for field, value in update_data.items():
        setattr(server, field, value)
    
    db.commit()
    db.refresh(server)
    
    logger.info(f"User {current_user.username} updated Proxmox server: {server.name}")

    # Если изменились параметры подключения — сразу проверяем доступность,
    # чтобы статус обновился без 30-секундной задержки monitoring_worker.
    creds_changed = any(
        key in update_data
        for key in ('password', 'api_token_name', 'api_token_value', 'api_user',
                    'ip_address', 'hostname', 'port', 'verify_ssl', 'use_password')
    )
    if creds_changed:
        try:
            client = _get_proxmox_client(server)
            if client.is_connected():
                server.update_status(True)
            else:
                server.update_status(False, "Failed to connect")
            db.commit()
            db.refresh(server)
            if server.is_online:
                try:
                    from ...workers.monitoring_worker import monitoring_worker
                    monitoring_worker.sync_vm_cache()
                except Exception as _e:
                    logger.debug(f"VM sync after update failed: {_e}")
        except Exception as e:
            logger.warning(f"Connectivity check after update failed for {server.name}: {e}")
            try:
                server.update_status(False, str(e))
                db.commit()
                db.refresh(server)
            except Exception:
                db.rollback()

    # Broadcast — фронтенд инвалидирует кэши списков серверов и инстансов
    try:
        from ...websocket_manager import broadcast_event
        broadcast_event(
            "server_updated",
            server_id=server.id,
            name=server.name,
            is_online=bool(server.is_online),
        )
    except Exception as e:
        logger.debug(f"Failed to broadcast server_updated: {e}")

    return server


@router.delete("/api/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proxmox_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:delete"))
):
    """Удалить Proxmox сервер и связанные OS Templates"""
    from ...proxmox import clear_server_cache
    from ...models import OSTemplate, OSTemplateGroup, VMInstance, Notification
    from ...workers import monitoring_worker
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    server_name = server.name
    server_ip = server.ip_address
    
    # Release ALL IPAM allocations for this server
    try:
        ipam = IPAMService(db)
        released_count = ipam.release_all_by_server(
            proxmox_server_id=server_id,
            released_by=current_user.username
        )
        if released_count > 0:
            logger.info(f"Released {released_count} IPAM allocations for server {server_name}")
    except Exception as e:
        logger.warning(f"Failed to release IPAM allocations for server: {e}")
    
    # Удаляем связанные OS Templates
    templates_deleted = db.query(OSTemplate).filter(OSTemplate.server_id == server_id).delete()
    if templates_deleted > 0:
        logger.info(f"Deleted {templates_deleted} OS templates for server {server_name}")
    
    # Удаляем кэш VM/контейнеров для этого сервера
    vms_deleted = db.query(VMInstance).filter(VMInstance.server_id == server_id).delete()
    if vms_deleted > 0:
        logger.info(f"Deleted {vms_deleted} cached VM instances for server {server_name}")
    
    # Удаляем пустые группы шаблонов (без шаблонов)
    empty_groups = db.query(OSTemplateGroup).filter(
        ~OSTemplateGroup.id.in_(
            db.query(OSTemplate.group_id).filter(OSTemplate.group_id != None).distinct()
        )
    ).all()
    for group in empty_groups:
        # Проверяем что группа действительно пуста
        template_count = db.query(OSTemplate).filter(OSTemplate.group_id == group.id).count()
        if template_count == 0:
            logger.info(f"Deleting empty template group: {group.name}")
            db.delete(group)
    
    logger.info(f"User {current_user.username} deleted Proxmox server: {server_name} ({server_ip})")
    
    # Удаляем уведомления о сервере (offline/online) чтобы они не показывались после удаления
    notifications_deleted = db.query(Notification).filter(
        Notification.source_id == str(server_id),
        Notification.source.in_(["monitoring", "server_monitor"])
    ).delete(synchronize_session=False)
    if notifications_deleted > 0:
        logger.info(f"Deleted {notifications_deleted} notifications for server {server_name}")
    
    # Очищаем кеш подключений для этого сервера
    clear_server_cache(server_ip)
    
    db.delete(server)
    db.commit()
    
    # Очищаем in-memory состояние мониторинга для удалённого сервера
    try:
        monitoring_worker.cleanup_server_state(server_id)
    except Exception as e:
        logger.warning(f"Failed to cleanup monitoring state for server {server_id}: {e}")

    # Broadcast — фронтенд мгновенно убирает удалённый сервер и его инстансы
    try:
        from ...websocket_manager import broadcast_event
        broadcast_event(
            "server_deleted",
            server_id=server_id,
            name=server_name,
        )
    except Exception as e:
        logger.debug(f"Failed to broadcast server_deleted: {e}")

    return None


@router.post("/api/servers/test", status_code=status.HTTP_200_OK)
def test_proxmox_credentials(
    payload: ProxmoxServerCreate,
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """Проверить произвольные учётные данные Proxmox без сохранения в БД."""
    try:
        if payload.use_password:
            client = ProxmoxClient(
                host=payload.ip_address,
                user=payload.api_user,
                password=payload.password,
                verify_ssl=payload.verify_ssl,
            )
        else:
            client = ProxmoxClient(
                host=payload.ip_address,
                user=payload.api_user,
                token_name=payload.api_token_name,
                token_value=payload.api_token_value,
                verify_ssl=payload.verify_ssl,
            )

        if client.is_connected():
            return {"success": True, "status": "success", "message": "Connection successful"}
        return {"success": False, "status": "error", "message": "Failed to connect to Proxmox server"}
    except Exception as e:
        logger.error(f"Error testing Proxmox credentials for {payload.ip_address}: {e}")
        return {"success": False, "status": "error", "message": str(e)}


@router.post("/api/servers/{server_id}/test", status_code=status.HTTP_200_OK)
def test_proxmox_connection(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """Проверить подключение к Proxmox серверу"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")

    try:
        # Determine auth method
        client = _get_proxmox_client(server)

        if client.is_connected():
            server.update_status(True)
            db.commit()
            return {"success": True, "status": "success", "message": "Connection successful"}
        else:
            server.update_status(False, "Failed to connect")
            db.commit()
            return {"success": False, "status": "error", "message": "Failed to connect to Proxmox server"}

    except Exception as e:
        server.update_status(False, str(e))
        db.commit()
        logger.error(f"Error testing Proxmox connection to {server.name}: {e}")
        return {"success": False, "status": "error", "message": str(e)}


# ==================== Proxmox Resources ====================

@router.get("/api/{server_id}/resources")
def get_server_resources(
    server_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """API для получения всех ресурсов (VM + LXC) с Proxmox сервера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    # Если hostname указан (нода в кластере), фильтруем по ней
    # Проверяем что hostname не пустой и не равен IP адресу (автономный сервер)
    node_filter = None
    if server.hostname and server.hostname != server.ip_address:
        node_filter = server.hostname
    
    try:
        if server.use_password:
            resources = get_proxmox_resources(
                host=server.ip_address,
                user=server.api_user,
                password=server.password,
                verify_ssl=server.verify_ssl,
                node=node_filter
            )
        else:
            resources = get_proxmox_resources(
                host=server.ip_address,
                user=server.api_user,
                token_name=server.api_token_name,
                token_value=server.api_token_value,
                verify_ssl=server.verify_ssl,
                node=node_filter
            )
        
        # Фильтруем шаблоны - они не должны считаться как VM
        vms = [vm for vm in resources.get('vms', []) if not vm.get('template', 0)]
        containers = [ct for ct in resources.get('containers', []) if not ct.get('template', 0)]

        # Изоляция по владельцу: обычный пользователь видит на ноде только свои
        # инстансы. Живые данные Proxmox не содержат owner_id, поэтому сверяемся
        # с локальным кэшем vm_instances по vmid.
        if not can_view_all_instances(current_user):
            owned = get_owned_vmids(db, current_user, server_id)
            vms = [vm for vm in vms if vm.get('vmid') in owned]
            containers = [ct for ct in containers if ct.get('vmid') in owned]

        # Получаем uptime ноды
        node_uptime = None
        try:
            client = _get_proxmox_client(server)
            nodes = client.get_nodes()
            if nodes:
                target_node = node_filter or (nodes[0].get('node') if nodes else None)
                for n in nodes:
                    if target_node and n.get('node') == target_node:
                        node_uptime = n.get('uptime')
                        break
                if node_uptime is None and nodes:
                    node_uptime = nodes[0].get('uptime')
        except Exception:
            pass
        
        server.update_status(True)
        db.commit()
        
        return JSONResponse(content={
            "server_id": server_id,
            "server_name": server.name,
            "vms": vms,
            "containers": containers,
            "node_uptime": node_uptime
        })
    except Exception as e:
        server.update_status(False, str(e))
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error getting resources: {str(e)}")


@router.get("/api/resources/all")
def get_all_resources(
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """API для получения всех ресурсов со всех Proxmox серверов"""
    proxmox_servers = db.query(ProxmoxServer).all()

    # Обычный пользователь видит только свои инстансы во всех агрегатах.
    is_privileged = can_view_all_instances(current_user)

    all_resources = {
        "servers": [],
        "total_vms": 0,
        "total_containers": 0
    }

    for server in proxmox_servers:
        try:
            logger.info(f"Getting resources from server {server.name}, use_password={server.use_password}")
            # Создаём клиента для каждого сервера независимо
            if server.use_password:
                resources = get_proxmox_resources(
                    host=server.ip_address,
                    user=server.api_user,
                    password=server.password,
                    verify_ssl=server.verify_ssl
                )
            else:
                logger.info(f"Using API token for {server.name}: user={server.api_user}")
                resources = get_proxmox_resources(
                    host=server.ip_address,
                    user=server.api_user,
                    token_name=server.api_token_name,
                    token_value=server.api_token_value,
                    verify_ssl=server.verify_ssl
                )
            
            vms = resources.get('vms', [])
            containers = resources.get('containers', [])

            # Изоляция по владельцу (живые данные Proxmox не содержат owner_id).
            if not is_privileged:
                owned = get_owned_vmids(db, current_user, server.id)
                vms = [vm for vm in vms if vm.get('vmid') in owned]
                containers = [ct for ct in containers if ct.get('vmid') in owned]

            logger.info(f"Got {len(vms)} VMs and {len(containers)} containers from {server.name}")
            
            server.update_status(True)
            db.commit()
            
            all_resources["servers"].append({
                "id": server.id,
                "name": server.name,
                "ip": server.ip_address,
                "vms": vms,
                "containers": containers,
                "vms_count": len(vms),
                "containers_count": len(containers)
            })
            
            all_resources["total_vms"] += len(vms)
            all_resources["total_containers"] += len(containers)
            
        except Exception as e:
            logger.error(f"Error getting resources from server {server.name} ({server.ip_address}): {e}")
            server.update_status(False, str(e))
            db.commit()
            all_resources["servers"].append({
                "id": server.id,
                "name": server.name,
                "ip": server.ip_address,
                "error": str(e),
                "vms": [],
                "containers": [],
                "vms_count": 0,
                "containers_count": 0
            })
            # Продолжаем обработку следующего сервера
            continue
    
    return JSONResponse(content=all_resources)


# ==================== Node (Host) Status ====================

@router.get("/api/{server_id}/storages")
def get_storages(
    server_id: int,
    node: str = Query(..., description="Node name"),
    content_type: str = Query(None, description="Filter by content type (images, rootdir, vztmpl, etc)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """Получить список хранилищ на ноде Proxmox"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        storages = client.get_node_storages(node)
        
        # Фильтрация по типу контента если указано
        if content_type and storages:
            filtered = []
            for storage in storages:
                content = storage.get('content', '')
                if content_type in content.split(','):
                    filtered.append(storage)
            storages = filtered
        
        # Сортировка: сначала активные, потом по имени
        storages.sort(key=lambda x: (not x.get('active', 1), x.get('storage', '')))
        
        return JSONResponse(content={"storages": storages})
    except Exception as e:
        logger.error(f"Error getting storages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/node/status")
def get_node_status(
    server_id: int,
    node: str = Query(..., description="Node name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить текущий статус ноды Proxmox (хоста)"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        status = client.get_node_status(node)
        if not status:
            raise HTTPException(status_code=404, detail="Node status not found")
        
        return JSONResponse(content=status)
    except Exception as e:
        logger.error(f"Error getting node {node} status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/node/rrddata")
def get_node_rrddata(
    server_id: int,
    node: str = Query(..., description="Node name"),
    timeframe: str = Query("hour", regex="^(hour|day|week|month|year)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить исторические данные ноды для графиков"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        rrddata = client.get_node_rrddata(node, timeframe)
        return JSONResponse(content=rrddata)
    except Exception as e:
        logger.error(f"Error getting node {node} RRD data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
