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
from ...models import TaskQueue
from ...services.task_queue_service import TaskQueueService, process_task_queue
from ._helpers import (check_vm_access, require_vm_access, _get_proxmox_client,
                        get_next_vmid, archive_and_delete_snapshots,
                        save_vm_instance, get_vm_instance, soft_delete_vm_instance,
                        templates)

router = APIRouter()


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


@router.get("/api/tasks")
def get_user_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100)
):
    """Get recent tasks for current user"""
    tasks = TaskQueueService.get_user_tasks(db, current_user.id, limit)
    return {
        "tasks": [task.to_dict() for task in tasks]
    }


@router.get("/api/tasks/active")
def get_active_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all active (pending/running) tasks for current user"""
    tasks = db.query(TaskQueue).filter(
        TaskQueue.user_id == current_user.id,
        TaskQueue.status.in_(['pending', 'running'])
    ).order_by(TaskQueue.created_at.desc()).all()
    
    return {
        "tasks": [task.to_dict() for task in tasks]
    }


@router.get("/api/tasks/{task_id}")
def get_task_by_id(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get status of a specific task"""
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
    """Cancel a pending task"""
    success = TaskQueueService.cancel_task(db, task_id, current_user.id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Task cannot be cancelled (not found, not pending, or not yours)")
    
    return {"success": True, "message": "Task cancelled"}
