"""
App Store — эндпоинты жизненного цикла приложений (M2: установка).

  POST   /api/appstore/apps/install            — установить приложение (app:install)
  GET    /api/appstore/apps                     — список установленных (app:view)
  GET    /api/appstore/apps/{id}                — детали (app:view)
  GET    /api/appstore/apps/{id}/operations     — журнал операций (app:view)
  GET    /api/appstore/apps/{id}/credentials    — секреты из формы, показать один раз (app:view)
  POST   /api/appstore/apps/{id}/retry          — повтор установки (app:manage)
  DELETE /api/appstore/apps/{id}                — удалить приложение вместе с LXC (app:manage)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...auth import PermissionChecker
from ...db import get_db
from ...models import AppOperation, CatalogApp, InstalledApp, User
from ...services import appstore_engine as engine

router = APIRouter()


class InstallRequest(BaseModel):
    app_id: str
    name: str
    server_id: int
    node: Optional[str] = None
    form_answers: dict = {}
    # advanced (ТЗ 7.2, шаг 2)
    cores: int = 2
    memory: int = 2048          # МБ
    disk: int = 8               # ГБ
    storage: str = "local-lvm"
    bridge: str = "vmbr0"
    ostemplate: Optional[str] = None  # переопределение золотого шаблона
    # IPAM (опционально): если задан network — IP выделяется из пула IPAM,
    # иначе контейнер получает адрес по DHCP.
    ipam_network_id: Optional[int] = None
    ipam_pool_id: Optional[int] = None


def _can_admin(user: User) -> bool:
    return bool(getattr(user, "is_admin", False)) or user.has_permission("app:manage")


def _get_owned(db: Session, app_id: int, user: User) -> InstalledApp:
    ia = db.get(InstalledApp, app_id)
    if not ia:
        raise HTTPException(status_code=404, detail="Установленное приложение не найдено")
    if not _can_admin(user) and ia.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому приложению")
    return ia


@router.post("/api/appstore/apps/install")
def install_app(
    req: InstallRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:install")),
):
    try:
        result = engine.install(
            db, current_user,
            app_id=req.app_id, name=req.name, form_answers=req.form_answers,
            server_id=req.server_id, node=req.node, cores=req.cores,
            memory=req.memory, disk=req.disk, storage=req.storage,
            bridge=req.bridge, ostemplate=req.ostemplate,
            ipam_network_id=req.ipam_network_id, ipam_pool_id=req.ipam_pool_id,
        )
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # secrets показываются один раз (в т.ч. сгенерированные random-поля)
    return {"success": True, **result}


@router.get("/api/appstore/apps")
def list_installed(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:view")),
):
    q = db.query(InstalledApp)
    if not _can_admin(current_user):
        q = q.filter(InstalledApp.owner_id == current_user.id)
    rows = q.order_by(InstalledApp.created_at.desc()).all()
    return {"items": [a.to_dict() for a in rows]}


@router.get("/api/appstore/apps/{app_id}")
def get_installed(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:view")),
):
    ia = _get_owned(db, app_id, current_user)
    data = ia.to_dict()
    catalog = db.query(CatalogApp).filter(CatalogApp.app_id == ia.app_id).first()
    if catalog:
        data["catalog"] = catalog.to_dict(light=True)
        data["update_available"] = bool(
            catalog.tipi_version and ia.tipi_version_installed
            and catalog.tipi_version > ia.tipi_version_installed
        )
    return data


@router.get("/api/appstore/apps/{app_id}/operations")
def app_operations(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:view")),
):
    _get_owned(db, app_id, current_user)
    ops = (
        db.query(AppOperation)
        .filter(AppOperation.installed_app_id == app_id)
        .order_by(AppOperation.started_at.desc())
        .limit(20)
        .all()
    )
    return {"items": [o.to_dict() for o in ops]}


@router.get("/api/appstore/apps/{app_id}/credentials")
def app_credentials(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:view")),
):
    """Секреты из формы (password/random) — расшифрованные. Только владелец/админ."""
    ia = _get_owned(db, app_id, current_user)
    env = ia.env_dict()
    catalog = db.query(CatalogApp).filter(CatalogApp.app_id == ia.app_id).first()
    secret_keys = set()
    for f in (catalog.form_fields if catalog else []) or []:
        if (f.get("type") or "").lower() in ("password", "random") and f.get("env_variable"):
            secret_keys.add(f["env_variable"])
    return {"credentials": {k: v for k, v in env.items() if k in secret_keys}}


@router.post("/api/appstore/apps/{app_id}/retry")
def retry_install(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:manage")),
):
    _get_owned(db, app_id, current_user)
    try:
        result = engine.retry_install(db, current_user, app_id)
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, **result}


class UpdateRequest(BaseModel):
    form_answers: dict = {}


@router.post("/api/appstore/apps/{app_id}/update")
def update_app(
    app_id: int,
    req: UpdateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:manage")),
):
    _get_owned(db, app_id, current_user)
    try:
        result = engine.update(db, current_user, app_id, (req.form_answers if req else {}))
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, **result}


@router.post("/api/appstore/apps/{app_id}/rollback")
def rollback_app(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:manage")),
):
    _get_owned(db, app_id, current_user)
    try:
        result = engine.rollback(db, current_user, app_id)
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, **result}


@router.post("/api/appstore/apps/{app_id}/action/{action}")
def lifecycle(
    app_id: int,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:manage")),
):
    """action: start | stop | restart."""
    _get_owned(db, app_id, current_user)
    try:
        result = engine.lifecycle_action(db, current_user, app_id, action)
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "app": result}


@router.get("/api/appstore/apps/{app_id}/logs")
def app_logs(
    app_id: int,
    tail: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:view")),
):
    _get_owned(db, app_id, current_user)
    try:
        logs = engine.get_logs(db, app_id, tail)
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"logs": logs}


@router.post("/api/appstore/apps/reconcile")
def reconcile(
    db: Session = Depends(get_db),
    _: User = Depends(PermissionChecker("app:view")),
):
    return engine.reconcile(db)


@router.delete("/api/appstore/apps/{app_id}")
def delete_app(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:manage")),
):
    _get_owned(db, app_id, current_user)
    try:
        result = engine.delete_app(db, current_user, app_id)
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, **result}
