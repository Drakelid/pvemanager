"""
Workspace API
=============
Endpoints for managing workspaces — named groups of Proxmox servers
with scoped user access.

Admin-only: create, update, delete, assign servers/users.
All authenticated: list (filtered to their workspaces), get detail.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from loguru import logger

from ..db import get_db
from ..models import Workspace, WorkspaceServer, WorkspaceUser, ProxmoxServer, User
from ..schemas import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, WorkspaceDetail
from ..auth import get_current_user, PermissionChecker
from ..logging_service import LoggingService

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: resolve workspace server IDs from X-Active-Workspace header
# ---------------------------------------------------------------------------

def get_workspace_server_ids(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Optional[List[int]]:
    """
    Read X-Active-Workspace header and return list[int] of server_ids
    that belong to that workspace AND that the current user can access.

    Returns None when:
    - Header is absent → no workspace filter (show all, admin behaviour)
    - workspace_id == 0 → explicit "show all" (admin only)
    - workspace not found or user has no access → empty list (403-ish)
    """
    raw = request.headers.get("X-Active-Workspace")
    if raw is None:
        return None  # no filter

    try:
        workspace_id = int(raw)
    except ValueError:
        return None

    if workspace_id == 0:
        # "All workspaces" — only admins may use this
        if current_user.is_admin:
            return None
        # non-admin trying to bypass → return their union of server_ids
        workspace_id = None

    if workspace_id is None:
        # Collect all workspaces the user belongs to
        wus = db.query(WorkspaceUser).filter(WorkspaceUser.user_id == current_user.id).all()
        ws_ids = [wu.workspace_id for wu in wus]
        if not ws_ids:
            # Fall back to Default workspace
            default_ws = db.query(Workspace).filter(Workspace.is_default == True).first()
            if default_ws:
                ws_ids = [default_ws.id]
            else:
                return []
        rows = db.query(WorkspaceServer.server_id).filter(
            WorkspaceServer.workspace_id.in_(ws_ids)
        ).all()
        return [r.server_id for r in rows]

    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        return []

    # Check access: admins always have access; regular users need WorkspaceUser entry
    if not current_user.is_admin:
        access = db.query(WorkspaceUser).filter(
            WorkspaceUser.workspace_id == workspace_id,
            WorkspaceUser.user_id == current_user.id,
        ).first()
        if not access:
            return []

    rows = db.query(WorkspaceServer.server_id).filter(
        WorkspaceServer.workspace_id == workspace_id
    ).all()
    return [r.server_id for r in rows]


# ---------------------------------------------------------------------------
# Helper: build WorkspaceResponse with counters
# ---------------------------------------------------------------------------

def _build_response(ws: Workspace) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        color=ws.color,
        is_default=ws.is_default,
        server_count=len(ws.workspace_servers),
        user_count=len(ws.workspace_users),
        created_at=ws.created_at,
    )


def _build_detail(ws: Workspace) -> WorkspaceDetail:
    from ..schemas import WorkspaceServerItem, WorkspaceUserItem
    servers = [
        WorkspaceServerItem(
            id=wss.server.id,
            name=wss.server.name,
            ip_address=wss.server.ip_address,
            is_online=wss.server.is_online,
            cluster_name=wss.server.cluster_name,
        )
        for wss in ws.workspace_servers
        if wss.server is not None
    ]
    users = [
        WorkspaceUserItem(
            id=wsu.user.id,
            username=wsu.user.username,
            email=wsu.user.email,
            full_name=wsu.user.full_name,
        )
        for wsu in ws.workspace_users
        if wsu.user is not None
    ]
    return WorkspaceDetail(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        color=ws.color,
        is_default=ws.is_default,
        server_count=len(servers),
        user_count=len(users),
        created_at=ws.created_at,
        servers=servers,
        users=users,
    )


# ===========================================================================
# REST API
# ===========================================================================

@router.get("/api/workspaces", response_model=List[WorkspaceResponse])
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List workspaces.
    Admins see all; regular users see only workspaces they belong to
    (plus the Default workspace).
    """
    if current_user.is_admin:
        workspaces = db.query(Workspace).order_by(Workspace.is_default.desc(), Workspace.name).all()
    else:
        wus = db.query(WorkspaceUser).filter(WorkspaceUser.user_id == current_user.id).all()
        ws_ids = [wu.workspace_id for wu in wus]
        # Always include default workspace
        default_ws = db.query(Workspace).filter(Workspace.is_default == True).first()
        if default_ws and default_ws.id not in ws_ids:
            ws_ids.append(default_ws.id)
        workspaces = db.query(Workspace).filter(Workspace.id.in_(ws_ids)).order_by(
            Workspace.is_default.desc(), Workspace.name
        ).all()

    return [_build_response(ws) for ws in workspaces]


