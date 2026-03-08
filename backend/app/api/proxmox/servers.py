from fastapi import APIRouter, Depends, Request, HTTPException, Query, Form, status, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
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
from ...schemas import ProxmoxServerCreate, ProxmoxServerUpdate, ProxmoxServerResponse
from ...proxmox_client import ProxmoxClient, get_proxmox_resources
from ...auth import get_current_user, PermissionChecker, require_permission, check_permission
from ...logging_service import LoggingService
from ...template_helpers import add_i18n_context
from ...ipam_service import IPAMService
from ._helpers import (check_vm_access, require_vm_access, _get_proxmox_client,
                        get_next_vmid, archive_and_delete_snapshots,
                        save_vm_instance, get_vm_instance, soft_delete_vm_instance,
                        templates)

router = APIRouter()


# ==================== HTML Pages ====================

@router.get("/vms", response_class=HTMLResponse, include_in_schema=False)
def vms_page(request: Request, db: Session = Depends(get_db)):
    """Страница управления Proxmox серверами, VM и LXC"""
    from ...i18n import t
    lang = request.cookies.get("language", "en")
    
    proxmox_servers = db.query(ProxmoxServer).all()
    
    context = {
        "request": request,
        "proxmox_servers": proxmox_servers,
        "page_title": t('nav_proxmox', lang),
    }
    context = add_i18n_context(request, context)
    return templates.TemplateResponse("proxmox_vms.html", context)


@router.get("/server/{server_id}", response_class=HTMLResponse, include_in_schema=False)
def server_detail_page(request: Request, server_id: int, db: Session = Depends(get_db)):
    """Страница детального просмотра VM/LXC конкретного Proxmox сервера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    context = {
        "request": request,
        "server": server,
        "page_title": server.name,
    }
    context = add_i18n_context(request, context)
    return templates.TemplateResponse("proxmox_server_detail.html", context)


@router.get("/server/{server_id}/instance/{vmid}", response_class=HTMLResponse, include_in_schema=False)
def instance_detail_page(request: Request, server_id: int, vmid: int, type: str = "qemu", node: str = "", db: Session = Depends(get_db)):
    """Страница детального просмотра конкретной VM или LXC"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    context = {
        "request": request,
        "server": server,
        "vmid": vmid,
        "type": type,
        "node": node,
        "page_title": f"VM {vmid}",
    }
    context = add_i18n_context(request, context)
    return templates.TemplateResponse("instance_detail.html", context)


# ==================== Proxmox Server CRUD ====================

