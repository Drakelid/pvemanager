from fastapi import APIRouter, Depends, Request, HTTPException, Query, Form, status, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload
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
from ...proxmox import ProxmoxClient, get_proxmox_resources
from ...auth import (get_current_user, PermissionChecker, require_permission,
                     check_permission, authenticate_ws_token)
from ...rbac import PermissionEngine
from ...logging_service import LoggingService
from ...ipam_service import IPAMService
from ._helpers import (check_vm_access, require_vm_access, _get_proxmox_client,
                        get_next_vmid, archive_and_delete_snapshots,
                        save_vm_instance, get_vm_instance, soft_delete_vm_instance)

router = APIRouter()

import time as time_lib
import threading

_live_metrics_cache = {}
_live_metrics_lock = threading.Lock()
METRICS_TTL = 10  # seconds

from ...models import TaskQueue
from ...services.task_queue_service import TaskQueueService, process_task_queue
from ...api.proxmox.tasks import ProxmoxTaskService
from pydantic import BaseModel
from typing import List as TypingList, Optional


class BulkOperationItem(BaseModel):
    server_id: int
    vmid: int
    vm_type: str  # 'qemu' or 'lxc'
    name: str
    node: str


class BulkOperationRequest(BaseModel):
    action: str  # start, stop, restart, shutdown, delete
    items: TypingList[BulkOperationItem]


class VMOwnerUpdate(BaseModel):
    user_id: Optional[int] = None


@router.post("/api/sync-vms")
def sync_vms_now(
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """
    Force immediate synchronization of VMs/containers from all Proxmox servers.
    Useful when you create VMs directly in Proxmox and want them to appear in the panel immediately.
    """
    try:
        from ...workers.monitoring_worker import MonitoringWorker
        
        worker = MonitoringWorker()
        worker.sync_vm_cache()
        
        return JSONResponse(content={
            "status": "success",
            "message": "VM synchronization completed"
        })
    except Exception as e:
        logger.error(f"Manual VM sync failed: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e)
            }
        )


