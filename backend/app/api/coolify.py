from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import PermissionChecker, get_current_user, require_permission
from ..db import get_db
from ..models import CoolifyConnection, CoolifyInstanceMapping, User
from ..services.coolify_client import CoolifyAPIError, CoolifyClient
from .proxmox._helpers import require_vm_access


router = APIRouter(prefix="/api/coolify")


class CoolifySettingsUpdate(BaseModel):
    name: str = Field(default="Coolify", min_length=1, max_length=100)
    base_url: str = Field(min_length=1, max_length=500)
    api_token: Optional[str] = Field(default=None, max_length=2000)
    verify_ssl: bool = True
    enabled: bool = True


class CoolifySettingsTest(BaseModel):
    base_url: Optional[str] = Field(default=None, max_length=500)
    api_token: Optional[str] = Field(default=None, max_length=2000)
    verify_ssl: Optional[bool] = None


class MappingUpdate(BaseModel):
    coolify_server_uuid: Optional[str] = Field(default=None, max_length=100)


def _normalise_url(value: str) -> str:
    value = value.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise HTTPException(422, "Coolify URL must be an HTTP(S) origin without embedded credentials")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise HTTPException(422, "Coolify URL must not include a path, query, or fragment")
    return value


def _settings_response(connection: Optional[CoolifyConnection]) -> dict:
    if not connection:
        return {
            "configured": False, "name": "Coolify", "base_url": "",
            "verify_ssl": True, "enabled": False, "token_configured": False,
        }
    return {
        "configured": True, "name": connection.name, "base_url": connection.base_url,
        "verify_ssl": connection.verify_ssl, "enabled": connection.enabled,
        "token_configured": bool(connection.api_token),
    }


def _connection(db: Session, enabled: bool = True) -> CoolifyConnection:
    connection = db.query(CoolifyConnection).order_by(CoolifyConnection.id).first()
    if not connection or (enabled and not connection.enabled):
        raise HTTPException(503, "Coolify integration is not configured or enabled")
    return connection


def _client(connection: CoolifyConnection) -> CoolifyClient:
    return CoolifyClient(connection.base_url, connection.api_token, connection.verify_ssl)


def _raise_coolify(exc: CoolifyAPIError):
    raise HTTPException(exc.status_code, str(exc)) from exc


def _resource_type(resource: dict) -> Optional[str]:
    value = str(resource.get("type", "")).lower()
    if "application" in value:
        return "application"
    if "service" in value:
        return "service"
    return None


async def _mapped_resource(db: Session, server_id: int, vmid: int, resource_uuid: str):
    mapping = db.query(CoolifyInstanceMapping).filter_by(proxmox_server_id=server_id, vmid=vmid).first()
    if not mapping:
        raise HTTPException(404, "This instance is not mapped to a Coolify server")
    connection = _connection(db)
    client = _client(connection)
    try:
        resources = await client.resources(mapping.coolify_server_uuid)
    except CoolifyAPIError as exc:
        _raise_coolify(exc)
    resource = next((item for item in resources if str(item.get("uuid")) == resource_uuid), None)
    resource_type = _resource_type(resource or {})
    if not resource or not resource_type:
        raise HTTPException(404, "Coolify resource was not found on the mapped server")
    return client, resource, resource_type


@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("coolify:manage")),
):
    return _settings_response(db.query(CoolifyConnection).order_by(CoolifyConnection.id).first())


@router.put("/settings")
def update_settings(
    body: CoolifySettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("coolify:manage")),
):
    connection = db.query(CoolifyConnection).order_by(CoolifyConnection.id).first()
    token = (body.api_token or "").strip()
    if not connection and not token:
        raise HTTPException(422, "An API token is required when configuring Coolify")
    if not connection:
        connection = CoolifyConnection(base_url="", api_token=token)
        db.add(connection)
    connection.name = body.name.strip()
    connection.base_url = _normalise_url(body.base_url)
    connection.verify_ssl = body.verify_ssl
    connection.enabled = body.enabled
    if token:
        connection.api_token = token
    db.commit()
    db.refresh(connection)
    return _settings_response(connection)


