from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from loguru import logger

from ...db import get_db
from ...models import ProxmoxServer, User
from ...auth import PermissionChecker
from ._helpers import _get_proxmox_client
from ...proxmox import _run_in_executor

router = APIRouter()


def _resolve_client(db: Session, server_id: int):
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    client = _get_proxmox_client(server)
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Failed to connect to Proxmox server")
    return client


def _ok_or_400(result: dict):
    if result.get("success"):
        return JSONResponse(content=result)
    raise HTTPException(status_code=400, detail=result.get("error", "Operation failed"))


# ==================== Services ====================

@router.get("/api/servers/{server_id}/nodes/{node}/services")
async def list_services(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view")),
):
    client = _resolve_client(db, server_id)
    try:
        return JSONResponse(content={"services": await _run_in_executor(lambda: client.get_node_services(node))})
    except Exception as e:
        logger.error(f"Error listing services on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/nodes/{node}/services/{service}/{action}")
async def service_action(
    server_id: int,
    node: str,
    service: str,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage")),
):
    if action not in ("start", "stop", "restart", "reload"):
        raise HTTPException(status_code=400, detail="action must be start/stop/restart/reload")
    client = _resolve_client(db, server_id)
    try:
        return _ok_or_400(await _run_in_executor(lambda: client.node_service_action(node, service, action)))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error {action} service {service} on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== APT: updates ====================

@router.get("/api/servers/{server_id}/nodes/{node}/apt/updates")
async def apt_updates(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view")),
):
    client = _resolve_client(db, server_id)
    try:
        return JSONResponse(content={"updates": await _run_in_executor(lambda: client.get_apt_updates(node))})
    except Exception as e:
        logger.error(f"Error getting APT updates on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/nodes/{node}/apt/refresh")
async def apt_refresh(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage")),
):
    client = _resolve_client(db, server_id)
    try:
        return _ok_or_400(await _run_in_executor(lambda: client.apt_refresh(node)))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing APT on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== APT: repositories ====================

@router.get("/api/servers/{server_id}/nodes/{node}/apt/repositories")
async def apt_repositories(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:view")),
):
    client = _resolve_client(db, server_id)
    try:
        return JSONResponse(content={"repositories": await _run_in_executor(lambda: client.get_apt_repositories(node))})
    except Exception as e:
        logger.error(f"Error getting APT repositories on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/nodes/{node}/apt/repositories")
async def set_apt_repository(
    server_id: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage")),
):
    """Включить/выключить репозиторий (path + index + enabled)."""
    client = _resolve_client(db, server_id)
    data = await request.json()
    path = data.get("path")
    index = data.get("index")
    if not path or index is None:
        raise HTTPException(status_code=400, detail="path and index are required")
    try:
        return _ok_or_400(await _run_in_executor(
            lambda: client.set_apt_repository(node, path, int(index), bool(data.get("enabled")))))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling APT repo on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/servers/{server_id}/nodes/{node}/apt/repositories")
async def add_standard_repository(
    server_id: int,
    node: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("server:manage")),
):
    """Добавить стандартный репозиторий PVE по handle."""
    client = _resolve_client(db, server_id)
    data = await request.json()
    handle = data.get("handle")
    if not handle:
        raise HTTPException(status_code=400, detail="handle is required")
    try:
        return _ok_or_400(await _run_in_executor(lambda: client.add_apt_standard_repository(node, handle)))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding standard repo on {node}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