@router.get("/api/virtual-machines")
def get_all_virtual_machines(
    request: Request,
    db: Session = Depends(get_db), 
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """
    API для получения всех VM/LXC в плоском списке для таблицы.
    Данные читаются из локального кэша (таблица vm_instances), который
    обновляется фоновым worker каждые 30 секунд.
    
    Для пользователей с ролью 'user' возвращаются только их собственные инстансы.
    """
    from ...models import VMInstance
    from ...api.workspaces import get_workspace_server_ids

    # Workspace filtering
    workspace_server_ids = get_workspace_server_ids(request, db, current_user)

    # Get servers for name lookup (filtered by workspace)
    servers_q = db.query(ProxmoxServer)
    if workspace_server_ids is not None:
        servers_q = servers_q.filter(ProxmoxServer.id.in_(workspace_server_ids))
    servers = servers_q.all()
    server_map = {s.id: s for s in servers}
    
    # Pre-load IPAM allocations for IP lookup
    ipam_allocations = db.query(IPAMAllocation).filter(
        IPAMAllocation.status.in_(['allocated', 'reserved'])
    ).all()
    
    # Pre-load IPAM networks for network name lookup
    ipam_networks = db.query(IPAMNetwork).all()
    network_map = {n.id: n for n in ipam_networks}
    
    # Build IPAM lookups
    ipam_by_vmid = {}
    ipam_by_name = {}
    
    for alloc in ipam_allocations:
        if alloc.proxmox_server_id and alloc.proxmox_vmid:
            ipam_by_vmid[(alloc.proxmox_server_id, alloc.proxmox_vmid)] = alloc
        elif alloc.resource_id:
            ipam_by_vmid[(None, alloc.resource_id)] = alloc
        if alloc.hostname:
            ipam_by_name[alloc.hostname.lower()] = alloc
        if alloc.resource_name:
            ipam_by_name[alloc.resource_name.lower()] = alloc
    
    # Build base query for cached VMs (not deleted, not templates)
    # joinedload(owner) avoids an N+1 query when rendering the owner column.
    query = db.query(VMInstance).options(joinedload(VMInstance.owner)).filter(
        VMInstance.deleted_at.is_(None),
        VMInstance.is_template == False
    )

    # Workspace filter: only show VMs from servers in the active workspace
    if workspace_server_ids is not None:
        query = query.filter(VMInstance.server_id.in_(workspace_server_ids))
    
    # VPS-style user isolation: users with 'user' role see only their own instances
    # Check if user has 'vm:view' but not 'vms.view:all' (or is user role)
    user_role = current_user.role.name if current_user.role else None
    is_limited_user = user_role == 'user'
    
    # Also check permission-based isolation
    if hasattr(current_user, 'role') and current_user.role:
        perms = current_user.role.permissions or {}
        # If user has vms:view:own but not vms:view (full), filter by owner
        has_view_own = perms.get('vms:view:own', False) or perms.get('vms.view.own', False)
        has_view_all = perms.get('vms:view', False) or perms.get('vm:view', False)
        
        # Limited users can only see their own VMs
        if is_limited_user or (has_view_own and not has_view_all):
            query = query.filter(VMInstance.owner_id == current_user.id)
    
    cached_vms = query.order_by(VMInstance.name).all()

    # ── Live metrics from Proxmox cluster/resources (CPU, RAM, disk, uptime) ──
    # One HTTP call per cluster returns metrics for all VMs/LXC.
    # Map: (server_id_in_db, vmid) -> live data dict
    live_metrics: dict[tuple[int, int], dict] = {}
    
    with _live_metrics_lock:
        now = time_lib.time()
        for server in servers:
            cache_key = server.id
            if cache_key in _live_metrics_cache and (now - _live_metrics_cache[cache_key]['time']) < METRICS_TTL:
                # Use cached metrics
                for vmid, res in _live_metrics_cache[cache_key]['data'].items():
                    live_metrics[(server.id, vmid)] = res
                continue
                
            try:
                client = _get_proxmox_client(server)
                if not client.is_connected():
                    continue
                
                server_metrics = {}
                for res in client.get_cluster_resources(type_='vm'):
                    vmid = res.get('vmid')
                    if vmid is None:
                        continue
                    live_metrics[(server.id, vmid)] = res
                    server_metrics[vmid] = res
                    
                _live_metrics_cache[cache_key] = {
                    'time': now,
                    'data': server_metrics
                }
            except Exception as e:
                logger.debug(f"Could not fetch live metrics from {server.name}: {e}")

    result = []
    
    # Detect cluster servers (servers with hostnames pve1, pve2, pve3 pattern)
    # For cluster servers, show cluster name based on node, not server_id
    cluster_nodes = {}  # node_name -> server
    for server in servers:
        # Match node name to server by hostname (e.g., 'pve1', 'pve2')
        if server.hostname:
            cluster_nodes[server.hostname.lower()] = server
    
    for vm in cached_vms:
        server = server_map.get(vm.server_id)
        server_name = server.name if server else "Unknown"
        
        # For cluster VMs, try to show the correct server based on node name
        node_lower = vm.node.lower() if vm.node else ""
        if node_lower in cluster_nodes:
            actual_server = cluster_nodes[node_lower]
            server_name = actual_server.name
        
        # Get IP from IPAM or cache
        ipam_alloc = (
            ipam_by_vmid.get((vm.server_id, vm.vmid)) or 
            ipam_by_vmid.get((None, vm.vmid)) or
            ipam_by_name.get(vm.name.lower())
        )
        
        ip_address = ipam_alloc.ip_address if ipam_alloc else (vm.ip_address or "")
        ip_hostname = ipam_alloc.hostname if ipam_alloc else ""
        owner = ipam_alloc.allocated_by if ipam_alloc else ""
        
        # Get network name from IPAM
        ip_network_name = ""
        if ipam_alloc and ipam_alloc.network_id:
            network = network_map.get(ipam_alloc.network_id)
            if network:
                ip_network_name = network.name
        
        # OS type - prefer template_name, fallback to os_type
        os_template = vm.template_name or vm.os_type or ("QEMU/KVM" if vm.vm_type == "qemu" else "Linux")
        if not vm.template_name and vm.vm_type == "lxc" and os_template:
            os_template = os_template.capitalize()

        # Live metrics (cpu/mem/disk/uptime/net) from cluster/resources
        live = live_metrics.get((vm.server_id, vm.vmid)) or {}

        result.append({
            "server_id": vm.server_id,
            "server_name": server_name,
            "cluster": server_name,
            "vmid": vm.vmid,
            "name": vm.name,
            "hostname": ip_hostname or f"{'vps' if vm.vm_type == 'qemu' else 'lxc'}{vm.vmid}.{server.hostname if server else 'local'}",
            "type": vm.vm_type,
            "status": live.get('status') or vm.status or "unknown",
            "lock": live.get('lock') or None,
            "node": vm.node,
            "cores": vm.cores or 0,
            "memory": vm.memory or 0,
            "disk": live.get('disk') or 0,
            "ip": ip_address,
            "ip_address": ip_address,
            "ip_hostname": ip_network_name,
            "os": os_template,
            "os_template": os_template,
            "owner": owner,
            "owner_user": (
                {
                    "username": vm.owner.username,
                    "email": vm.owner.email,
                    "full_name": vm.owner.full_name,
                }
                if vm.owner else None
            ),
            "owner_hostname": "",
            "storage": "Storage1 (DIR)",
            "tags": vm.tags or "",
            # Live runtime metrics
            "cpu": live.get('cpu'),
            "mem": live.get('mem'),
            "maxmem": live.get('maxmem') or vm.memory or 0,
            "maxdisk": live.get('maxdisk') or vm.disk_size or 0,
            "uptime": live.get('uptime'),
            "netin": live.get('netin'),
            "netout": live.get('netout'),
        })
    
    return JSONResponse(content=result)


# ==================== VM/Container Control ====================

@router.post("/api/{server_id}/vm/{vmid}/execute")
def execute_vm_command(
    server_id: int,
    vmid: int,
    node: str,
    command: str = Query(..., description="Команда для выполнения"),
    timeout: int = Query(30, ge=1, le=300, description="Таймаут в секундах"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """
    Выполнить команду на VM через QEMU guest agent
    
    Примеры команд:
    - ls -la /tmp
    - df -h
    - free -m
    - systemctl status nginx
    """
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        result = client.execute_command(node, vmid, command, timeout)
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error executing command on VM {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/vm/{vmid}/execute-script")
def execute_vm_script(
    server_id: int,
    vmid: int,
    node: str = Query(..., description="Имя ноды Proxmox"),
    script: str = Form(..., description="Содержимое bash скрипта"),
    interpreter: str = Form("/bin/bash", description="Путь к интерпретатору"),
    timeout: int = Query(60, ge=1, le=600, description="Таймаут в секундах"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """
    Выполнить bash скрипт на VM через QEMU guest agent
    
    Скрипт будет сохранен во временный файл на VM и выполнен.
    После выполнения временный файл будет удален.
    """
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        result = client.execute_script(node, vmid, script, interpreter, timeout)
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Error executing script on VM {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Specific VM/Container Actions (must be registered BEFORE generic {action} routes) ====================

class CloneRequest(BaseModel):
    new_name: str
    full: bool = True
    target_node: Optional[str] = None
    target_storage: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[int] = None


def _resolve_clone_owner(db: Session, current_user: User, owner_id: Optional[int]) -> int:
    """Resolve the owner for a cloned instance (admins may assign to others)."""
    if owner_id and owner_id != current_user.id:
        is_admin = current_user.has_permission("user:manage") or current_user.is_admin
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can assign instance to another user")
        owner = db.query(User).filter(User.id == owner_id).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner user not found")
        return owner.id
    return current_user.id


class ChangePasswordRequest(BaseModel):
    username: str = "root"
    password: str


def _resolve_server(db: Session, server_id: int) -> ProxmoxServer:
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    return server


def _get_client_or_503(server: ProxmoxServer):
    client = _get_proxmox_client(server)
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
    return client


# -------- Clone --------

@router.post("/api/{server_id}/vm/{vmid}/clone", status_code=202)
def clone_vm_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    body: CloneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:create"))
):
    """Клонировать существующую VM (qemu) — фоновая задача."""
    from ...models import DeployTask
    from ..templates import _deploy_executor, DeployTaskStartResponse
    from .async_ops import _do_clone_sync

    require_vm_access(db, current_user, server_id, vmid)
    _resolve_server(db, server_id)
    owner_id = _resolve_clone_owner(db, current_user, body.owner_id)

    task = DeployTask(
        kind='clone', name=body.new_name, status='pending', step='В очереди...', progress=0,
        template_id=None, server_id=server_id, user_id=current_user.id, node=node,
    )
    db.add(task); db.commit(); db.refresh(task)

    _deploy_executor.submit(
        _do_clone_sync, task.id, server_id, vmid, node, 'qemu',
        body.new_name, body.full, body.target_node, body.target_storage, body.description,
        current_user.id, current_user.username, owner_id,
    )
    return DeployTaskStartResponse(task_id=task.id, status='pending', name=body.new_name)


@router.post("/api/{server_id}/container/{vmid}/clone", status_code=202)
def clone_container_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    body: CloneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:create"))
):
    """Клонировать существующий LXC контейнер — фоновая задача."""
    from ...models import DeployTask
    from ..templates import _deploy_executor, DeployTaskStartResponse
    from .async_ops import _do_clone_sync

    require_vm_access(db, current_user, server_id, vmid)
    _resolve_server(db, server_id)
    owner_id = _resolve_clone_owner(db, current_user, body.owner_id)

    task = DeployTask(
        kind='clone', name=body.new_name, status='pending', step='В очереди...', progress=0,
        template_id=None, server_id=server_id, user_id=current_user.id, node=node,
    )
    db.add(task); db.commit(); db.refresh(task)

    _deploy_executor.submit(
        _do_clone_sync, task.id, server_id, vmid, node, 'lxc',
        body.new_name, body.full, body.target_node, body.target_storage, body.description,
        current_user.id, current_user.username, owner_id,
    )
    return DeployTaskStartResponse(task_id=task.id, status='pending', name=body.new_name)


# -------- Reinstall (re-clone from saved template) --------

@router.post("/api/{server_id}/vm/{vmid}/reinstall", status_code=202)
def reinstall_vm_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:delete"))
):
    """Переустановить VM/LXC из исходного шаблона — фоновая задача."""
    from ...models import DeployTask, OSTemplate
    from ..templates import _deploy_executor, DeployTaskStartResponse
    from .async_ops import _do_reinstall_sync

    require_vm_access(db, current_user, server_id, vmid)
    _resolve_server(db, server_id)

    cached = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None),
    ).first()
    if not cached:
        raise HTTPException(status_code=404, detail="VM not found")

    is_lxc = (cached.vm_type == 'lxc')
    tpl = None
    if cached.template_id:
        tpl = db.query(OSTemplate).filter(OSTemplate.id == cached.template_id).first()
        if not tpl or not tpl.vmid:
            raise HTTPException(status_code=400, detail="Template not found or invalid")
    elif is_lxc and cached.template_name and ':' in cached.template_name:
        # LXC created from CT template file (e.g. local:vztmpl/debian-13-...tar.zst)
        tpl = None
    else:
        raise HTTPException(status_code=400, detail="VM has no associated template; reinstall is not available")

    task = DeployTask(
        kind='reinstall', name=cached.name, status='pending', step='В очереди...', progress=0,
        template_id=tpl.id if tpl else None, server_id=server_id, user_id=current_user.id,
        vmid=vmid, node=node,
    )
    db.add(task); db.commit(); db.refresh(task)

    _deploy_executor.submit(
        _do_reinstall_sync, task.id, server_id, vmid, node,
        current_user.id, current_user.username,
    )
    return DeployTaskStartResponse(task_id=task.id, status='pending', name=cached.name)


# -------- Change Password --------

@router.post("/api/{server_id}/vm/{vmid}/change-password", status_code=202)
def change_vm_password_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Сменить пароль на VM через QEMU guest agent — фоновая задача."""
    from ...models import DeployTask
    from ..templates import _deploy_executor, DeployTaskStartResponse
    from .async_ops import _do_change_password_sync

    require_vm_access(db, current_user, server_id, vmid)
    _resolve_server(db, server_id)
    if not body.password or len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")

    cached = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None),
    ).first()
    name = cached.name if cached else f"VM {vmid}"

    task = DeployTask(
        kind='change_password', name=name, status='pending', step='В очереди...', progress=0,
        template_id=None, server_id=server_id, user_id=current_user.id,
        vmid=vmid, node=node,
    )
    db.add(task); db.commit(); db.refresh(task)

    _deploy_executor.submit(
        _do_change_password_sync, task.id, server_id, vmid, node, 'qemu',
        body.username, body.password, current_user.id, current_user.username,
    )
    return DeployTaskStartResponse(task_id=task.id, status='pending', name=name)


@router.post("/api/{server_id}/container/{vmid}/change-password", status_code=202)
def change_container_password_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Сменить пароль в LXC через pct exec/chpasswd — фоновая задача."""
    from ...models import DeployTask
    from ..templates import _deploy_executor, DeployTaskStartResponse
    from .async_ops import _do_change_password_sync

    require_vm_access(db, current_user, server_id, vmid)
    _resolve_server(db, server_id)
    if not body.password or len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")

    cached = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None),
    ).first()
    name = cached.name if cached else f"CT {vmid}"

    task = DeployTask(
        kind='change_password', name=name, status='pending', step='В очереди...', progress=0,
        template_id=None, server_id=server_id, user_id=current_user.id,
        vmid=vmid, node=node,
    )
    db.add(task); db.commit(); db.refresh(task)

    _deploy_executor.submit(
        _do_change_password_sync, task.id, server_id, vmid, node, 'lxc',
        body.username, body.password, current_user.id, current_user.username,
    )
    return DeployTaskStartResponse(task_id=task.id, status='pending', name=name)


# ==================== Generic VM/Container Action Handler ====================