@router.post("/api/workspaces", response_model=WorkspaceDetail, status_code=status.HTTP_201_CREATED)
def create_workspace(
    data: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Create a new workspace (admin only)."""
    existing = db.query(Workspace).filter(Workspace.name == data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Workspace with name '{data.name}' already exists",
        )

    ws = Workspace(
        name=data.name,
        description=data.description,
        color=data.color or "#667eea",
        is_default=False,
        created_by=current_user.id,
    )
    db.add(ws)
    db.flush()  # get ws.id

    # Assign servers
    for server_id in (data.server_ids or []):
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if server:
            db.add(WorkspaceServer(workspace_id=ws.id, server_id=server_id))

    # Assign users
    for user_id in (data.user_ids or []):
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.add(WorkspaceUser(workspace_id=ws.id, user_id=user_id))

    db.commit()
    db.refresh(ws)

    LoggingService.log(
        db=db,
        level=LoggingService.INFO,
        category=LoggingService.SYSTEM,
        action="workspace_create",
        message=f"Workspace '{ws.name}' created",
        username=current_user.username,
        user_id=current_user.id,
        resource_type="workspace",
        resource_id=str(ws.id),
        resource_name=ws.name,
        success=True,
    )
    logger.info(f"User {current_user.username} created workspace: {ws.name}")
    return _build_detail(ws)


@router.get("/api/workspaces/{workspace_id}", response_model=WorkspaceDetail)
def get_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get workspace detail with servers and users list."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not current_user.is_admin:
        access = db.query(WorkspaceUser).filter(
            WorkspaceUser.workspace_id == workspace_id,
            WorkspaceUser.user_id == current_user.id,
        ).first()
        if not access and not ws.is_default:
            raise HTTPException(status_code=403, detail="Access denied")

    return _build_detail(ws)


@router.put("/api/workspaces/{workspace_id}", response_model=WorkspaceDetail)
def update_workspace(
    workspace_id: int,
    data: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Update workspace name/description/color (admin only)."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if data.name is not None:
        dup = db.query(Workspace).filter(
            Workspace.name == data.name, Workspace.id != workspace_id
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Name '{data.name}' already taken")
        ws.name = data.name
    if data.description is not None:
        ws.description = data.description
    if data.color is not None:
        ws.color = data.color

    db.commit()
    db.refresh(ws)
    logger.info(f"User {current_user.username} updated workspace {ws.id}: {ws.name}")
    return _build_detail(ws)


@router.delete("/api/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Delete workspace (admin only). Default workspace cannot be deleted."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the Default workspace")

    db.delete(ws)
    db.commit()
    logger.info(f"User {current_user.username} deleted workspace {workspace_id}: {ws.name}")


# ---------------------------------------------------------------------------
# Server assignment
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _BaseModel


class _IdsRequest(_BaseModel):
    ids: List[int]


@router.post("/api/workspaces/{workspace_id}/servers", response_model=WorkspaceDetail)
def assign_servers(
    workspace_id: int,
    body: _IdsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Replace the server list of a workspace (admin only)."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Remove existing
    db.query(WorkspaceServer).filter(WorkspaceServer.workspace_id == workspace_id).delete()

    # Add new
    for server_id in body.ids:
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if server:
            db.add(WorkspaceServer(workspace_id=workspace_id, server_id=server_id))

    db.commit()
    db.refresh(ws)
    return _build_detail(ws)


@router.delete("/api/workspaces/{workspace_id}/servers/{server_id}", response_model=WorkspaceDetail)
def remove_server(
    workspace_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Remove a single server from a workspace (admin only)."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    db.query(WorkspaceServer).filter(
        WorkspaceServer.workspace_id == workspace_id,
        WorkspaceServer.server_id == server_id,
    ).delete()
    db.commit()
    db.refresh(ws)
    return _build_detail(ws)


# ---------------------------------------------------------------------------
# User assignment
# ---------------------------------------------------------------------------

@router.post("/api/workspaces/{workspace_id}/users", response_model=WorkspaceDetail)
def assign_users(
    workspace_id: int,
    body: _IdsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Replace the user list of a workspace (admin only)."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    db.query(WorkspaceUser).filter(WorkspaceUser.workspace_id == workspace_id).delete()

    for user_id in body.ids:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.add(WorkspaceUser(workspace_id=workspace_id, user_id=user_id))

    db.commit()
    db.refresh(ws)
    return _build_detail(ws)


@router.delete("/api/workspaces/{workspace_id}/users/{user_id}", response_model=WorkspaceDetail)
def remove_user(
    workspace_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("settings.panel")),
):
    """Remove a single user from a workspace (admin only)."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    db.query(WorkspaceUser).filter(
        WorkspaceUser.workspace_id == workspace_id,
        WorkspaceUser.user_id == user_id,
    ).delete()
    db.commit()
    db.refresh(ws)
    return _build_detail(ws)
