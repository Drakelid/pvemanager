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
from ...schemas import ProxmoxServerCreate, ProxmoxServerUpdate, ProxmoxServerResponse
from ...proxmox import ProxmoxClient, get_proxmox_resources
from ...auth import get_current_user, PermissionChecker, require_permission, check_permission
from ...logging_service import LoggingService
from ...ipam_service import IPAMService


# ==================== Helper Functions for User Isolation ====================

def can_view_all_instances(current_user: User) -> bool:
    """
    Whether the user may see/manage *every* instance, not just their own.

    Only administrators — or roles that explicitly grant ``vm:manage`` — get the
    global view. Every other authenticated user (including users with no role,
    custom roles, or the stock ``user`` role) is scoped to instances they own.

    Note: ``vm:view`` is deliberately NOT treated as a global view permission.
    The stock ``user`` role carries ``vm:view`` simply so the instances feature
    is usable at all; granting it would let any tenant see every VM.
    """
    if getattr(current_user, 'is_admin', False):
        return True
    role = current_user.role
    if role and role.name == 'admin':
        return True
    perms = (role.permissions if role else None) or {}
    return bool(perms.get('vm:manage', False))


def check_vm_access(db: Session, current_user: User, server_id: int, vmid: int) -> bool:
    """
    Check if user has access to a specific VM instance.

    Admins (and roles granting ``vm:manage``) can access all VMs. Everyone else
    can only access VMs where they are the owner.

    Returns True if access is allowed, False otherwise.
    """
    if can_view_all_instances(current_user):
        return True

    instance = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None)
    ).first()

    return bool(instance and instance.owner_id == current_user.id)


def require_vm_access(db: Session, current_user: User, server_id: int, vmid: int):
    """
    Require user to have access to VM, raise 403 if not.
    """
    if not check_vm_access(db, current_user, server_id, vmid):
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this virtual machine"
        )


def _get_proxmox_client(server: ProxmoxServer) -> ProxmoxClient:
    """Build a ProxmoxClient from a ProxmoxServer model (password or token auth)."""
    return ProxmoxClient.from_server(server)


def get_next_vmid(db: Session, server_id: int) -> int:
    """Get next available VMID from Proxmox server (sequential)"""

    # Get server from DB
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        # Create Proxmox client and get next VMID from Proxmox API
        client = _get_proxmox_client(server)

        # Get next VMID from Proxmox (it returns sequential IDs)
        vmid = client.get_next_vmid()
        if vmid:
            return vmid
    except Exception as e:
        logger.warning(f"Could not get VMID from Proxmox, falling back to DB: {e}")

    # Fallback: get from DB if Proxmox not available
    used_vmids = set(
        row[0] for row in db.query(VMInstance.vmid)
        .filter(VMInstance.server_id == server_id, VMInstance.deleted_at.is_(None))
        .all()
    )

    # Find first available VMID starting from 100
    for vmid in range(100, 999999):
        if vmid not in used_vmids:
            return vmid

    raise HTTPException(status_code=500, detail="No available VMID")


def archive_and_delete_snapshots(
    db: Session,
    client: ProxmoxClient,
    server_id: int,
    server_name: str,
    vmid: int,
    vm_name: str,
    vm_type: str,
    node: str,
    deleted_by: str,
    deletion_reason: str = None
) -> dict:
    """
    Archive all snapshots to database before deleting them.

    This function:
    1. Gets list of all snapshots for the VM/container
    2. Saves each snapshot's configuration to vm_snapshot_archives table
    3. Explicitly deletes each snapshot one by one
    4. Logs each deletion

    Args:
        db: Database session
        client: ProxmoxClient instance
        server_id: Proxmox server ID
        server_name: Proxmox server name for logging
        vmid: VM/container ID
        vm_name: VM/container name
        vm_type: 'qemu' for VM, 'lxc' for container
        node: Proxmox node name
        deleted_by: Username who initiated deletion
        deletion_reason: Reason for deletion

    Returns:
        Dict with archived count, deleted count, and any errors
    """
    result = {
        "archived": 0,
        "deleted": 0,
        "errors": [],
        "snapshots": []
    }

    try:
        # Get all snapshots
        if vm_type == 'lxc':
            snapshots = client.get_container_snapshots(node, vmid)
        else:
            snapshots = client.get_vm_snapshots(node, vmid)

        # Filter out 'current' state which is not a real snapshot
        snapshots = [s for s in snapshots if s.get('name') != 'current']

        if not snapshots:
            logger.info(f"No snapshots found for {vm_type} {vmid}")
            return result

        logger.info(f"Found {len(snapshots)} snapshots to archive for {vm_type} {vmid}")

        # Archive and delete each snapshot
        for snap in snapshots:
            snapname = snap.get('name')
            if not snapname:
                continue

            # Create archive record
            try:
                archive = VMSnapshotArchive(
                    server_id=server_id,
                    server_name=server_name,
                    vmid=vmid,
                    vm_name=vm_name,
                    vm_type=vm_type,
                    node=node,
                    snapname=snapname,
                    description=snap.get('description'),
                    snaptime=snap.get('snaptime'),
                    parent=snap.get('parent'),
                    vmstate=bool(snap.get('vmstate')),
                    snapshot_config=snap,
                    deleted_by=deleted_by,
                    deletion_reason=deletion_reason
                )
                db.add(archive)
                db.flush()  # Get ID immediately
                result["archived"] += 1
                result["snapshots"].append(snapname)
                logger.info(f"Archived snapshot {snapname} for {vm_type} {vmid}")
            except Exception as e:
                logger.error(f"Error archiving snapshot {snapname}: {e}")
                result["errors"].append(f"Archive {snapname}: {str(e)}")

            # Delete snapshot from Proxmox
            try:
                if vm_type == 'lxc':
                    delete_result = client.delete_container_snapshot(node, vmid, snapname, force=True)
                else:
                    delete_result = client.delete_vm_snapshot(node, vmid, snapname, force=True)

                if delete_result.get('success'):
                    result["deleted"] += 1

                    # Log the deletion
                    LoggingService.log_proxmox_action(
                        db=db,
                        action="snapshot_delete",
                        resource_type=vm_type,
                        resource_id=vmid,
                        username=deleted_by,
                        resource_name=snapname,
                        server_id=server_id,
                        server_name=server_name,
                        node_name=node,
                        details={
                            "reason": f"Pre-deletion cleanup for {vm_type} {vmid}",
                            "cascade_delete": True
                        },
                        success=True
                    )
                    logger.info(f"Deleted snapshot {snapname} for {vm_type} {vmid}")
                else:
                    error_msg = delete_result.get('error', 'Unknown error')
                    result["errors"].append(f"Delete {snapname}: {error_msg}")
                    logger.warning(f"Failed to delete snapshot {snapname}: {error_msg}")
            except Exception as e:
                logger.error(f"Error deleting snapshot {snapname}: {e}")
                result["errors"].append(f"Delete {snapname}: {str(e)}")

        # Commit archive records
        db.commit()

        logger.info(f"Snapshot cleanup for {vm_type} {vmid}: archived={result['archived']}, deleted={result['deleted']}")

    except Exception as e:
        logger.error(f"Error in archive_and_delete_snapshots for {vm_type} {vmid}: {e}")
        result["errors"].append(f"General error: {str(e)}")

    return result