@router.post("/api/{server_id}/vm/{vmid}/{action}")
def control_vm(
    server_id: int, 
    vmid: int, 
    action: str, 
    node: str,
    force: int = 0,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Управление VM (start/stop/restart/shutdown)"""
    if action not in ['start', 'stop', 'restart', 'shutdown']:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Проверка прав в зависимости от действия
    permission_map = {
        'start': 'vm:start',
        'stop': 'vm:stop',
        'shutdown': 'vm:stop',
        'restart': 'vm:restart',
    }
    if not current_user.has_permission(permission_map[action]):
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: {permission_map[action]}"
        )
    
    # VPS-style user isolation: check VM ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        # Get VM name for logging
        vm_name = None
        try:
            vm_status = client.get_vm_status(node, vmid)
            vm_name = vm_status.get('name') if isinstance(vm_status, dict) else None
        except Exception:
            pass
        
        upid = None
        if action == 'start':
            upid = client.start_vm(node, vmid)
            success = bool(upid)
        elif action == 'stop':
            if force:
                success = client.force_stop_vm(node, vmid)
            else:
                upid = client.stop_vm(node, vmid, force=False)
                success = bool(upid)
        elif action == 'shutdown':
            upid = client.shutdown_vm(node, vmid)
            success = bool(upid)
        else:  # restart
            upid = client.restart_vm(node, vmid)
            success = bool(upid)

        action_name = 'kill' if action == 'stop' and force else action
        if success:
            # Immediately update vm_instances cache so page refresh returns correct status
            expected_status = 'running' if action in ('start', 'restart') else 'stopped'
            try:
                cached_vm = db.query(VMInstance).filter(
                    VMInstance.server_id == server_id,
                    VMInstance.vmid == vmid,
                    VMInstance.deleted_at.is_(None)
                ).first()
                if cached_vm:
                    cached_vm.status = expected_status
                    db.commit()
            except Exception as _ce:
                logger.warning(f"Failed to update VM {vmid} status cache: {_ce}")
                db.rollback()
            # Register ProxmoxTask for UPID-based tracking
            if upid:
                _desc_map = {
                    'start': f"Запуск VM {vm_name or vmid}",
                    'stop': f"Остановка VM {vm_name or vmid}",
                    'restart': f"Перезапуск VM {vm_name or vmid}",
                }
                try:
                    ProxmoxTaskService.register(
                        db=db, upid=upid, server_id=server_id,
                        user_id=current_user.id, action=action_name,
                        node=node, vmid=vmid, vm_type='qemu',
                        description=_desc_map.get(action, action_name),
                    )
                except Exception as _te:
                    logger.warning(f"Failed to register ProxmoxTask for VM {vmid} {action_name}: {_te}")
            # Log successful action
            LoggingService.log_proxmox_action(
                db=db,
                action=action_name,
                resource_type="vm",
                resource_id=vmid,
                username=current_user.username,
                resource_name=vm_name,
                server_id=server_id,
                server_name=server.name,
                node_name=node,
                details={"force": force},
                success=True
            )
            logger.info(f"User {current_user.username} executed {action_name} on VM {vmid} at {server.name}")
            return JSONResponse(content={"status": "success", "action": action_name, "vmid": vmid, "node": node, "upid": upid})
        else:
            # Log failed action
            LoggingService.log_proxmox_action(
                db=db,
                action=action_name,
                resource_type="vm",
                resource_id=vmid,
                username=current_user.username,
                resource_name=vm_name,
                server_id=server_id,
                server_name=server.name,
                node_name=node,
                details={"force": force},
                success=False,
                error_message="Failed to execute action"
            )
            raise HTTPException(status_code=500, detail="Failed to execute action")
    except HTTPException:
        raise
    except Exception as e:
        # Log error
        LoggingService.log_proxmox_action(
            db=db,
            action=action,
            resource_type="vm",
            resource_id=vmid,
            username=current_user.username,
            server_id=server_id if server else None,
            server_name=server.name if server else None,
            node_name=node,
            details={"force": force},
            success=False,
            error_message=str(e)
        )
        logger.error(f"Error controlling VM {vmid} on {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/{server_id}/vm/{vmid}")
async def delete_vm(
    request: Request,
    server_id: int,
    vmid: int,
    node: str,
    force: bool = Query(False, description="Force delete without saving config"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:delete"))
):
    """Удалить VM"""
    from ...i18n import t
    lang = request.cookies.get("language", "en")
    
    # VPS-style user isolation: check VM ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail=t("server_not_found", lang))
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail=t("failed_to_connect", lang))
        
        # Auto-stop running VM before destroy (user already typed the name to confirm)
        status = client.get_vm_status(node, vmid)
        if status and isinstance(status, dict) and status.get('status') == 'running':
            logger.info(f"VM {vmid} is running, stopping before delete...")
            try:
                client.stop_vm(node, vmid, force=True)
            except Exception as _se:
                logger.warning(f"stop_vm({vmid}) failed: {_se}")
            for _ in range(30):
                await asyncio.sleep(0.5)
                st = client.get_vm_status(node, vmid)
                if not st or not isinstance(st, dict) or st.get('status') != 'running':
                    break
            else:
                raise HTTPException(status_code=400, detail=t("cannot_delete_running_vm", lang))
        
        # Сохраняем конфигурацию VM в базу перед удалением (если не force)
        if not force:
            config = client.get_vm_config(node, vmid)
            interfaces = client.get_vm_interfaces(node, vmid)
            
            # Проверяем что config - это словарь
            if not isinstance(config, dict):
                config = {}
            
            # Извлекаем IP адрес из интерфейсов
            ip_address = None
            ip_prefix = 24
            if interfaces and isinstance(interfaces, list):
                for iface in interfaces:
                    if isinstance(iface, dict) and iface.get('ips'):
                        for ip_info in iface['ips']:
                            if isinstance(ip_info, dict) and ip_info.get('type') == 'ipv4':
                                ip_address = ip_info.get('address')
                                ip_prefix = ip_info.get('prefix', 24)
                                break
                    if ip_address:
                        break
            
            # Сохраняем в базу
            try:
                bootdisk = config.get('bootdisk', 'scsi0')
                disk_info = config.get(bootdisk, {})
                disk_size = None
                if isinstance(disk_info, dict):
                    size_str = disk_info.get('size', '0G')
                    disk_size = int(size_str.replace('G', '')) if isinstance(size_str, str) else None
                
                save_vm_instance(
                    db=db,
                    server_id=server_id,
                    vmid=vmid,
                    node=node,
                    vm_type='qemu',
                    name=config.get('name', f'VM-{vmid}'),
                    cores=config.get('cores'),
                    memory=config.get('memory'),
                    disk_size=disk_size,
                    ip_address=ip_address,
                    ip_prefix=ip_prefix,
                    description=config.get('description')
                )
                logger.info(f"Saved VM {vmid} configuration before deletion")
            except Exception as e:
                logger.warning(f"Failed to save VM config before deletion: {e}")
        
        # Archive and delete snapshots before deleting VM
        vm_name = status.get('name') if isinstance(status, dict) else f'VM-{vmid}'
        snapshot_result = archive_and_delete_snapshots(
            db=db,
            client=client,
            server_id=server_id,
            server_name=server.name,
            vmid=vmid,
            vm_name=vm_name,
            vm_type='qemu',
            node=node,
            deleted_by=current_user.username,
            deletion_reason=f"VM {vmid} deleted by {current_user.username}"
        )
        
        if snapshot_result["archived"] > 0:
            logger.info(f"Archived {snapshot_result['archived']} snapshots before deleting VM {vmid}")
        if snapshot_result["errors"]:
            logger.warning(f"Snapshot cleanup errors for VM {vmid}: {snapshot_result['errors']}")
        
        # Удаляем VM
        result = client.delete_vm(node, vmid)
        if result:
            # Освобождаем IP в IPAM (если есть)
            try:
                ipam = IPAMService(db)
                released, released_ip = ipam.release_ip_by_vmid(
                    proxmox_server_id=server_id,
                    proxmox_vmid=vmid,
                    released_by=current_user.username,
                    reason=f"VM {vmid} deleted"
                )
                if released:
                    logger.info(f"Auto-released IPAM allocation for IP {released_ip} after VM {vmid} deletion")
            except Exception as e:
                logger.warning(f"Failed to release IPAM allocation for VM {vmid}: {e}")
            
            # Register ProxmoxTask for delete tracking
            try:
                from datetime import datetime, timezone as _tz
                _ptask = ProxmoxTaskService.register(
                    db=db, upid=f"delete-vm-{vmid}-{server_id}", server_id=server_id,
                    user_id=current_user.id, action='delete',
                    node=node, vmid=vmid, vm_type='qemu',
                    description=f"Удаление VM {vm_name or vmid}",
                )
                _ptask.status = 'completed'
                _ptask.exit_status = 'OK'
                _ptask.completed_at = datetime.now(_tz.utc)
                db.commit()
            except Exception as _te:
                logger.warning(f"Failed to register ProxmoxTask for VM {vmid} delete: {_te}")
            # Log successful deletion
            LoggingService.log_proxmox_action(
                db=db,
                action="delete",
                resource_type="vm",
                resource_id=vmid,
                username=current_user.username,
                resource_name=vm_name,
                server_id=server_id,
                server_name=server.name,
                node_name=node,
                details={
                    "force": force,
                    "snapshots_archived": snapshot_result["archived"],
                    "snapshots_deleted": snapshot_result["deleted"],
                    "snapshot_names": snapshot_result["snapshots"]
                },
                success=True
            )
            logger.info(f"User {current_user.username} deleted VM {vmid} on {server.name}")
            return JSONResponse(content={
                "status": "success", 
                "message": f"VM {vmid} удалена",
                "snapshots_archived": snapshot_result["archived"],
                "snapshots_deleted": snapshot_result["deleted"]
            })
        else:
            LoggingService.log_proxmox_action(
                db=db,
                action="delete",
                resource_type="vm",
                resource_id=vmid,
                username=current_user.username,
                server_id=server_id,
                server_name=server.name,
                node_name=node,
                success=False,
                error_message="Не удалось удалить VM"
            )
            raise HTTPException(status_code=500, detail="Не удалось удалить VM")
    except HTTPException:
        raise
    except Exception as e:
        LoggingService.log_proxmox_action(
            db=db,
            action="delete",
            resource_type="vm",
            resource_id=vmid,
            username=current_user.username,
            server_id=server_id if server else None,
            server_name=server.name if server else None,
            node_name=node,
            success=False,
            error_message=str(e)
        )
        logger.error(f"Error deleting VM {vmid} on {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== High Availability (HA) Endpoints ====================

@router.get("/api/{server_id}/ha/status")
def get_ha_status(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить статус HA кластера и список ресурсов в HA"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        is_cluster = client.is_cluster()
        ha_resources = client.get_ha_resources() if is_cluster else []
        ha_groups = client.get_ha_groups() if is_cluster else []
        
        return JSONResponse(content={
            "server_id": server_id,
            "is_cluster": is_cluster,
            "ha_enabled": is_cluster,
            "resources": ha_resources,
            "groups": ha_groups
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting HA status for {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/ha/{vm_type}/{vmid}")
def get_resource_ha_status(
    server_id: int,
    vm_type: str,
    vmid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить HA статус конкретной VM или контейнера"""
    if vm_type not in ['vm', 'ct']:
        raise HTTPException(status_code=400, detail="vm_type must be 'vm' or 'ct'")
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        is_cluster = client.is_cluster()
        
        if not is_cluster:
            return JSONResponse(content={
                "vmid": vmid,
                "vm_type": vm_type,
                "is_cluster": False,
                "ha_available": False,
                "in_ha": False
            })
        
        ha_status = client.get_ha_status(vmid, vm_type)
        
        return JSONResponse(content={
            "vmid": vmid,
            "vm_type": vm_type,
            "is_cluster": True,
            "ha_available": True,
            **ha_status
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting HA status for {vm_type}:{vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/ha/{vm_type}/{vmid}/add")
def add_resource_to_ha(
    server_id: int,
    vm_type: str,
    vmid: int,
    group: str = Query(None, description="HA group name"),
    max_restart: int = Query(1, description="Max restart attempts"),
    max_relocate: int = Query(1, description="Max relocate attempts"),
    state: str = Query("started", description="Target state: started, stopped, enabled, disabled, ignored"),
    comment: str = Query(None, description="Comment"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Добавить VM или контейнер в HA"""
    if vm_type not in ['vm', 'ct']:
        raise HTTPException(status_code=400, detail="vm_type must be 'vm' or 'ct'")
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        # Проверяем что это кластер
        if not client.is_cluster():
            raise HTTPException(status_code=400, detail="HA is only available in cluster mode")
        
        result = client.add_to_ha(
            vmid=vmid,
            vm_type=vm_type,
            group=group,
            max_restart=max_restart,
            max_relocate=max_relocate,
            state=state,
            comment=comment
        )
        
        if result.get('success'):
            # Log action
            resource_type = "vm" if vm_type == "vm" else "container"
            LoggingService.log_proxmox_action(
                db=db,
                action="add_to_ha",
                resource_type=resource_type,
                resource_id=vmid,
                username=current_user.username,
                server_id=server_id,
                server_name=server.name,
                details={"group": group, "state": state},
                success=True
            )
            logger.info(f"User {current_user.username} added {vm_type}:{vmid} to HA on {server.name}")
            return JSONResponse(content=result)
        else:
            if result.get('already_in_ha'):
                raise HTTPException(status_code=409, detail="Resource is already in HA")
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to add to HA'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding {vm_type}:{vmid} to HA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/{server_id}/ha/{vm_type}/{vmid}/remove")
def remove_resource_from_ha(
    server_id: int,
    vm_type: str,
    vmid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Удалить VM или контейнер из HA"""
    if vm_type not in ['vm', 'ct']:
        raise HTTPException(status_code=400, detail="vm_type must be 'vm' or 'ct'")
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        result = client.remove_from_ha(vmid, vm_type)
        
        if result.get('success'):
            # Log action
            resource_type = "vm" if vm_type == "vm" else "container"
            LoggingService.log_proxmox_action(
                db=db,
                action="remove_from_ha",
                resource_type=resource_type,
                resource_id=vmid,
                username=current_user.username,
                server_id=server_id,
                server_name=server.name,
                success=True
            )
            logger.info(f"User {current_user.username} removed {vm_type}:{vmid} from HA on {server.name}")
            return JSONResponse(content=result)
        else:
            if result.get('not_in_ha'):
                raise HTTPException(status_code=404, detail="Resource is not in HA")
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to remove from HA'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing {vm_type}:{vmid} from HA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/{server_id}/container/{vmid}")
async def delete_container(
    request: Request,
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:delete"))
):
    """Удалить LXC контейнер"""
    from ...i18n import t
    lang = request.cookies.get("language", "en")
    
    # VPS-style user isolation: check container ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail=t("server_not_found", lang))
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail=t("failed_to_connect", lang))
        
        # Auto-stop running container before destroy (user already typed the name to confirm)
        status = client.get_container_status(node, vmid)
        if status and isinstance(status, dict) and status.get('status') == 'running':
            logger.info(f"Container {vmid} is running, stopping before delete...")
            try:
                client.stop_container(node, vmid, force=True)
            except Exception as _se:
                logger.warning(f"stop_container({vmid}) failed: {_se}")
            # Wait up to 15s for it to actually stop
            for _ in range(30):
                await asyncio.sleep(0.5)
                st = client.get_container_status(node, vmid)
                if not st or not isinstance(st, dict) or st.get('status') != 'running':
                    break
            else:
                raise HTTPException(status_code=400, detail=t("cannot_delete_running_container", lang))
        
        # Archive and delete snapshots before deleting container
        container_name = status.get('name') if isinstance(status, dict) else f'CT-{vmid}'
        snapshot_result = archive_and_delete_snapshots(
            db=db,
            client=client,
            server_id=server_id,
            server_name=server.name,
            vmid=vmid,
            vm_name=container_name,
            vm_type='lxc',
            node=node,
            deleted_by=current_user.username,
            deletion_reason=f"Container {vmid} deleted by {current_user.username}"
        )
        
        if snapshot_result["archived"] > 0:
            logger.info(f"Archived {snapshot_result['archived']} snapshots before deleting container {vmid}")
        if snapshot_result["errors"]:
            logger.warning(f"Snapshot cleanup errors for container {vmid}: {snapshot_result['errors']}")
        
        # Удаляем контейнер
        result = client.delete_container(node, vmid)
        if result:
            # Освобождаем IP в IPAM (если есть)
            try:
                ipam = IPAMService(db)
                released, released_ip = ipam.release_ip_by_vmid(
                    proxmox_server_id=server_id,
                    proxmox_vmid=vmid,
                    released_by=current_user.username,
                    reason=f"Container {vmid} deleted"
                )
                if released:
                    logger.info(f"Auto-released IPAM allocation for IP {released_ip} after container {vmid} deletion")
            except Exception as e:
                logger.warning(f"Failed to release IPAM allocation for container {vmid}: {e}")

            # Register ProxmoxTask for delete tracking
            try:
                ProxmoxTaskService.register(
                    db=db, upid=f"delete-ct-{vmid}-{server_id}", server_id=server_id,
                    user_id=current_user.id, action='delete',
                    node=node, vmid=vmid, vm_type='lxc',
                    description=f"Удаление LXC {container_name or vmid}",
                )
            except Exception as _te:
                logger.warning(f"Failed to register ProxmoxTask for container {vmid} delete: {_te}")
            # Log deletion with snapshot info
            LoggingService.log_proxmox_action(
                db=db,
                action="delete",
                resource_type="container",
                resource_id=vmid,
                username=current_user.username,
                resource_name=container_name,
                server_id=server_id,
                server_name=server.name,
                node_name=node,
                details={
                    "snapshots_archived": snapshot_result["archived"],
                    "snapshots_deleted": snapshot_result["deleted"],
                    "snapshot_names": snapshot_result["snapshots"]
                },
                success=True
            )
            
            logger.info(f"User {current_user.username} deleted container {vmid} on {server.name}")
            return JSONResponse(content={
                "status": "success", 
                "message": f"Контейнер {vmid} удалён",
                "snapshots_archived": snapshot_result["archived"],
                "snapshots_deleted": snapshot_result["deleted"]
            })
        else:
            raise HTTPException(status_code=500, detail="Не удалось удалить контейнер")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting container {vmid} on {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/vm/{vmid}/config")
def get_vm_config(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить конфигурацию VM"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        config = client.get_vm_config(node, vmid)
        return JSONResponse(content=config)
    except Exception as e:
        logger.error(f"Error getting VM {vmid} config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/{server_id}/vm/{vmid}/config")
async def update_vm_config(
    server_id: int,
    vmid: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Обновить конфигурацию VM (CPU, Memory, etc.)"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    data = await request.json()
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        success = client.update_vm_config(node, vmid, data)
        if success:
            logger.info(f"User {current_user.username} updated VM {vmid} config on {server.name}")
            return JSONResponse(content={"status": "success", "message": "Конфигурация обновлена"})
        else:
            raise HTTPException(status_code=500, detail="Не удалось обновить конфигурацию")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating VM {vmid} config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/vm/{vmid}/disk/resize")
async def resize_vm_disk(
    server_id: int,
    vmid: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Изменить размер диска VM"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        data = await request.json()
        disk = data.get('disk')
        size = data.get('size')
        
        if not disk or not size:
            raise HTTPException(status_code=400, detail="Требуются параметры disk и size")
        
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        success = client.resize_vm_disk(node, vmid, disk, size)
        if success:
            # Обновляем размер диска в базе данных
            vm_instance = get_vm_instance(db, server_id, vmid)
            if vm_instance:
                # Конвертируем размер в GB (размер приходит как "32G")
                size_gb = int(size.rstrip('GMgm').strip())
                vm_instance.disk_size = size_gb
                vm_instance.updated_at = func.now()
                db.commit()
                logger.info(f"Updated disk size in database: VM {vmid} -> {size_gb}GB")
            
            logger.info(f"User {current_user.username} resized disk {disk} of VM {vmid} to {size}")
            return JSONResponse(content={
                "status": "success", 
                "message": f"Размер диска {disk} изменен на {size}. Для применения изменений внутри ОС выполните resize файловой системы."
            })
        else:
            raise HTTPException(status_code=500, detail="Не удалось изменить размер диска")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resizing VM {vmid} disk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/container/{vmid}/disk/resize")
async def resize_container_disk(
    server_id: int,
    vmid: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Изменить размер диска контейнера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        data = await request.json()
        disk = data.get('disk', 'rootfs')
        size = data.get('size')
        
        if not size:
            raise HTTPException(status_code=400, detail="Требуется параметр size")
        
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        success = client.resize_container_disk(node, vmid, disk, size)
        if success:
            # Обновляем размер диска в базе данных
            vm_instance = get_vm_instance(db, server_id, vmid)
            if vm_instance:
                # Конвертируем размер в GB (размер приходит как "32G")
                size_gb = int(size.rstrip('GMgm').strip())
                vm_instance.disk_size = size_gb
                vm_instance.updated_at = func.now()
                db.commit()
                logger.info(f"Updated disk size in database: Container {vmid} -> {size_gb}GB")
            
            # Перезапускаем контейнер для применения изменений
            restart_success = client.restart_container(node, vmid)
            if restart_success:
                logger.info(f"Container {vmid} restarted to apply disk resize")
            
            logger.info(f"User {current_user.username} resized disk {disk} of container {vmid} to {size}")
            return JSONResponse(content={
                "status": "success", 
                "message": f"Размер диска {disk} изменен на {size}. Контейнер перезапускается для применения изменений."
            })
        else:
            raise HTTPException(status_code=500, detail="Не удалось изменить размер диска")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resizing container {vmid} disk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/config")
def get_container_config(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить конфигурацию LXC контейнера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        config = client.get_container_config(node, vmid)
        return JSONResponse(content=config)
    except Exception as e:
        logger.error(f"Error getting container {vmid} config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/{server_id}/container/{vmid}/config")
async def update_container_config(
    server_id: int,
    vmid: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Обновить конфигурацию LXC контейнера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    data = await request.json()
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        success = client.update_container_config(node, vmid, data)
        if success:
            logger.info(f"User {current_user.username} updated container {vmid} config on {server.name}")
            return JSONResponse(content={"status": "success", "message": "Конфигурация обновлена"})
        else:
            raise HTTPException(status_code=500, detail="Не удалось обновить конфигурацию")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating container {vmid} config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/container/{vmid}/{action}")
def control_container(
    server_id: int, 
    vmid: int, 
    action: str, 
    node: str,
    force: int = 0,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Управление LXC контейнером (start/stop/restart/shutdown)"""
    if action not in ['start', 'stop', 'restart', 'shutdown']:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Проверка прав в зависимости от действия
    permission_map = {
        'start': 'vm:start',
        'stop': 'vm:stop',
        'shutdown': 'vm:stop',
        'restart': 'vm:restart',
    }
    require_permission(current_user, permission_map[action])
    
    # VPS-style user isolation: check container ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        upid = None
        if action == 'start':
            upid = client.start_container(node, vmid)
            success = bool(upid)
        elif action == 'stop':
            if force:
                success = client.force_stop_container(node, vmid)
            else:
                upid = client.stop_container(node, vmid, force=False)
                success = bool(upid)
        elif action == 'shutdown':
            upid = client.shutdown_container(node, vmid)
            success = bool(upid)
        else:  # restart
            upid = client.restart_container(node, vmid)
            success = bool(upid)

        action_name = 'kill' if action == 'stop' and force else action
        if success:
            # Immediately update vm_instances cache so page refresh returns correct status
            expected_status = 'running' if action in ('start', 'restart') else 'stopped'
            try:
                cached_ct = db.query(VMInstance).filter(
                    VMInstance.server_id == server_id,
                    VMInstance.vmid == vmid,
                    VMInstance.deleted_at.is_(None)
                ).first()
                if cached_ct:
                    cached_ct.status = expected_status
                    db.commit()
            except Exception as _ce:
                logger.warning(f"Failed to update LXC {vmid} status cache: {_ce}")
                db.rollback()
            # Register ProxmoxTask for UPID-based tracking
            if upid:
                _desc_map = {
                    'start': f"Запуск LXC {vmid}",
                    'stop': f"Остановка LXC {vmid}",
                    'restart': f"Перезапуск LXC {vmid}",
                }
                try:
                    ProxmoxTaskService.register(
                        db=db, upid=upid, server_id=server_id,
                        user_id=current_user.id, action=action_name,
                        node=node, vmid=vmid, vm_type='lxc',
                        description=_desc_map.get(action, action_name),
                    )
                except Exception as _te:
                    logger.warning(f"Failed to register ProxmoxTask for LXC {vmid} {action_name}: {_te}")
            logger.info(f"User {current_user.username} executed {action_name} on container {vmid} at {server.name}")
            return JSONResponse(content={"status": "success", "action": action_name, "vmid": vmid, "node": node, "upid": upid})
        else:
            raise HTTPException(status_code=500, detail="Failed to execute action")
    except Exception as e:
        logger.error(f"Error controlling container {vmid} on {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/nodes")
def get_server_nodes(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view"))
):
    """Получить список нод Proxmox сервера вместе с идентификатором кластера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")

    try:
        client = _get_proxmox_client(server)

        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")

        nodes = client.get_nodes()

        # Определяем идентификатор кластера для корректной дедупликации на фронте.
        # Если сервер входит в кластер — используем имя кластера (все члены одного
        # кластера вернут одинаковое значение). Для standalone — используем уникальный
        # "standalone-{server_id}", чтобы независимые серверы с одинаковыми именами
        # нод не скрывали друг друга.
        cluster_id = f"standalone-{server_id}"
        try:
            cluster_status = client.proxmox.cluster.status.get()
            for item in cluster_status:
                if item.get('type') == 'cluster' and item.get('name'):
                    cluster_id = item['name']
                    break
        except Exception:
            pass

        logger.info(f"Nodes for server {server_id} ({server.name}), cluster_id={cluster_id}: {len(nodes)} node(s)")
        return JSONResponse(content={"nodes": nodes, "cluster_id": cluster_id})
    except Exception as e:
        logger.error(f"Error getting nodes from {server.name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== VM/Container Monitoring ====================

@router.get("/api/{server_id}/vm/{vmid}/status")
def get_vm_status(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить детальный статус VM (CPU, RAM, Disk, Network)"""
    require_vm_access(db, current_user, server_id, vmid)
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")

    try:
        client = _get_proxmox_client(server)

        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")

        status = client.get_vm_status(node, vmid)
        return JSONResponse(content=status)
    except Exception as e:
        logger.error(f"Error getting VM {vmid} status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/status")
def get_container_status(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить детальный статус LXC контейнера"""
    require_vm_access(db, current_user, server_id, vmid)
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")

    try:
        client = _get_proxmox_client(server)

        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")

        status = client.get_container_status(node, vmid)
        return JSONResponse(content=status)
    except Exception as e:
        logger.error(f"Error getting container {vmid} status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/vm/{vmid}/interfaces")
def get_vm_interfaces(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить сетевые интерфейсы и IP адреса VM через QEMU guest agent"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        interfaces = client.get_vm_interfaces(node, vmid)
        return JSONResponse(content={"interfaces": interfaces})
    except Exception as e:
        logger.error(f"Error getting VM {vmid} interfaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/interfaces")
def get_container_interfaces(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить сетевые интерфейсы и IP адреса контейнера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        interfaces = client.get_container_interfaces(node, vmid)
        return JSONResponse(content={"interfaces": interfaces})
    except Exception as e:
        logger.error(f"Error getting container {vmid} interfaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/status")
def get_container_status_api(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить статус контейнера"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        status = client.get_container_status(node, vmid)
        return JSONResponse(content=status)
    except Exception as e:
        logger.error(f"Error getting container {vmid} status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/vm/{vmid}/rrddata")
def get_vm_rrddata(
    server_id: int,
    vmid: int,
    node: str,
    timeframe: str = Query("hour", regex="^(hour|day|week|month|year)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить исторические данные VM для графиков (CPU, RAM, Network, Disk IO)"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        rrddata = client.get_vm_rrddata(node, vmid, timeframe)
        return JSONResponse(content=rrddata)
    except Exception as e:
        logger.error(f"Error getting VM {vmid} RRD data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/rrddata")
def get_container_rrddata(
    server_id: int,
    vmid: int,
    node: str,
    timeframe: str = Query("hour", regex="^(hour|day|week|month|year)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Получить исторические данные контейнера для графиков"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        rrddata = client.get_container_rrddata(node, vmid, timeframe)
        return JSONResponse(content=rrddata)
    except Exception as e:
        logger.error(f"Error getting container {vmid} RRD data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== VNC Console ====================

@router.get("/api/{server_id}/vm/{vmid}/vnc")
def get_vm_vnc(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Получить VNC данные для подключения к VM"""
    import requests
    
    # VPS-style user isolation: check VM ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        # Для VNC ОБЯЗАТЕЛЬНО нужен password auth, API token не работает с vncwebsocket
        # Получаем auth ticket и создаём VNC proxy в одной сессии
        password_to_use = server.password if server.password else None
        auth_username = server.api_user.split("!")[0] if "!" in server.api_user else server.api_user
        
        if not password_to_use:
            raise HTTPException(status_code=400, detail="VNC requires password authentication. Please add password to server settings.")
        
        # 1. Получаем auth ticket
        auth_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/access/ticket",
            data={
                "username": auth_username,
                "password": password_to_use
            },
            verify=server.verify_ssl,
            timeout=10
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to authenticate to Proxmox")
        
        auth_data = auth_response.json().get("data", {})
        auth_ticket = auth_data.get("ticket")
        csrf_token = auth_data.get("CSRFPreventionToken")
        
        # 2. Создаём VNC proxy с этим же ticket
        # generate-password=1: Proxmox 8.x возвращает случайный VNC пароль для VNCAuth;
        # в Proxmox 9.x (NoAuth) поле password пустое, но соединение проходит без пароля.
        vnc_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/nodes/{node}/qemu/{vmid}/vncproxy",
            data={"websocket": 1, "generate-password": 1},
            headers={
                "CSRFPreventionToken": csrf_token
            },
            cookies={"PVEAuthCookie": auth_ticket},
            verify=server.verify_ssl,
            timeout=10
        )
        
        if vnc_response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to create VNC proxy: {vnc_response.text}")
        
        vnc_data = vnc_response.json().get("data", {})
        
        # password = сгенерированный VNC пароль (Proxmox 8.x) или пустой (Proxmox 9.x NoAuth)
        # Если password не вернулся — используем ticket как пароль (совместимость)
        vnc_password = vnc_data.get('password') or vnc_data.get('ticket', '')
        response_data = {
            'port': vnc_data.get('port'),
            'ticket': vnc_data.get('ticket'),
            'password': vnc_password,
            'host': server.ip_address,
            'node': node,
            'vmid': vmid,
            'type': 'qemu',
            'auth_ticket': auth_ticket
        }
        
        logger.info(f"User {current_user.username} opened VNC console for VM {vmid} (password_len={len(vnc_password)}, has_generate_password={'password' in vnc_data})")
        return JSONResponse(content=response_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting VNC for VM {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/vnc")
def get_container_vnc(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Получить VNC данные для подключения к LXC контейнеру"""
    import requests
    
    # VPS-style user isolation: check container ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        # Для VNC ОБЯЗАТЕЛЬНО нужен password auth
        password_to_use = server.password if server.password else None
        auth_username = server.api_user.split("!")[0] if "!" in server.api_user else server.api_user
        
        if not password_to_use:
            raise HTTPException(status_code=400, detail="VNC requires password authentication. Please add password to server settings.")
        
        # 1. Получаем auth ticket
        auth_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/access/ticket",
            data={
                "username": auth_username,
                "password": password_to_use
            },
            verify=server.verify_ssl,
            timeout=10
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to authenticate to Proxmox")
        
        auth_data = auth_response.json().get("data", {})
        auth_ticket = auth_data.get("ticket")
        csrf_token = auth_data.get("CSRFPreventionToken")
        
        # 2. Создаём VNC proxy с этим же ticket
        # LXC vncproxy не поддерживает generate-password; используем ticket как VNCAuth пароль
        vnc_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/nodes/{node}/lxc/{vmid}/vncproxy",
            data={"websocket": 1},
            headers={
                "CSRFPreventionToken": csrf_token
            },
            cookies={"PVEAuthCookie": auth_ticket},
            verify=server.verify_ssl,
            timeout=10
        )
        
        if vnc_response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to create VNC proxy: {vnc_response.text}")
        
        vnc_data = vnc_response.json().get("data", {})
        
        # Для LXC: VNCAuth пароль = ticket (стандартный Proxmox подход для LXC)
        vnc_password = vnc_data.get('ticket', '')
        response_data = {
            'port': vnc_data.get('port'),
            'ticket': vnc_data.get('ticket'),
            'password': vnc_password,
            'host': server.ip_address,
            'node': node,
            'vmid': vmid,
            'type': 'lxc',
            'auth_ticket': auth_ticket
        }
        
        logger.info(f"User {current_user.username} opened VNC console for container {vmid}")
        return JSONResponse(content=response_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting VNC for container {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== VNC WebSocket Proxy ====================

@router.websocket("/ws/vnc/{server_id}/{node}/{vmtype}/{vmid}")
async def vnc_websocket_proxy(
    websocket: WebSocket,
    server_id: int,
    node: str,
    vmtype: str,
    vmid: int,
    port: int,
    vncticket: str,
    vnc_password: str = None,  # VNC пароль сгенерированный через generate-password
    auth_ticket: str = None,  # Auth ticket переданный с frontend
    token: str = Query(None),  # JWT панели (?token=) — браузеры не шлют заголовки на WS
    db: Session = Depends(get_db)
):
    """WebSocket прокси для VNC подключения к Proxmox"""
    import websockets
    import urllib.parse

    # --- Authenticate the panel user before bridging to Proxmox ------------
    user = authenticate_ws_token(token, db)
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return
    if not PermissionEngine.has_permission(user, "vm:console"):
        await websocket.close(code=4003, reason="Permission denied")
        return
    if not check_vm_access(db, user, server_id, vmid):
        await websocket.close(code=4003, reason="Access denied")
        return

    await websocket.accept()
    logger.info(f"VNC WebSocket connection accepted for {vmtype}/{vmid} (user={user.username})")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        logger.error(f"Proxmox server {server_id} not found")
        await websocket.close(code=1008, reason="Proxmox server not found")
        return
    
    # Используем auth_ticket переданный с frontend (он создан в той же сессии что и vncticket)
    if auth_ticket:
        logger.info(f"Using auth_ticket from frontend for VNC WebSocket")
    
    # Построить URL для Proxmox WebSocket
    # Преобразуем vmtype: vm -> qemu, container -> lxc
    proxmox_vmtype = "qemu" if vmtype == "vm" else "lxc"
    encoded_ticket = urllib.parse.quote(vncticket, safe='')
    proxmox_ws_url = f"wss://{server.ip_address}:8006/api2/json/nodes/{node}/{proxmox_vmtype}/{vmid}/vncwebsocket?port={port}&vncticket={encoded_ticket}"
    
    logger.info(f"Connecting to Proxmox VNC: {server.name} for {proxmox_vmtype}/{vmid}")
    
    # SSL контекст для самоподписанных сертификатов
    ssl_context = ssl.create_default_context()
    if not server.verify_ssl:
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
    
    proxmox_ws = None
    bytes_to_proxmox = 0
    bytes_from_proxmox = 0
    
    # Заголовки для авторизации - auth_ticket уже получен в той же сессии что и vncticket
    extra_headers = []
    if auth_ticket:
        extra_headers.append(("Cookie", f"PVEAuthCookie={auth_ticket}"))
        logger.info(f"Using PVEAuthCookie for WebSocket auth")
    elif not server.use_password and server.api_token_name and server.api_token_value:
        # Для API token - но это обычно не работает для VNC WebSocket в Proxmox
        extra_headers.append(("Authorization", f"PVEAPIToken={server.api_user}!{server.api_token_name}={server.api_token_value}"))
        logger.info("Using API token for WebSocket auth (may not work for VNC)")
    else:
        logger.error("No auth_ticket provided and no API token available")
        await websocket.close(code=1008, reason="No authentication available for VNC")
        return
    
    try:
        # Подключаемся к Proxmox VNC WebSocket
        proxmox_ws = await websockets.connect(
            proxmox_ws_url,
            ssl=ssl_context,
            extra_headers=extra_headers,
            subprotocols=['binary'],
            max_size=None,
            ping_interval=None,
            close_timeout=5
        )
        
        logger.info(f"Connected to Proxmox VNC for {vmtype}/{vmid}")
        
        # Счётчики для отладки
        bytes_to_proxmox = 0
        bytes_from_proxmox = 0
        
        # Создаем задачи для двунаправленного проксирования
        async def client_to_proxmox():
            """Пересылка данных от клиента к Proxmox"""
            nonlocal bytes_to_proxmox
            try:
                while True:
                    try:
                        message = await websocket.receive()
                        if message["type"] == "websocket.disconnect":
                            break
                        if "bytes" in message:
                            bytes_to_proxmox += len(message["bytes"])
                            await proxmox_ws.send(message["bytes"])
                        elif "text" in message:
                            bytes_to_proxmox += len(message["text"])
                            await proxmox_ws.send(message["text"])
                    except WebSocketDisconnect:
                        break
            except Exception as e:
                logger.info(f"Client to Proxmox ended: {e}")
        
        async def proxmox_to_client():
            """Пересылка данных от Proxmox к клиенту"""
            nonlocal bytes_from_proxmox
            try:
                async for message in proxmox_ws:
                    try:
                        if isinstance(message, bytes):
                            bytes_from_proxmox += len(message)
                            await websocket.send_bytes(message)
                        else:
                            bytes_from_proxmox += len(message)
                            await websocket.send_text(message)
                    except Exception as send_err:
                        logger.info(f"Send to client failed: {send_err}")
                        break
            except Exception as e:
                logger.info(f"Proxmox to client ended: {e}")
        
        # Запускаем обе задачи
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(client_to_proxmox()),
                asyncio.create_task(proxmox_to_client())
            ],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Отменяем оставшиеся задачи
        for task in pending:
            task.cancel()
            
    except Exception as e:
        logger.error(f"VNC WebSocket proxy error: {e}")
    finally:
        logger.info(f"VNC stats - To Proxmox: {bytes_to_proxmox} bytes, From Proxmox: {bytes_from_proxmox} bytes")
        if proxmox_ws:
            await proxmox_ws.close()
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info(f"VNC WebSocket connection closed for {vmtype}/{vmid}")



@router.get("/api/{server_id}/vm/{vmid}/saved-config")
def get_saved_vm_config(
    server_id: int,
    vmid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Get saved VM configuration from database"""
    instance = get_vm_instance(db, server_id, vmid)
    if not instance:
        return JSONResponse(content={"found": False})
    
    return JSONResponse(content={
        "found": True,
        "config": {
            "cores": instance.cores,
            "memory": instance.memory,
            "disk_size": instance.disk_size,
            "ip_address": instance.ip_address,
            "ip_prefix": instance.ip_prefix,
            "gateway": instance.gateway,
            "nameserver": instance.nameserver,
            "cloud_init_user": instance.cloud_init_user,
            "cloud_init_password": instance.cloud_init_password,
            "ssh_keys": instance.ssh_keys,
            "name": instance.name,
            "template_id": instance.template_id
        }
    })


# ==================== LXC Container Creation ====================

@router.get("/api/{server_id}/all-lxc-templates")
def get_all_lxc_templates(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:view"))
):
    """Получить список LXC шаблонов со всех нод кластера с информацией о shared storage"""
    logger.info(f"[LXC API] Request for ALL templates from server_id={server_id}")
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Cannot connect to Proxmox server")
        
        templates = client.get_all_lxc_templates()
        logger.info(f"[LXC API] Found {len(templates)} total templates across all nodes")
        return JSONResponse(content={"templates": templates})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting all LXC templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/available-lxc-templates")
def get_available_lxc_templates(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:view"))
):
    """Получить список шаблонов доступных для загрузки из репозитория"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        # Determine auth method
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Cannot connect to Proxmox server")
        
        templates = client.get_available_lxc_templates(node)
        return JSONResponse(content=templates)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting available LXC templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/download-lxc-template")
async def download_lxc_template(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:manage"))
):
    """Скачать шаблон LXC из репозитория"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    data = await request.json()
    node = data.get('node')
    storage = data.get('storage')
    template = data.get('template')
    
    if not all([node, storage, template]):
        raise HTTPException(status_code=400, detail="Missing required parameters: node, storage, template")
    
    try:
        # Determine auth method
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Cannot connect to Proxmox server")
        
        upid = client.download_lxc_template(node, storage, template)
        if not upid:
            raise HTTPException(status_code=500, detail="Failed to start template download")
        
        # Register UPID task for real-time tracking
        try:
            ProxmoxTaskService.register(
                db=db,
                upid=upid,
                server_id=server_id,
                user_id=current_user.id,
                action="download_template",
                node=node,
                description=f"Download template: {template}",
            )
        except Exception as _e:
            logger.warning(f"Failed to register UPID task for template download: {_e}")

        LoggingService.log_proxmox_action(
            db=db,
            action="download_template",
            resource_type="template",
            resource_id=template,
            username=current_user.username,
            resource_name=template,
            server_id=server_id,
            server_name=server.name,
            node_name=node,
            details={"storage": storage},
            success=True,
            ip_address=request.client.host if request.client else None
        )
        
        return JSONResponse(content={"success": True, "upid": upid})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading LXC template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Terminal Proxy (xterm.js) ====================

@router.get("/api/{server_id}/vm/{vmid}/terminal")
def get_vm_terminal(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Получить данные для xterm.js терминального подключения к VM"""
    import requests
    
    # VPS-style user isolation: check VM ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        password_to_use = server.password if server.password else None
        auth_username = server.api_user.split("!")[0] if "!" in server.api_user else server.api_user
        
        if not password_to_use:
            raise HTTPException(status_code=400, detail="Terminal requires password authentication")
        
        # 1. Получаем auth ticket
        auth_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/access/ticket",
            data={"username": auth_username, "password": password_to_use},
            verify=server.verify_ssl,
            timeout=10
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to authenticate to Proxmox")
        
        auth_data = auth_response.json().get("data", {})
        auth_ticket = auth_data.get("ticket")
        csrf_token = auth_data.get("CSRFPreventionToken")
        
        # 2. Создаём terminal proxy
        term_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/nodes/{node}/qemu/{vmid}/termproxy",
            headers={"CSRFPreventionToken": csrf_token},
            cookies={"PVEAuthCookie": auth_ticket},
            verify=server.verify_ssl,
            timeout=10
        )
        
        if term_response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to create terminal proxy: {term_response.text}")
        
        term_data = term_response.json().get("data", {})
        
        response_data = {
            'port': term_data.get('port'),
            'ticket': term_data.get('ticket'),
            'host': server.ip_address,
            'node': node,
            'vmid': vmid,
            'type': 'qemu',
            'auth_ticket': auth_ticket
        }
        
        logger.info(f"User {current_user.username} opened terminal for VM {vmid}")
        return JSONResponse(content=response_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting terminal for VM {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/container/{vmid}/terminal")
def get_container_terminal(
    server_id: int,
    vmid: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Получить данные для xterm.js терминального подключения к LXC контейнеру"""
    import requests
    
    # VPS-style user isolation: check container ownership for limited users
    require_vm_access(db, current_user, server_id, vmid)
    
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        password_to_use = server.password if server.password else None
        auth_username = server.api_user.split("!")[0] if "!" in server.api_user else server.api_user
        
        if not password_to_use:
            raise HTTPException(status_code=400, detail="Terminal requires password authentication")
        
        # 1. Получаем auth ticket
        auth_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/access/ticket",
            data={"username": auth_username, "password": password_to_use},
            verify=server.verify_ssl,
            timeout=10
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Failed to authenticate to Proxmox")
        
        auth_data = auth_response.json().get("data", {})
        auth_ticket = auth_data.get("ticket")
        csrf_token = auth_data.get("CSRFPreventionToken")
        
        # 2. Создаём terminal proxy
        term_response = requests.post(
            f"https://{server.ip_address}:8006/api2/json/nodes/{node}/lxc/{vmid}/termproxy",
            headers={"CSRFPreventionToken": csrf_token},
            cookies={"PVEAuthCookie": auth_ticket},
            verify=server.verify_ssl,
            timeout=10
        )
        
        if term_response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to create terminal proxy: {term_response.text}")
        
        term_data = term_response.json().get("data", {})
        
        response_data = {
            'port': term_data.get('port'),
            'ticket': term_data.get('ticket'),
            'host': server.ip_address,
            'node': node,
            'vmid': vmid,
            'type': 'lxc',
            'auth_ticket': auth_ticket
        }
        
        logger.info(f"User {current_user.username} opened terminal for LXC {vmid}")
        return JSONResponse(content=response_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting terminal for LXC {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/{server_id}/container/{vmid}/exec")
async def exec_in_container(
    server_id: int,
    vmid: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:console"))
):
    """Выполнить команду в LXC контейнере через pct exec"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        data = await request.json()
        command = data.get('command', '/bin/bash')
        args = data.get('args', [])
        
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        # Выполняем команду
        full_command = [command] + (args if isinstance(args, list) else [])
        result = client.exec_in_container(node, vmid, full_command)
        
        if not result:
            raise HTTPException(status_code=500, detail="Failed to execute command")
        
        logger.info(f"User {current_user.username} executed command in LXC {vmid}: {command}")
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing command in LXC {vmid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ==================== Terminal WebSocket Proxy ====================

@router.websocket("/ws/terminal/{server_id}/{node}/{vmid}")
async def terminal_websocket_fixed(
    websocket: WebSocket,
    server_id: int,
    node: str,
    vmid: int,
    token: str = Query(None),  # JWT панели (?token=) — браузеры не шлют заголовки на WS
    db: Session = Depends(get_db)
):
    """WebSocket терминал для LXC контейнеров через Proxmox termproxy API"""
    import websockets
    import httpx
    from urllib.parse import quote

    # --- Authenticate the panel user before opening a root shell -----------
    user = authenticate_ws_token(token, db)
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return
    if not PermissionEngine.has_permission(user, "vm:console"):
        await websocket.close(code=4003, reason="Permission denied")
        return
    if not check_vm_access(db, user, server_id, vmid):
        await websocket.close(code=4003, reason="Access denied")
        return

    await websocket.accept()
    logger.info(f"Terminal WebSocket accepted for container {vmid} on node {node} (user={user.username})")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        await websocket.close(code=1008, reason="Proxmox server not found")
        return

    proxmox_ws = None
    bytes_to_proxmox = 0
    bytes_from_proxmox = 0

    try:
        # Шаг 1: Auth ticket
        async with httpx.AsyncClient(verify=False, timeout=10) as client:
            if not server.password:
                await websocket.close(code=1011, reason="Terminal requires password authentication")
                return

            auth_username = server.api_user.split("!")[0] if "!" in server.api_user else server.api_user
            auth_resp = await client.post(
                f"https://{server.ip_address}:8006/api2/json/access/ticket",
                data={"username": auth_username, "password": server.password}
            )
            if auth_resp.status_code != 200:
                logger.error(f"Auth failed: {auth_resp.status_code} {auth_resp.text}")
                await websocket.close(code=1011, reason="Authentication failed")
                return

            auth_data = auth_resp.json()["data"]
            ticket = auth_data["ticket"]
            csrf_token = auth_data["CSRFPreventionToken"]
            logger.info(f"✅ Auth ticket obtained for {auth_username}")

            # Шаг 2: Termproxy
            term_resp = await client.post(
                f"https://{server.ip_address}:8006/api2/json/nodes/{node}/lxc/{vmid}/termproxy",
                headers={"CSRFPreventionToken": csrf_token},
                cookies={"PVEAuthCookie": ticket}
            )
            if term_resp.status_code != 200:
                logger.error(f"Termproxy failed: {term_resp.status_code} - {term_resp.text}")
                await websocket.close(code=1011, reason="Failed to create terminal session")
                return

            term_data = term_resp.json()["data"]
            vncticket = term_data["ticket"]
            port = term_data["port"]
            logger.info(f"✅ Termproxy response: port={port}, ticket_prefix={vncticket[:30]}...")

        # Шаг 3: WebSocket к Proxmox — идентично VNC handler
        proxmox_ws_url = (
            f"wss://{server.ip_address}:8006/api2/json/nodes/{node}/lxc/{vmid}/vncwebsocket"
            f"?port={port}&vncticket={quote(vncticket, safe='')}"
        )

        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        proxmox_ws = await websockets.connect(
            proxmox_ws_url,
            ssl=ssl_context,
            extra_headers=[("Cookie", f"PVEAuthCookie={ticket}")],
            subprotocols=["binary"],
            max_size=None,
            ping_interval=None,
            close_timeout=5
        )
        logger.info(f"✅ Connected to Proxmox terminal WebSocket (port={port})")

        # CRITICAL: Proxmox termproxy requires auth handshake first.
        # Send "USERNAME:VNCTICKET\n" as the very first message.
        # Proxmox responds with "OK" (bytes 0x4F 0x4B), optionally followed by initial terminal data.
        await proxmox_ws.send(f"{auth_username}:{vncticket}\n")
        logger.info(f"✅ Sent termproxy auth: {auth_username}:***")

        try:
            ok_raw = await asyncio.wait_for(proxmox_ws.recv(), timeout=10.0)
        except asyncio.TimeoutError:
            logger.error("Proxmox termproxy auth timeout — no OK received")
            await websocket.close(code=1011, reason="Terminal auth timeout")
            return

        ok_bytes = ok_raw if isinstance(ok_raw, bytes) else ok_raw.encode("utf-8")
        if not ok_bytes.startswith(b"OK"):
            logger.error(f"Proxmox termproxy auth rejected: {ok_bytes[:50]!r}")
            await websocket.close(code=1011, reason="Terminal authentication rejected")
            return
        logger.info("✅ Proxmox termproxy auth OK!")

        # Send any terminal data that arrived together with "OK"
        if len(ok_bytes) > 2:
            await websocket.send_bytes(ok_bytes[2:])

        async def client_to_proxmox():
            nonlocal bytes_to_proxmox
            try:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        break
                    if "bytes" in message:
                        bytes_to_proxmox += len(message["bytes"])
                        await proxmox_ws.send(message["bytes"])
                    elif "text" in message:
                        bytes_to_proxmox += len(message["text"])
                        await proxmox_ws.send(message["text"].encode("utf-8"))
            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.debug(f"client_to_proxmox ended: {e}")

        async def proxmox_to_client():
            nonlocal bytes_from_proxmox
            try:
                async for message in proxmox_ws:
                    if isinstance(message, bytes):
                        bytes_from_proxmox += len(message)
                        await websocket.send_bytes(message)
                    else:
                        bytes_from_proxmox += len(message)
                        await websocket.send_bytes(message.encode("utf-8"))
            except Exception as e:
                logger.debug(f"proxmox_to_client ended: {e}")

        done, pending = await asyncio.wait(
            [
                asyncio.create_task(client_to_proxmox()),
                asyncio.create_task(proxmox_to_client()),
            ],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except Exception as e:
        logger.error(f"Terminal WebSocket error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
    finally:
        logger.info(f"Terminal stats — to Proxmox: {bytes_to_proxmox}B, from Proxmox: {bytes_from_proxmox}B")
        if proxmox_ws:
            try:
                await proxmox_ws.close()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info(f"Terminal session closed for container {vmid}")




# ==================== Bulk Operations API ====================

@router.post("/api/bulk-operation")
def create_bulk_operation(
    request: BulkOperationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:manage"))
):
    """
    Create a bulk operation task.
    Returns task ID for tracking progress.
    """
    # Map action to task type
    action_to_task_type = {
        'start': 'bulk_start',
        'stop': 'bulk_stop',
        'restart': 'bulk_restart',
        'shutdown': 'bulk_shutdown',
        'delete': 'bulk_delete',
    }
    
    task_type = action_to_task_type.get(request.action)
    if not task_type:
        raise HTTPException(status_code=400, detail=f"Invalid action: {request.action}")
    
    if not request.items:
        raise HTTPException(status_code=400, detail="No items selected")
    
    # For delete action, require higher permission
    if request.action == 'delete':
        if not check_permission(current_user, "vm:delete"):
            raise HTTPException(status_code=403, detail="Delete permission required")
    
    # Convert to list of dicts
    items = [item.model_dump() for item in request.items]
    
    try:
        task = TaskQueueService.create_task(
            db=db,
            task_type=task_type,
            user_id=current_user.id,
            items=items
        )
        
        logger.info(f"User {current_user.username} created bulk operation: {task_type} for {len(items)} items")
        
        return {
            "success": True,
            "task_id": task.id,
            "message": f"Bulk operation queued: {len(items)} items"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===================== VM Owner Management =====================

@router.get("/api/{server_id}/vm/{vmid}/owner")
def get_vm_owner(
    server_id: int,
    vmid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current owner of a VM/LXC. Admin only."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")

    instance = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None)
    ).first()

    owner = None
    if instance and instance.owner_id:
        owner_user = db.query(User).filter(User.id == instance.owner_id).first()
        if owner_user:
            owner = {"id": owner_user.id, "username": owner_user.username, "full_name": owner_user.full_name}

    users = (
        db.query(User)
        .filter(User.is_active == True, User.is_admin == False)
        .order_by(User.username)
        .all()
    )

    return {
        "owner_id": instance.owner_id if instance else None,
        "owner": owner,
        "users": [{"id": u.id, "username": u.username, "full_name": u.full_name} for u in users]
    }


@router.put("/api/{server_id}/vm/{vmid}/owner")
def set_vm_owner(
    server_id: int,
    vmid: int,
    body: VMOwnerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Set (or clear) the owner of a VM/LXC. Admin only."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")

    instance = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None)
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="VM not found in cache")

    if body.user_id is not None:
        target_user = db.query(User).filter(User.id == body.user_id, User.is_active == True).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

    instance.owner_id = body.user_id
    db.commit()
    logger.info(f"Admin {current_user.username} set owner of VM {vmid} (server {server_id}) to user_id={body.user_id}")
    return {"ok": True, "owner_id": body.user_id}



# ==================== Additional Instance Operations (Notes, ISO, Execute) ====================

class NotesRequest(BaseModel):
    description: Optional[str] = ""


class IsoAttachRequest(BaseModel):
    volid: str
    device: str = "ide2"


class IsoDetachRequest(BaseModel):
    device: str = "ide2"


class ExecuteCommandRequest(BaseModel):
    command: str
    timeout: int = 30


# -------- Notes / Description --------

@router.put("/api/{server_id}/vm/{vmid}/notes")
def update_vm_notes(
    server_id: int,
    vmid: int,
    node: str,
    body: NotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Обновить заметку (description) у VM."""
    require_vm_access(db, current_user, server_id, vmid)
    server = _resolve_server(db, server_id)
    client = _get_client_or_503(server)
    ok = client.set_vm_notes(node, vmid, body.description or '')
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to update notes")
    try:
        cached = db.query(VMInstance).filter(
            VMInstance.server_id == server_id,
            VMInstance.vmid == vmid,
            VMInstance.deleted_at.is_(None),
        ).first()
        if cached:
            cached.description = body.description or ''
            db.commit()
    except Exception:
        db.rollback()
    return {"status": "success"}


@router.put("/api/{server_id}/container/{vmid}/notes")
def update_container_notes(
    server_id: int,
    vmid: int,
    node: str,
    body: NotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Обновить заметку (description) у LXC."""
    require_vm_access(db, current_user, server_id, vmid)
    server = _resolve_server(db, server_id)
    client = _get_client_or_503(server)
    ok = client.set_container_notes(node, vmid, body.description or '')
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to update notes")
    try:
        cached = db.query(VMInstance).filter(
            VMInstance.server_id == server_id,
            VMInstance.vmid == vmid,
            VMInstance.deleted_at.is_(None),
        ).first()
        if cached:
            cached.description = body.description or ''
            db.commit()
    except Exception:
        db.rollback()
    return {"status": "success"}


# -------- ISO mount/unmount (KVM only) --------

@router.get("/api/{server_id}/node/{node}/isos")
def list_node_isos(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vm:view"))
):
    """Список ISO-образов на ноде."""
    server = _resolve_server(db, server_id)
    client = _get_client_or_503(server)
    return {"isos": client.get_node_isos(node)}


@router.post("/api/{server_id}/vm/{vmid}/iso/attach")
def attach_iso_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    body: IsoAttachRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Подключить ISO (CD-ROM) к VM."""
    require_vm_access(db, current_user, server_id, vmid)
    server = _resolve_server(db, server_id)
    client = _get_client_or_503(server)
    ok = client.attach_iso(node, vmid, body.volid, body.device or 'ide2')
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to attach ISO")
    LoggingService.log_proxmox_action(
        db=db, action='attach-iso', resource_type='vm', resource_id=vmid,
        username=current_user.username, server_id=server_id,
        server_name=server.name, node_name=node,
        details={'volid': body.volid, 'device': body.device}, success=True,
    )
    return {"status": "success"}


@router.post("/api/{server_id}/vm/{vmid}/iso/detach")
def detach_iso_endpoint(
    server_id: int,
    vmid: int,
    node: str,
    body: IsoDetachRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage"))
):
    """Отключить ISO (CD-ROM) у VM."""
    require_vm_access(db, current_user, server_id, vmid)
    server = _resolve_server(db, server_id)
    client = _get_client_or_503(server)
    ok = client.detach_iso(node, vmid, body.device or 'ide2')
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to detach ISO")
    return {"status": "success"}
