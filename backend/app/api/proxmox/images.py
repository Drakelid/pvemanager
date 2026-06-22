"""
API: каталог образов (зеркала) и загрузка образов ВМ/шаблонов на ноду Proxmox.

Phase 1: просмотр встроенного каталога + кастомных зеркал, динамический список
LXC-шаблонов из репозитория Proxmox, выбор целевого хранилища и фоновая загрузка
qcow2 (content=import) / vztmpl с прогрессом через DeployTask + WebSocket.
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session
from loguru import logger

from ...db import get_db
from ...models import ProxmoxServer, User, DeployTask, ImageMirror
from ...auth import PermissionChecker
from ...catalog import CATALOG, get_catalog_image
from ._helpers import _get_proxmox_client

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ImageDownloadResponse(BaseModel):
    task_id: int
    status: str
    name: str


class ImageDownloadRequest(BaseModel):
    node: str
    storage: str
    # Либо ссылка на запись каталога/зеркала...
    source_id: Optional[str] = None
    # ...либо явные параметры произвольного образа:
    kind: Optional[str] = None          # 'qcow2' | 'vztmpl'
    url: Optional[str] = None
    template: Optional[str] = None      # имя шаблона из репозитория (aplinfo)
    filename: Optional[str] = None
    checksum: Optional[str] = None
    checksum_algorithm: Optional[str] = None

    @model_validator(mode='after')
    def _check(self):
        if not self.source_id and not (self.url or self.template):
            raise ValueError('Нужен source_id, либо url/template')
        return self


# ── Catalog ──────────────────────────────────────────────────────────────────

@router.get("/api/images/catalog")
def get_image_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:view")),
):
    """Встроенный каталог cloud-образов + включённые кастомные зеркала."""
    mirrors = db.query(ImageMirror).filter(ImageMirror.enabled.is_(True)).all()
    return {
        "builtin": CATALOG,
        "mirrors": [m.to_dict() for m in mirrors],
    }


@router.get("/api/{server_id}/images/lxc-templates")
def get_lxc_repo_templates(
    server_id: int,
    node: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:view")),
):
    """Динамический список LXC-шаблонов из репозитория Proxmox (aplinfo)."""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    client = _get_proxmox_client(server)
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Cannot connect to Proxmox server")
    try:
        return JSONResponse(content=client.get_available_lxc_templates(node))
    except Exception as e:
        logger.error(f"Error listing LXC repo templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/{server_id}/images/storages")
def get_image_target_storages(
    server_id: int,
    node: str,
    content: str = Query(..., description="iso|vztmpl|images|import"),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:view")),
):
    """Целевые хранилища ноды, поддерживающие указанный тип контента."""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    client = _get_proxmox_client(server)
    if not client.is_connected():
        raise HTTPException(status_code=503, detail="Cannot connect to Proxmox server")
    try:
        return JSONResponse(content=client.get_download_target_storages(node, content))
    except Exception as e:
        logger.error(f"Error listing target storages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Download ─────────────────────────────────────────────────────────────────

def _resolve_source(db: Session, req: ImageDownloadRequest) -> dict:
    """Свести запрос к набору параметров загрузки: kind/url/template/filename/checksum."""
    if req.source_id:
        # Встроенный каталог
        item = get_catalog_image(req.source_id)
        if item:
            return {
                'kind': item['kind'], 'url': item.get('url'), 'template': None,
                'filename': item.get('filename') or (item.get('url') or '').rsplit('/', 1)[-1],
                'checksum': item.get('checksum'),
                'checksum_algorithm': item.get('checksum_algorithm'),
                'name': item['name'],
            }
        # Кастомное зеркало: source_id вида "mirror-<id>"
        if req.source_id.startswith('mirror-'):
            try:
                mid = int(req.source_id.split('-', 1)[1])
            except ValueError:
                mid = None
            mirror = db.query(ImageMirror).filter(ImageMirror.id == mid).first() if mid else None
            if mirror:
                fname = (mirror.url or '').rsplit('/', 1)[-1] or mirror.template
                return {
                    'kind': mirror.kind, 'url': mirror.url, 'template': mirror.template,
                    'filename': fname,
                    'checksum': mirror.checksum,
                    'checksum_algorithm': mirror.checksum_algorithm,
                    'name': mirror.name,
                }
        raise HTTPException(status_code=404, detail="Источник образа не найден")

    # Произвольный образ из тела запроса
    kind = req.kind or 'qcow2'
    filename = req.filename or (req.url or '').rsplit('/', 1)[-1] or req.template
    if not filename:
        raise HTTPException(status_code=400, detail="Не удалось определить имя файла")
    return {
        'kind': kind, 'url': req.url, 'template': req.template, 'filename': filename,
        'checksum': req.checksum, 'checksum_algorithm': req.checksum_algorithm,
        'name': filename,
    }


@router.post("/api/{server_id}/images/download", response_model=ImageDownloadResponse)
async def download_image(
    server_id: int,
    req: ImageDownloadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("template:manage")),
):
    """Запустить фоновую загрузку образа в хранилище ноды."""
    # Ленивый импорт во избежание циклической зависимости templates <-> api.proxmox
    from ..templates import _deploy_executor
    from .async_ops import _do_image_download_sync

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")

    src = _resolve_source(db, req)
    if src['kind'] == 'vztmpl' and not src['template'] and not src['url']:
        raise HTTPException(status_code=400, detail="Для vztmpl нужен url или template")
    if src['kind'] != 'vztmpl' and not src['url']:
        raise HTTPException(status_code=400, detail="Для qcow2 нужен url")

    task = DeployTask(
        status='pending', step='В очереди...', progress=0,
        kind='image_download', name=src['name'],
        server_id=server_id, user_id=current_user.id, node=req.node,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    task_id = task.id

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _deploy_executor,
        _do_image_download_sync,
        task_id, server_id, req.node, req.storage,
        src['kind'], src['filename'], src['url'], src['template'],
        src['checksum'], src['checksum_algorithm'],
        current_user.id, current_user.username,
    )

    logger.info(f"[IMG DL] Task #{task_id} queued: {src['filename']} by {current_user.username}")
    return ImageDownloadResponse(task_id=task_id, status='pending', name=src['name'])