def save_vm_instance(
    db: Session,
    server_id: int,
    vmid: int,
    node: str,
    vm_type: str,
    name: str,
    cores: int = None,
    memory: int = None,
    disk_size: int = None,
    ip_address: str = None,
    ip_prefix: int = 24,
    gateway: str = None,
    nameserver: str = None,
    cloud_init_user: str = None,
    cloud_init_password: str = None,
    ssh_keys: str = None,
    template_id: int = None,
    template_name: str = None,
    description: str = None,
    extra_config: dict = None,
    owner_id: int = None
) -> VMInstance:
    """Save or update VM instance configuration"""

    # Проверяем, существует ли уже активная запись
    existing = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None)
    ).first()

    if existing:
        # Обновляем существующую запись
        existing.node = node
        existing.vm_type = vm_type
        existing.name = name
        existing.cores = cores
        existing.memory = memory
        existing.disk_size = disk_size
        existing.ip_address = ip_address
        existing.ip_prefix = ip_prefix
        existing.gateway = gateway
        existing.nameserver = nameserver
        existing.cloud_init_user = cloud_init_user
        existing.cloud_init_password = cloud_init_password
        existing.ssh_keys = ssh_keys
        existing.template_id = template_id
        existing.template_name = template_name
        existing.description = description
        existing.extra_config = extra_config
        existing.updated_at = func.now()
        db.commit()
        db.refresh(existing)
        return existing

    # Проверяем, есть ли удалённая запись с тем же vmid (soft-deleted)
    deleted_existing = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.isnot(None)
    ).first()

    if deleted_existing:
        # Восстанавливаем и обновляем удалённую запись
        deleted_existing.node = node
        deleted_existing.vm_type = vm_type
        deleted_existing.name = name
        deleted_existing.cores = cores
        deleted_existing.memory = memory
        deleted_existing.disk_size = disk_size
        deleted_existing.ip_address = ip_address
        deleted_existing.ip_prefix = ip_prefix
        deleted_existing.gateway = gateway
        deleted_existing.nameserver = nameserver
        deleted_existing.cloud_init_user = cloud_init_user
        deleted_existing.cloud_init_password = cloud_init_password
        deleted_existing.ssh_keys = ssh_keys
        deleted_existing.template_id = template_id
        deleted_existing.template_name = template_name
        deleted_existing.description = description
        deleted_existing.extra_config = extra_config
        deleted_existing.owner_id = owner_id
        deleted_existing.status = 'unknown'
        deleted_existing.deleted_at = None  # Восстанавливаем запись
        deleted_existing.updated_at = func.now()
        db.commit()
        db.refresh(deleted_existing)
        return deleted_existing

    # Создаем новую запись
    instance = VMInstance(
        server_id=server_id,
        vmid=vmid,
        node=node,
        vm_type=vm_type,
        name=name,
        cores=cores,
        memory=memory,
        disk_size=disk_size,
        ip_address=ip_address,
        ip_prefix=ip_prefix,
        gateway=gateway,
        nameserver=nameserver,
        cloud_init_user=cloud_init_user,
        cloud_init_password=cloud_init_password,
        ssh_keys=ssh_keys,
        template_id=template_id,
        template_name=template_name,
        description=description,
        extra_config=extra_config,
        owner_id=owner_id
    )
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


def get_vm_instance(db: Session, server_id: int, vmid: int) -> VMInstance:
    """Get VM instance configuration"""
    return db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None)
    ).first()


def soft_delete_vm_instance(db: Session, server_id: int, vmid: int):
    """Soft delete VM instance (mark as deleted) and release IPAM"""
    instance = get_vm_instance(db, server_id, vmid)
    if instance:
        # Release IPAM allocation
        try:
            ipam = IPAMService(db)
            released = ipam.release_ip_by_vmid(
                proxmox_server_id=server_id,
                proxmox_vmid=vmid,
                released_by="system",
                reason="VM/Container soft deleted"
            )
            if released:
                logger.info(f"Released IPAM for soft-deleted instance {vmid} on server {server_id}")
        except Exception as e:
            logger.warning(f"Failed to release IPAM for soft-deleted instance: {e}")

        instance.deleted_at = func.now()
        db.commit()
