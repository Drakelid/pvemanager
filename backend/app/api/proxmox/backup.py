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
from ...proxmox import _run_in_executor

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
        result = await _run_in_executor(client.create_storage, storage_id, storage_type, **data)
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
        result = await _run_in_executor(client.update_storage, storage_id, **data)
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
    storage: str,
    node: Optional[str] = None,
    vmid: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:view")),
):
    """List backup files stored in a given storage.

    If ``node`` is omitted (or empty), backup files are aggregated from all
    cluster nodes that have the storage available. Duplicate ``volid`` entries
    (which appear on shared storages) are de-duplicated.
    """
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        client = _get_proxmox_client(server)

        nodes_to_query: list[str] = []
        if node:
            nodes_to_query = [node]
        else:
            try:
                cluster_nodes = client.get_nodes() or []
                nodes_to_query = [
                    n.get("node") for n in cluster_nodes
                    if n.get("node") and (n.get("status") in (None, "online"))
                ]
            except Exception as e:
                logger.warning(f"Failed to enumerate cluster nodes for backup listing: {e}")

        seen: set[str] = set()
        backups: list[dict] = []
        for n in nodes_to_query:
            try:
                items = client.list_backups(n, storage, vmid) or []
            except Exception as e:
                logger.warning(f"Skipping node {n} when listing backups: {e}")
                continue
            for item in items:
                volid = item.get("volid")
                if volid and volid in seen:
                    continue
                if volid:
                    seen.add(volid)
                # annotate with the node where it was discovered (helpful for
                # restore / delete actions on non-shared storages)
                item.setdefault("node", n)
                backups.append(item)

        return JSONResponse(content={"backups": backups})
    except HTTPException:
        raise
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
        result = await _run_in_executor(client.delete_backup, node, storage, volid)
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
        result = await _run_in_executor(
            client.create_backup,
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
            result = await _run_in_executor(
                client.restore_lxc,
                node=node, vmid=int(vmid), archive=archive,
                storage=storage, new_vmid=int(new_vmid) if new_vmid else None,
                start=start,
            )
        else:
            result = await _run_in_executor(
                client.restore_vm,
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


@router.post("/api/backups/restore-bulk")
async def restore_backup_bulk(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("backup:restore")),
):
    """Restore several backups at once.

    Body:
        server_id (int), storage (str)
        mode: "in_place" (overwrite original VMID, force) | "new_vmid" (clone to fresh VMIDs)
        start (bool): start each guest after restore
        items: [{node, vmid, archive, vm_type}]  — expected one archive per distinct VMID

    Returns a per-item result list with UPIDs / errors.
    """
    data = await request.json()
    server_id = data.get("server_id")
    storage = data.get("storage")
    mode = data.get("mode", "in_place")
    start = bool(data.get("start", False))
    items = data.get("items", [])

    if not server_id or not storage or not items:
        raise HTTPException(status_code=400, detail="server_id, storage and items are required")
    if mode not in ("in_place", "new_vmid"):
        raise HTTPException(status_code=400, detail="mode must be 'in_place' or 'new_vmid'")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    client = _get_proxmox_client(server)
    allocated: set = set()

    def alloc_vmid(start_from: int):
        """Find the next free VMID at/above start_from, skipping ones already handed out."""
        candidate = start_from
        for _ in range(10000):
            if candidate in allocated:
                candidate += 1
                continue
            try:
                # /cluster/nextid?vmid=X returns X if free, raises if taken
                ok = client.proxmox.cluster.nextid.get(vmid=candidate)
                chosen = int(ok) if ok else candidate
                allocated.add(chosen)
                return chosen
            except Exception:
                candidate += 1
        return None

    next_start = None
    if mode == "new_vmid":
        next_start = await _run_in_executor(client.get_next_vmid) or 100

    results = []
    for it in items:
        node = it.get("node")
        vmid = it.get("vmid")
        archive = it.get("archive")
        vm_type = it.get("vm_type", "qemu")

        if not node or not vmid or not archive:
            results.append({"vmid": vmid, "archive": archive, "success": False,
                            "error": "node, vmid and archive are required"})
            continue

        new_vmid = None
        if mode == "new_vmid":
            new_vmid = await _run_in_executor(alloc_vmid, next_start)
            if not new_vmid:
                results.append({"vmid": vmid, "archive": archive, "success": False,
                                "error": "No free VMID available"})
                continue
            next_start = new_vmid + 1

        force = (mode == "in_place")
        try:
            if vm_type == "lxc":
                r = await _run_in_executor(
                    client.restore_lxc,
                    node=node, vmid=int(vmid), archive=archive, storage=storage,
                    new_vmid=new_vmid, start=start, force=force,
                )
            else:
                r = await _run_in_executor(
                    client.restore_vm,
                    node=node, vmid=int(vmid), archive=archive, storage=storage,
                    new_vmid=new_vmid, start=start, unique=(mode == "new_vmid"), force=force,
                )
            target = new_vmid or int(vmid)
            if r.get("success"):
                results.append({"vmid": vmid, "target_vmid": target, "archive": archive,
                                "success": True, "upid": r.get("upid")})
                LoggingService.log_proxmox_action(
                    db=db, action="backup_restore", resource_type="backup",
                    resource_id=str(target), username=current_user.username,
                    server_id=server_id, server_name=server.name, node_name=node, success=True,
                    details={"archive": archive, "storage": storage, "vm_type": vm_type,
                             "mode": mode, "bulk": True},
                )
            else:
                results.append({"vmid": vmid, "target_vmid": target, "archive": archive,
                                "success": False, "error": r.get("error", "Failed")})
        except Exception as e:
            results.append({"vmid": vmid, "archive": archive, "success": False, "error": str(e)})

    succeeded = sum(1 for r in results if r["success"])
    return JSONResponse(content={
        "success": succeeded > 0,
        "total": len(results),
        "succeeded": succeeded,
        "failed": len(results) - succeeded,
        "results": results,
    })


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