@router.post("/settings/test")
async def test_settings(
    body: CoolifySettingsTest,
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("coolify:manage")),
):
    saved = db.query(CoolifyConnection).order_by(CoolifyConnection.id).first()
    base_url = _normalise_url(body.base_url) if body.base_url else (saved.base_url if saved else "")
    token = (body.api_token or "").strip() or (saved.api_token if saved else "")
    verify_ssl = body.verify_ssl if body.verify_ssl is not None else (saved.verify_ssl if saved else True)
    if not base_url or not token:
        raise HTTPException(422, "Coolify URL and API token are required")
    try:
        servers = await CoolifyClient(base_url, token, verify_ssl).servers()
    except CoolifyAPIError as exc:
        _raise_coolify(exc)
    return {"success": True, "server_count": len(servers)}


@router.get("/servers")
async def list_servers(
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("coolify:manage")),
):
    try:
        return await _client(_connection(db)).servers()
    except CoolifyAPIError as exc:
        _raise_coolify(exc)


@router.get("/instances/{server_id}/{vmid}/mapping")
def get_mapping(
    server_id: int, vmid: int, db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("coolify:view")),
):
    require_vm_access(db, current_user, server_id, vmid)
    mapping = db.query(CoolifyInstanceMapping).filter_by(proxmox_server_id=server_id, vmid=vmid).first()
    return {"coolify_server_uuid": mapping.coolify_server_uuid if mapping else None}


@router.put("/instances/{server_id}/{vmid}/mapping")
async def update_mapping(
    server_id: int, vmid: int, body: MappingUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("coolify:manage")),
):
    require_vm_access(db, current_user, server_id, vmid)
    mapping = db.query(CoolifyInstanceMapping).filter_by(proxmox_server_id=server_id, vmid=vmid).first()
    uuid = (body.coolify_server_uuid or "").strip()
    if not uuid:
        if mapping:
            db.delete(mapping)
            db.commit()
        return {"coolify_server_uuid": None}
    try:
        servers = await _client(_connection(db)).servers()
    except CoolifyAPIError as exc:
        _raise_coolify(exc)
    if not any(str(server.get("uuid")) == uuid for server in servers):
        raise HTTPException(422, "The selected Coolify server does not exist")
    if not mapping:
        mapping = CoolifyInstanceMapping(proxmox_server_id=server_id, vmid=vmid, coolify_server_uuid=uuid)
        db.add(mapping)
    else:
        mapping.coolify_server_uuid = uuid
    db.commit()
    return {"coolify_server_uuid": uuid}


@router.get("/instances/{server_id}/{vmid}/resources")
async def list_resources(
    server_id: int, vmid: int, db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("coolify:view")),
):
    require_vm_access(db, current_user, server_id, vmid)
    mapping = db.query(CoolifyInstanceMapping).filter_by(proxmox_server_id=server_id, vmid=vmid).first()
    if not mapping:
        return []
    try:
        resources = await _client(_connection(db)).resources(mapping.coolify_server_uuid)
    except CoolifyAPIError as exc:
        _raise_coolify(exc)
    return [item for item in resources if _resource_type(item)]


@router.post("/instances/{server_id}/{vmid}/resources/{resource_uuid}/{action}")
async def resource_action(
    server_id: int, vmid: int, resource_uuid: str, action: str,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    if action not in ("start", "stop", "restart", "deploy"):
        raise HTTPException(422, "Unsupported Coolify action")
    require_permission(current_user, "coolify:deploy" if action == "deploy" else "coolify:control")
    require_vm_access(db, current_user, server_id, vmid)
    client, _, resource_type = await _mapped_resource(db, server_id, vmid, resource_uuid)
    try:
        result = await client.action(resource_type, resource_uuid, action)
    except CoolifyAPIError as exc:
        _raise_coolify(exc)
    return {"success": True, "result": result}


@router.get("/instances/{server_id}/{vmid}/resources/{resource_uuid}/logs")
async def resource_logs(
    server_id: int, vmid: int, resource_uuid: str, lines: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db), current_user: User = Depends(PermissionChecker("coolify:view")),
):
    require_vm_access(db, current_user, server_id, vmid)
    client, _, resource_type = await _mapped_resource(db, server_id, vmid, resource_uuid)
    try:
        result = await client.logs(resource_type, resource_uuid, lines)
    except CoolifyAPIError as exc:
        _raise_coolify(exc)
    return result
