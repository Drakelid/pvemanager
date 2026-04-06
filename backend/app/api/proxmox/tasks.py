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
from ...models import ProxmoxServer, VMInstance, User, IPAMAllocation, IPAMNetwork, VMSnapshotArchive, ProxmoxTask
from ...schemas import ProxmoxServerCreate, ProxmoxServerUpdate, ProxmoxServerResponse
from ...proxmox_client import ProxmoxClient, get_proxmox_resources
from ...auth import get_current_user, PermissionChecker, require_permission, check_permission
from ...logging_service import LoggingService
from ...ipam_service import IPAMService
from ...models import TaskQueue
from ...services.task_queue_service import TaskQueueService, process_task_queue
from ._helpers import (check_vm_access, require_vm_access, _get_proxmox_client,
                        get_next_vmid, archive_and_delete_snapshots,
                        save_vm_instance, get_vm_instance, soft_delete_vm_instance)

router = APIRouter()


# ==================== ProxmoxTaskService ====================

class ProxmoxTaskService:
    """Service for managing Proxmox UPID tasks stored in DB."""

    @staticmethod
    def register(
        db: Session,
        upid: str,
        server_id: int,
        user_id: int,
        action: str,
        node: str = None,
        vmid: int = None,
        vm_type: str = None,
        description: str = None,
    ) -> ProxmoxTask:
        task = ProxmoxTask(
            upid=upid,
            server_id=server_id,
            user_id=user_id,
            node=node,
            vmid=vmid,
            vm_type=vm_type,
            action=action,
            description=description,
            status="running",
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        logger.info(f"[PROXMOX TASK] Registered UPID task #{task.id}: {action} on {node}/{vmid}")
        return task

    @staticmethod
    def get_user_tasks(db: Session, user_id: int, limit: int = 50) -> list:
        return (
            db.query(ProxmoxTask)
            .filter(ProxmoxTask.user_id == user_id)
            .order_by(ProxmoxTask.created_at.desc())
            .limit(limit)
            .all()
        )

    @staticmethod
    def get_active(db: Session, user_id: int) -> list:
        return (
            db.query(ProxmoxTask)
            .filter(ProxmoxTask.user_id == user_id, ProxmoxTask.status == "running")
            .order_by(ProxmoxTask.created_at.desc())
            .all()
        )


@router.get("/api/{server_id}/task/{upid}/status")
def get_task_status(
    server_id: int,
    upid: str,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vms.view"))
):
    """Получить статус задачи по UPID"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        status = client.get_task_status(node, upid)
        return JSONResponse(content=status)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting task status {upid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/task/{upid}/log")
def get_task_log(
    server_id: int,
    upid: str,
    node: str,
    start: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("vms.view"))
):
    """Получить лог задачи по UPID"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        if not client.is_connected():
            raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
        
        logs = client.get_task_log(node, upid, start, limit)
        return JSONResponse(content={"logs": logs})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting task log {upid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Bulk (TaskQueue) endpoints ─────────────────────────────────────────────

@router.get("/api/tasks")
def get_user_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100)
):
    """Get recent bulk-operation tasks for current user"""
    tasks = TaskQueueService.get_user_tasks(db, current_user.id, limit)
    return {"tasks": [task.to_dict() for task in tasks]}


@router.get("/api/tasks/active")
def get_active_bulk_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all active (pending/running) bulk tasks for current user"""
    tasks = db.query(TaskQueue).filter(
        TaskQueue.user_id == current_user.id,
        TaskQueue.status.in_(['pending', 'running'])
    ).order_by(TaskQueue.created_at.desc()).all()
    return {"tasks": [task.to_dict() for task in tasks]}


@router.get("/api/tasks/{task_id}")
def get_task_by_id(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get status of a specific bulk task"""
    task = db.query(TaskQueue).filter(
        TaskQueue.id == task_id,
        TaskQueue.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task.to_dict()


@router.post("/api/tasks/{task_id}/cancel")
def cancel_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cancel a pending bulk task"""
    success = TaskQueueService.cancel_task(db, task_id, current_user.id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Task cannot be cancelled (not found, not pending, or not yours)")
    
    return {"success": True, "message": "Task cancelled"}


# ─── All tasks (bulk + proxmox UPID) combined ──────────────────────────────

@router.get("/api/all-tasks")
def get_all_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(30, ge=1, le=200),
    status_filter: str = Query(None, alias="status"),
):
    """
    Return both TaskQueue (bulk ops) and ProxmoxTask (UPID) records for the
    current user, merged and sorted by created_at descending.
    """
    bulk_q = db.query(TaskQueue).filter(TaskQueue.user_id == current_user.id)
    proxmox_q = db.query(ProxmoxTask).filter(ProxmoxTask.user_id == current_user.id)

    if status_filter:
        # Normalise statuses: proxmox uses running/completed/failed; bulk uses the same + pending/cancelled
        bulk_q = bulk_q.filter(TaskQueue.status == status_filter)
        proxmox_q = proxmox_q.filter(ProxmoxTask.status == status_filter)

    bulk_tasks = bulk_q.order_by(TaskQueue.created_at.desc()).limit(limit).all()
    proxmox_tasks = proxmox_q.order_by(ProxmoxTask.created_at.desc()).limit(limit).all()

    all_tasks = sorted(
        [t.to_dict() for t in bulk_tasks] + [t.to_dict() for t in proxmox_tasks],
        key=lambda t: t.get("created_at") or "",
        reverse=True,
    )[:limit]

    return {"tasks": all_tasks}


@router.get("/api/all-tasks/active-count")
def get_active_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return count of currently active tasks (pending/running) for navbar badge."""
    bulk_count = db.query(func.count(TaskQueue.id)).filter(
        TaskQueue.user_id == current_user.id,
        TaskQueue.status.in_(["pending", "running"]),
    ).scalar() or 0

    proxmox_count = db.query(func.count(ProxmoxTask.id)).filter(
        ProxmoxTask.user_id == current_user.id,
        ProxmoxTask.status == "running",
    ).scalar() or 0

    return {"count": bulk_count + proxmox_count}


# ─── Proxmox UPID task log from DB ──────────────────────────────────────────

@router.get("/api/proxmox-tasks")
def list_proxmox_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
):
    """List ProxmoxTask records for current user."""
    tasks = ProxmoxTaskService.get_user_tasks(db, current_user.id, limit)
    return {"tasks": [t.to_dict() for t in tasks]}


@router.get("/api/proxmox-tasks/{task_id}/log")
def get_proxmox_task_log_db(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the cached log text for a ProxmoxTask stored in DB."""
    task = db.query(ProxmoxTask).filter(
        ProxmoxTask.id == task_id,
        ProxmoxTask.user_id == current_user.id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"log_text": task.log_text or "", "status": task.status, "exit_status": task.exit_status}


@router.delete("/api/all-tasks/completed")
def clear_completed_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all completed/failed/cancelled tasks for the current user."""
    done_statuses = ["completed", "failed", "cancelled"]
    bulk_deleted = db.query(TaskQueue).filter(
        TaskQueue.user_id == current_user.id,
        TaskQueue.status.in_(done_statuses),
    ).delete(synchronize_session=False)
    proxmox_deleted = db.query(ProxmoxTask).filter(
        ProxmoxTask.user_id == current_user.id,
        ProxmoxTask.status.in_(done_statuses),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": bulk_deleted + proxmox_deleted}

