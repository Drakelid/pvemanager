"""
App Store — эндпоинты каталога (M1).

  GET  /api/appstore/catalog            — список карточек (поиск/категория/пагинация)
  GET  /api/appstore/catalog/meta       — метаданные (last_synced_at, count, категории)
  GET  /api/appstore/catalog/{app_id}   — деталь приложения (описание, форма, compose)
  GET  /api/appstore/catalog/{app_id}/logo   — логотип из кэша
  POST /api/appstore/catalog/sync       — ручная синхронизация (admin)
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...auth import PermissionChecker
from ...config import settings
from ...db import SessionLocal, get_db
from ...models import CatalogApp, User
from ...services import appstore_engine as engine
from ...services.appstore_catalog import get_catalog_meta, sync_catalog

router = APIRouter()


@router.get("/api/appstore/catalog")
def list_catalog(
    q: Optional[str] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    available_only: bool = False,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: object = Depends(PermissionChecker("app:view")),
):
    query = db.query(CatalogApp)
    if available_only:
        query = query.filter(CatalogApp.available.is_(True))
    if source:
        query = query.filter(CatalogApp.source == source.strip().lower())
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(or_(
            CatalogApp.name.ilike(like),
            CatalogApp.short_desc.ilike(like),
            CatalogApp.app_id.ilike(like),
        ))

    rows = query.order_by(CatalogApp.name.asc()).all()

    # Фильтр по категории — в Python: categories хранится как JSON-массив строк,
    # это надёжнее JSONB-операторов на generic JSON-колонке (независимо от диалекта).
    if category:
        rows = [r for r in rows if category in (r.categories or [])]

    total = len(rows)
    page = rows[offset:offset + limit]
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [a.to_dict(light=True) for a in page],
    }


@router.get("/api/appstore/catalog/meta")
def catalog_meta(
    db: Session = Depends(get_db),
    _: object = Depends(PermissionChecker("app:view")),
):
    return get_catalog_meta(db)


@router.get("/api/appstore/catalog/{app_id}")
def get_app(
    app_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(PermissionChecker("app:view")),
):
    app = db.query(CatalogApp).filter(CatalogApp.app_id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Приложение не найдено в каталоге")
    return app.to_dict(with_compose=True)


@router.get("/api/appstore/catalog/{app_id}/logo")
def get_app_logo(
    app_id: str,
    db: Session = Depends(get_db),
):
    # Публичный: логотипы — брендовые картинки, не секреты; тег <img> не шлёт JWT.
    app = db.query(CatalogApp).filter(CatalogApp.app_id == app_id).first()
    if not app or not app.logo_path:
        raise HTTPException(status_code=404, detail="Логотип не найден")
    base = Path(settings.APPSTORE_DATA_DIR).resolve()
    path = (base / app.logo_path).resolve()
    # защита от path traversal: файл обязан лежать внутри data-каталога
    if base not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Файл логотипа отсутствует")
    return FileResponse(str(path))


@router.post("/api/appstore/catalog/sync")
async def trigger_sync(
    _: object = Depends(PermissionChecker("app:manage")),
):
    """Ручной запуск синхронизации каталога. Блокирующий синк — в пуле потоков."""
    def _do() -> dict:
        db = SessionLocal()
        try:
            return sync_catalog(db)
        finally:
            db.close()

    try:
        stats = await asyncio.get_event_loop().run_in_executor(None, _do)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Синхронизация не удалась: {e}")
    return {"success": True, "stats": stats}


# ── Золотой шаблон (Workstream B) ─────────────────────────────────────────────

class GoldenTemplateRequest(BaseModel):
    server_id: int
    node: Optional[str] = None
    template_storage: str = "local"     # dir-storage для итогового vztmpl
    rootfs_storage: str = "local-lvm"   # storage для rootfs временного CT
    bridge: str = "vmbr0"
    force: bool = False                 # пересобрать, даже если шаблон уже есть


@router.post("/api/appstore/golden-template")
def build_golden_template(
    req: GoldenTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("app:manage")),
):
    """Собрать золотой LXC-шаблон на ноде (фоновая операция). Прогресс — по WebSocket."""
    try:
        result = engine.prepare_golden_template(
            db, current_user, server_id=req.server_id, node=req.node,
            template_storage=req.template_storage, rootfs_storage=req.rootfs_storage,
            bridge=req.bridge, force=req.force,
        )
    except engine.EngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, **result}


@router.get("/api/appstore/golden-template/status")
def golden_template_status(
    db: Session = Depends(get_db),
    _: object = Depends(PermissionChecker("app:view")),
):
    """Текущий шаблон (БД/env) и последняя операция сборки."""
    return engine.golden_template_status(db)
