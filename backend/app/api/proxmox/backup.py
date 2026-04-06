"""
Backup & Storage API
====================
Endpoints for managing Proxmox storages, backup files,
creating backups (vzdump), restoring, and scheduled backup jobs.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from loguru import logger

from ...db import get_db
from ...models import BackupJob, ProxmoxServer, User
from ...auth import PermissionChecker
from ...logging_service import LoggingService
from ._helpers import _get_proxmox_client

router = APIRouter()


# ==================== Storage Management ====================

@router.get("/api/backups/storages/{server_id}")
def get_storages(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:view")),
):
    """List all storages configured on a Proxmox server"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        client = _get_proxmox_client(server)
        storages = client.get_cluster_storages()
        return JSONResponse(content={"storages": storages})
    except Exception as e:
        logger.error(f"Error listing storages for server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/backups/storages/{server_id}")
async def create_storage(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Add a new storage to a Proxmox server"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    data = await request.json()
    storage_id = data.pop("storage", None)
    storage_type = data.pop("type", None)
    if not storage_id or not storage_type:
        raise HTTPException(status_code=400, detail="storage and type are required")

    try:
        client = _get_proxmox_client(server)
        result = client.create_storage(storage_id, storage_type, **data)
        if result.get("success"):
            LoggingService.log_proxmox_action(
                db=db, action="storage_create", resource_type="storage",
                resource_id=storage_id, username=current_user.username,
                server_id=server_id, server_name=server.name, success=True,
            )
            return JSONResponse(content={"success": True})
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/backups/storages/{server_id}/{storage_id}")
async def update_storage(
    server_id: int,
    storage_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Update storage configuration"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    data = await request.json()
    try:
        client = _get_proxmox_client(server)
        result = client.update_storage(storage_id, **data)
        if result.get("success"):
            return JSONResponse(content={"success": True})
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/backups/storages/{server_id}/{storage_id}")
def delete_storage(
    server_id: int,
    storage_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Delete storage from Proxmox"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        client = _get_proxmox_client(server)
        result = client.delete_storage(storage_id)
        if result.get("success"):
            LoggingService.log_proxmox_action(
                db=db, action="storage_delete", resource_type="storage",
                resource_id=storage_id, username=current_user.username,
                server_id=server_id, server_name=server.name, success=True,
            )
            return JSONResponse(content={"success": True})
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Backup Listing ====================

@router.get("/api/backups/list/{server_id}")
def list_backups(
    server_id: int,
    node: str,
    storage: str,
    vmid: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:view")),
):
    """List backup files stored in a given storage on a node"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        client = _get_proxmox_client(server)
        backups = client.list_backups(node, storage, vmid)
        return JSONResponse(content={"backups": backups})
    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/backups/{server_id}/backup")
async def delete_backup(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:delete")),
):
    """Delete a specific backup file"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    data = await request.json()
    node = data.get("node")
    storage = data.get("storage")
    volid = data.get("volid")
    if not all([node, storage, volid]):
        raise HTTPException(status_code=400, detail="node, storage, volid are required")

    try:
        client = _get_proxmox_client(server)
        result = client.delete_backup(node, storage, volid)
        if result.get("success"):
            LoggingService.log_proxmox_action(
                db=db, action="backup_delete", resource_type="backup",
                resource_id=volid, username=current_user.username,
                server_id=server_id, server_name=server.name,
                node_name=node, success=True,
            )
            return JSONResponse(content={"success": True})
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Create Backup ====================

@router.post("/api/backups/create")
async def create_backup(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:create")),
):
    """Trigger vzdump backup for a VM/container. Returns UPID for tracking."""
    data = await request.json()
    server_id = data.get("server_id")
    node = data.get("node")
    vmid = data.get("vmid")
    storage = data.get("storage")

    if not all([server_id, node, vmid, storage]):
        raise HTTPException(status_code=400, detail="server_id, node, vmid, storage are required")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    mode = data.get("mode", "snapshot")
    compress = data.get("compress", "zstd")
    remove = int(data.get("remove", 1))
    notes = data.get("notes")
    keep_last = data.get("keep_last")

    try:
        client = _get_proxmox_client(server)
        result = client.create_backup(
            node=node, vmid=int(vmid), storage=storage,
            mode=mode, compress=compress, remove=remove,
            keep_last=keep_last, notes=notes,
        )
        if result.get("success"):
            LoggingService.log_proxmox_action(
                db=db, action="backup_create", resource_type="backup",
                resource_id=str(vmid), username=current_user.username,
                server_id=server_id, server_name=server.name,
                node_name=node, success=True,
                details={"storage": storage, "mode": mode, "compress": compress},
            )
            return JSONResponse(content={"success": True, "upid": result.get("upid")})
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Task Status ====================

@router.get("/api/backups/task/{server_id}/{node}/{upid:path}")
def get_task_status(
    server_id: int,
    node: str,
    upid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:view")),
):
    """Get Proxmox task status and log by UPID"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        client = _get_proxmox_client(server)
        status = client.get_task_status(node, upid)
        log = client.get_task_log(node, upid)
        return JSONResponse(content={"status": status, "log": log})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Restore ====================

@router.post("/api/backups/restore")
async def restore_backup(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:restore")),
):
    """Restore a VM or LXC from a backup file. Returns UPID."""
    data = await request.json()
    server_id = data.get("server_id")
    node = data.get("node")
    vmid = data.get("vmid")
    archive = data.get("archive")   # volume id
    storage = data.get("storage")
    vm_type = data.get("vm_type", "qemu")
    new_vmid = data.get("new_vmid")
    start = bool(data.get("start", False))
    unique = bool(data.get("unique", True))

    if not all([server_id, node, vmid, archive, storage]):
        raise HTTPException(
            status_code=400,
            detail="server_id, node, vmid, archive, storage are required",
        )

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        client = _get_proxmox_client(server)
        if vm_type == "lxc":
            result = client.restore_lxc(
                node=node, vmid=int(vmid), archive=archive,
                storage=storage, new_vmid=int(new_vmid) if new_vmid else None,
                start=start,
            )
        else:
            result = client.restore_vm(
                node=node, vmid=int(vmid), archive=archive,
                storage=storage, new_vmid=int(new_vmid) if new_vmid else None,
                start=start, unique=unique,
            )

        if result.get("success"):
            LoggingService.log_proxmox_action(
                db=db, action="backup_restore", resource_type="backup",
                resource_id=str(vmid), username=current_user.username,
                server_id=server_id, server_name=server.name,
                node_name=node, success=True,
                details={"archive": archive, "storage": storage, "vm_type": vm_type},
            )
            return JSONResponse(content={"success": True, "upid": result.get("upid")})
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Scheduled Backup Jobs ====================

@router.get("/api/backups/proxmox-jobs/{server_id}")
def list_proxmox_native_jobs(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:view")),
):
    """Fetch native vzdump backup schedules configured directly in Proxmox"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        client = _get_proxmox_client(server)
        jobs = client.get_cluster_backup_jobs()
        return JSONResponse(content={"jobs": jobs, "server_name": server.name})
    except Exception as e:
        logger.error(f"Error fetching proxmox native jobs for server {server_id}: {e}")
        return JSONResponse(content={"jobs": [], "error": str(e)})


@router.get("/api/backups/jobs")
def list_backup_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:view")),
):
    """List scheduled backup jobs"""
    if current_user.is_admin or (current_user.role and current_user.role.name == "admin"):
        jobs = db.query(BackupJob).all()
    else:
        jobs = db.query(BackupJob).filter(BackupJob.owner_id == current_user.id).all()

    return JSONResponse(content={"jobs": [j.to_dict() for j in jobs]})


@router.post("/api/backups/jobs")
async def create_backup_job(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Create a new scheduled backup job"""
    data = await request.json()

    required = ["server_id", "node", "vmids", "storage", "cron_expression"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing fields: {', '.join(missing)}")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == data["server_id"]).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    job = BackupJob(
        server_id=data["server_id"],
        node=data["node"],
        vmids=data["vmids"],
        storage=data["storage"],
        mode=data.get("mode", "snapshot"),
        compress=data.get("compress", "zstd"),
        notes=data.get("notes"),
        keep_last=int(data.get("keep_last", 3)),
        keep_daily=int(data.get("keep_daily", 7)),
        keep_weekly=int(data.get("keep_weekly", 4)),
        keep_monthly=int(data.get("keep_monthly", 6)),
        cron_expression=data["cron_expression"],
        enabled=bool(data.get("enabled", True)),
        owner_id=current_user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Register with scheduler
    try:
        from ...services.backup_scheduler import scheduler
        scheduler.add_job_from_model(job)
    except Exception as e:
        logger.warning(f"Could not register job {job.id} with scheduler: {e}")

    LoggingService.log_proxmox_action(
        db=db, action="create", resource_type="backup_job",
        resource_id=str(job.id), username=current_user.username, success=True,
        server_id=job.server_id, node_name=job.node,
    )
    return JSONResponse(content={"success": True, "job": job.to_dict()})


@router.put("/api/backups/jobs/{job_id}")
async def update_backup_job(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Update a scheduled backup job"""
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not (current_user.is_admin or
            (current_user.role and current_user.role.name == "admin") or
            job.owner_id == current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    data = await request.json()
    updatable = ["node", "vmids", "storage", "mode", "compress", "notes",
                 "keep_last", "keep_daily", "keep_weekly", "keep_monthly",
                 "cron_expression", "enabled"]
    for field in updatable:
        if field in data:
            setattr(job, field, data[field])
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)

    try:
        from ...services.backup_scheduler import scheduler
        scheduler.update_job_from_model(job)
    except Exception as e:
        logger.warning(f"Could not update job {job.id} in scheduler: {e}")

    return JSONResponse(content={"success": True, "job": job.to_dict()})


@router.delete("/api/backups/jobs/{job_id}")
def delete_backup_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Delete a scheduled backup job"""
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not (current_user.is_admin or
            (current_user.role and current_user.role.name == "admin") or
            job.owner_id == current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        from ...services.backup_scheduler import scheduler
        scheduler.remove_job(job_id)
    except Exception as e:
        logger.warning(f"Could not remove job {job_id} from scheduler: {e}")

    db.delete(job)
    db.commit()
    return JSONResponse(content={"success": True})


@router.patch("/api/backups/jobs/{job_id}/toggle")
def toggle_backup_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:manage")),
):
    """Enable or disable a scheduled backup job"""
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.enabled = not job.enabled
    job.updated_at = datetime.now(timezone.utc)
    db.commit()

    try:
        from ...services.backup_scheduler import scheduler
        if job.enabled:
            scheduler.add_job_from_model(job)
        else:
            scheduler.remove_job(job_id)
    except Exception as e:
        logger.warning(f"Could not toggle job {job_id} in scheduler: {e}")

    return JSONResponse(content={"success": True, "enabled": job.enabled})


@router.post("/api/backups/jobs/{job_id}/run-now")
def run_backup_job_now(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:create")),
):
    """Trigger a scheduled backup job immediately"""
    job = db.query(BackupJob).filter(BackupJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        from ...services.backup_scheduler import run_backup_job
        import asyncio
        # Run in background - fire and forget via thread
        import threading
        thread = threading.Thread(
            target=lambda: asyncio.run(run_backup_job(job_id)),
            daemon=True,
        )
        thread.start()
        return JSONResponse(content={"success": True, "message": "Job triggered"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