@router.get("/api/servers", response_model=List[ProxmoxServerResponse])
def list_proxmox_servers(
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Получить список всех Proxmox серверов"""
    servers = db.query(ProxmoxServer).all()
    return servers


@router.post("/api/servers", response_model=ProxmoxServerResponse, status_code=status.HTTP_201_CREATED)
def create_proxmox_server(
    server_data: ProxmoxServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.servers.add"))
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
    
    logger.info(f"User {current_user.username} added Proxmox server: {server.name} ({server.ip_address})")
    return server


@router.post("/api/servers/auto-setup", status_code=status.HTTP_201_CREATED)
async def auto_setup_proxmox_server(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.servers.add"))
):
    """
    Автоматическая настройка Proxmox сервера:
    1. Проверяем подключение по логину/паролю
    2. Создаем API Token автоматически
    3. Сохраняем сервер в базу с токеном и паролем (для VNC)
    """
    import requests as http_requests
    import uuid
    
    # Получаем данные из body
    data = await request.json()
    
    name = data.get('name')
    hostname = data.get('hostname')
    ip_address = data.get('ip_address')
    port = data.get('port', 8006)
    api_user = data.get('api_user', 'root@pam')
    password = data.get('password')
    verify_ssl = data.get('verify_ssl', True)
    description = data.get('description')
    
    if not all([name, ip_address, password]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Необходимо указать: name, ip_address, password"
        )
    
    # Разрешаем несколько серверов с одинаковым IP
    # Проверяем только дубликаты имён
    existing = db.query(ProxmoxServer).filter(ProxmoxServer.name == name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Сервер с именем '{name}' уже существует"
        )
    
    base_url = f"https://{ip_address}:{port}"
    
    # 1. Получить auth ticket
    logger.info(f"Attempting to connect to Proxmox at {base_url}")
    try:
        auth_response = http_requests.post(
            f"{base_url}/api2/json/access/ticket",
            data={"username": api_user, "password": password},
            verify=verify_ssl,
            timeout=15
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ошибка авторизации в Proxmox: неверный логин или пароль"
            )
        
        auth_data = auth_response.json().get("data", {})
        ticket = auth_data.get("ticket")
        csrf_token = auth_data.get("CSRFPreventionToken")
        
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Не удалось получить auth ticket от Proxmox"
            )
        
        logger.info(f"Successfully authenticated to Proxmox {ip_address}")
        
    except http_requests.exceptions.RequestException as e:
        logger.error(f"Connection error to Proxmox: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не удалось подключиться к Proxmox: {str(e)}"
        )
    
    # 2. Создать API Token
    # Извлекаем username из api_user (root@pam -> root)
    username_part = api_user.split('@')[0] if '@' in api_user else api_user
    realm = api_user.split('@')[1] if '@' in api_user else 'pam'
    
    token_name = f"panel-{uuid.uuid4().hex[:8]}"
    
    headers = {
        "Cookie": f"PVEAuthCookie={ticket}",
        "CSRFPreventionToken": csrf_token
    }
    
    try:
        # Создаем токен через API
        token_response = http_requests.post(
            f"{base_url}/api2/json/access/users/{api_user}/token/{token_name}",
            headers=headers,
            data={"privsep": "0"},  # Полные права как у пользователя
            verify=verify_ssl,
            timeout=15
        )
        
        if token_response.status_code not in [200, 201]:
            logger.warning(f"Failed to create token: {token_response.status_code} - {token_response.text}")
            # Если не удалось создать токен, работаем только с паролем
            token_value = None
            token_name = None
            logger.info("Will use password authentication only")
        else:
            token_data = token_response.json().get("data", {})
            token_value = token_data.get("value")
            logger.info(f"Created API token: {token_name}")
            
    except Exception as e:
        logger.warning(f"Error creating token: {e}, will use password auth")
        token_value = None
        token_name = None
    
    # 3. Получить список нод кластера и их IP адреса
    cluster_nodes = []
    node_ips = {}  # node_name -> ip_address
    
    try:
        # Получаем список нод
        nodes_response = http_requests.get(
            f"{base_url}/api2/json/nodes",
            headers=headers,
            cookies={"PVEAuthCookie": ticket},
            verify=verify_ssl,
            timeout=15
        )
        if nodes_response.status_code == 200:
            nodes_data = nodes_response.json().get("data", [])
            cluster_nodes = [n for n in nodes_data if n.get("node")]
            logger.info(f"Found {len(cluster_nodes)} nodes in cluster")
        
        # Получаем IP адреса нод из cluster/status
        if len(cluster_nodes) > 1:
            cluster_status_response = http_requests.get(
                f"{base_url}/api2/json/cluster/status",
                headers=headers,
                cookies={"PVEAuthCookie": ticket},
                verify=verify_ssl,
                timeout=15
            )
            if cluster_status_response.status_code == 200:
                cluster_status = cluster_status_response.json().get("data", [])
                for item in cluster_status:
                    if item.get("type") == "node" and item.get("name") and item.get("ip"):
                        node_ips[item.get("name")] = item.get("ip")
                        logger.info(f"Node {item.get('name')} IP: {item.get('ip')}")
    except Exception as e:
        logger.warning(f"Could not get cluster nodes: {e}")
    
    # 4. Сохранить серверы в базу
    created_servers = []
    
    if len(cluster_nodes) > 1:
        # Это кластер - добавляем все ноды
        for node_info in cluster_nodes:
            node_name = node_info.get("node")
            # Используем IP ноды из cluster/status, или IP через который подключились
            node_ip = node_ips.get(node_name, ip_address)
            
            # Имя сервера: "BaseName - NodeName" или просто NodeName
            if name:
                server_name = f"{name} - {node_name}"
            else:
                server_name = node_name
            
            # Проверяем дубликаты
            existing = db.query(ProxmoxServer).filter(ProxmoxServer.name == server_name).first()
            if existing:
                logger.info(f"Server '{server_name}' already exists, skipping")
                continue
            
            # Для каждой ноды создаём токен (используем тот же, так как токен кластерный)
            server = ProxmoxServer(
                name=server_name,
                hostname=node_name,
                ip_address=node_ip,  # Используем реальный IP ноды
                port=port,
                api_user=api_user,
                api_token_name=token_name,
                api_token_value=token_value,
                use_password=token_value is None,
                password=password,
                verify_ssl=verify_ssl,
                description=f"{description or ''} (Node: {node_name})".strip(),
                is_online=node_info.get("status") == "online"
            )
            
            db.add(server)
            created_servers.append({
                "name": server_name,
                "node": node_name,
                "ip": node_ip,
                "status": node_info.get("status", "unknown")
            })
        
        db.commit()
        logger.info(f"User {current_user.username} auto-setup Proxmox cluster with {len(created_servers)} nodes")
        
        return {
            "cluster": True,
            "nodes_count": len(created_servers),
            "servers": created_servers,
            "message": f"Добавлено {len(created_servers)} нод кластера"
        }
    else:
        # Одиночный сервер
        server = ProxmoxServer(
            name=name,
            hostname=hostname or ip_address,
            ip_address=ip_address,
            port=port,
            api_user=api_user,
            api_token_name=token_name,
            api_token_value=token_value,
            use_password=token_value is None,
            password=password,
            verify_ssl=verify_ssl,
            description=description,
            is_online=True
        )
        
        db.add(server)
        db.commit()
        db.refresh(server)
        
        logger.info(f"User {current_user.username} auto-setup Proxmox server: {server.name} ({server.ip_address})")
        
        return {
            "cluster": False,
            "id": server.id,
            "name": server.name,
            "hostname": server.hostname,
            "ip_address": server.ip_address,
            "port": server.port,
            "api_user": server.api_user,
            "api_token_name": token_name or "(пароль)",
            "use_password": server.use_password,
            "verify_ssl": server.verify_ssl,
            "description": server.description,
            "is_online": server.is_online
        }


@router.get("/api/servers/{server_id}", response_model=ProxmoxServerResponse)
def get_proxmox_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Получить информацию о конкретном Proxmox сервере"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    return server


@router.get("/api/servers/{server_id}/cluster-info")
def get_server_cluster_info(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
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
        nodes = client.get_nodes() if is_cluster else []
        
        return JSONResponse(content={
            "server_id": server_id,
            "server_name": server.name,
            "is_cluster": is_cluster,
            "node_count": len(nodes),
            "nodes": [n.get('node') for n in nodes] if nodes else []
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
    current_user: User = Depends(PermissionChecker("proxmox.servers.edit"))
):
    """Обновить Proxmox сервер"""
    from ...proxmox_client import clear_server_cache
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    # Если изменились учётные данные - очищаем кеш
    update_data = server_data.model_dump(exclude_unset=True)
    if any(key in update_data for key in ['password', 'api_token_name', 'api_token_value', 'api_user']):
        clear_server_cache(server.ip_address)
        logger.info(f"Cleared cache for server {server.ip_address} due to credential update")
    
    # Update only provided fields
    for field, value in update_data.items():
        setattr(server, field, value)
    
    db.commit()
    db.refresh(server)
    
    logger.info(f"User {current_user.username} updated Proxmox server: {server.name}")
    return server


@router.delete("/api/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proxmox_server(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.servers.delete"))
):
    """Удалить Proxmox сервер и связанные OS Templates"""
    from ...proxmox_client import clear_server_cache
    from ...models import OSTemplate, OSTemplateGroup, VMInstance
    
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
    
    # Очищаем кеш подключений для этого сервера
    clear_server_cache(server_ip)
    
    db.delete(server)
    db.commit()
    return None


@router.post("/api/servers/{server_id}/test", status_code=status.HTTP_200_OK)
def test_proxmox_connection(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
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
            return {"status": "success", "message": "Connection successful"}
        else:
            server.update_status(False, "Failed to connect")
            db.commit()
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
    
    except Exception as e:
        server.update_status(False, str(e))
        db.commit()
        logger.error(f"Error testing Proxmox connection to {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Proxmox Resources ====================

@router.get("/api/{server_id}/resources")
def get_server_resources(
    server_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("vms.view"))
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
        
        server.update_status(True)
        db.commit()
        
        return JSONResponse(content={
            "server_id": server_id,
            "server_name": server.name,
            "vms": vms,
            "containers": containers
        })
    except Exception as e:
        server.update_status(False, str(e))
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error getting resources: {str(e)}")


@router.get("/api/resources/all")
def get_all_resources(
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("vms.view"))
):
    """API для получения всех ресурсов со всех Proxmox серверов"""
    proxmox_servers = db.query(ProxmoxServer).all()
    
    all_resources = {
        "servers": [],
        "total_vms": 0,
        "total_containers": 0
    }
    
    for server in proxmox_servers:
        try:
            logger.info(f"Getting resources from server {server.name} ({server.ip_address}), use_password={server.use_password}")
            # Создаём клиента для каждого сервера независимо
            if server.use_password:
                resources = get_proxmox_resources(
                    host=server.ip_address,
                    user=server.api_user,
                    password=server.password,
                    verify_ssl=server.verify_ssl
                )
            else:
                logger.info(f"Using API token for {server.name}: user={server.api_user}, token_name={server.api_token_name}")
                resources = get_proxmox_resources(
                    host=server.ip_address,
                    user=server.api_user,
                    token_name=server.api_token_name,
                    token_value=server.api_token_value,
                    verify_ssl=server.verify_ssl
                )
            
            vms = resources.get('vms', [])
            containers = resources.get('containers', [])
            
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
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Получить список хранилищ на ноде Proxmox"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        storages = client.get_storages(node)
        
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
    current_user: User = Depends(PermissionChecker("vms.view"))
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
    current_user: User = Depends(PermissionChecker("vms.view"))
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
