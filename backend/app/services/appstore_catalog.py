"""
Catalog Service (M1) — конвертер runtipi/runtipi-appstore → таблица catalog_apps.

Скачивает tarball репозитория (httpx, без git-зависимости), парсит apps/<id>/,
кэширует логотипы на диск и идемпотентно upsert'ит записи в БД.

Устойчивость (ТЗ):
- F-CAT-5: битый config.json одного приложения не роняет весь синк (try/except на app).
- NF-4: отказ сети до GitHub не роняет модуль — исключение логируется, кэш в БД остаётся.
- Риск п.13: источник изолирован за интерфейсом CatalogProvider; ref фиксируется в настройках.
"""

from __future__ import annotations

import json
import os
import tarfile
import tempfile
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import httpx
import yaml
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import CatalogApp, InstalledApp

# Расширения логотипов в порядке предпочтения
_LOGO_NAMES = ("logo.jpg", "logo.png", "logo.jpeg", "logo.webp", "logo.svg")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _logos_dir() -> Path:
    d = Path(settings.APPSTORE_DATA_DIR) / "logos"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── DTO ───────────────────────────────────────────────────────────────────────

class AppRaw:
    """Сырые файлы одного приложения из репозитория."""
    def __init__(self, app_id: str):
        self.app_id = app_id
        self.config: Optional[dict] = None
        self.compose: Optional[str] = None
        self.description_md: Optional[str] = None
        self.logo_bytes: Optional[bytes] = None
        self.logo_ext: Optional[str] = None


# ── Провайдер источника (изоляция, риск п.13) ─────────────────────────────────

class CatalogProvider(ABC):
    @abstractmethod
    def fetch(self) -> Dict[str, AppRaw]:
        """Вернуть словарь app_id → AppRaw. Может бросить при сетевой ошибке."""


class RuntipiCatalogProvider(CatalogProvider):
    def __init__(self, repo: Optional[str] = None, ref: Optional[str] = None):
        self.repo = repo or settings.RUNTIPI_APPSTORE_REPO
        self.ref = ref or settings.RUNTIPI_APPSTORE_REF

    def _download(self) -> Path:
        url = f"https://github.com/{self.repo}/archive/{self.ref}.tar.gz"
        logger.info(f"[appstore] downloading catalog tarball: {url}")
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".tar.gz")
        try:
            with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
                r.raise_for_status()
                for chunk in r.iter_bytes(chunk_size=1 << 16):
                    tmp.write(chunk)
        finally:
            tmp.close()
        return Path(tmp.name)

    def fetch(self) -> Dict[str, AppRaw]:
        archive = self._download()
        apps: Dict[str, AppRaw] = {}
        try:
            with tarfile.open(archive, mode="r:gz") as tar:
                for member in tar:
                    if not member.isfile():
                        continue
                    # путь вида "runtipi-appstore-<ref>/apps/<id>/<...>"
                    parts = member.name.split("/")
                    if "apps" not in parts:
                        continue
                    ai = parts.index("apps")
                    if len(parts) <= ai + 2:
                        continue
                    app_id = parts[ai + 1]
                    rel = parts[ai + 2:]  # путь внутри apps/<id>/
                    raw = apps.setdefault(app_id, AppRaw(app_id))
                    fname = rel[-1].lower()

                    try:
                        if rel == ["config.json"]:
                            raw.config = json.loads(self._read(tar, member))
                        elif rel == ["docker-compose.yml"]:
                            raw.compose = self._read(tar, member).decode("utf-8", "replace")
                        elif rel == ["metadata", "description.md"]:
                            raw.description_md = self._read(tar, member).decode("utf-8", "replace")
                        elif len(rel) == 2 and rel[0] == "metadata" and fname in _LOGO_NAMES:
                            raw.logo_bytes = self._read(tar, member)
                            raw.logo_ext = os.path.splitext(fname)[1] or ".jpg"
                    except Exception as e:
                        logger.warning(f"[appstore] parse {app_id}/{'/'.join(rel)}: {e}")
        finally:
            try:
                archive.unlink()
            except Exception:
                pass
        return apps

    @staticmethod
    def _read(tar: tarfile.TarFile, member: tarfile.TarInfo) -> bytes:
        f = tar.extractfile(member)
        return f.read() if f else b""


# ── Синхронизация ─────────────────────────────────────────────────────────────

def _host_arch() -> str:
    return (settings.APPSTORE_HOST_ARCH or "amd64").strip().lower()


def _save_logo(app_id: str, raw: AppRaw) -> Optional[str]:
    if not raw.logo_bytes:
        return None
    ext = raw.logo_ext or ".jpg"
    fname = f"{app_id}{ext}"
    (_logos_dir() / fname).write_bytes(raw.logo_bytes)
    return f"logos/{fname}"


def _build_fields(app_id: str, raw: AppRaw) -> Optional[dict]:
    """Смаппить AppRaw → поля CatalogApp. None → приложение пропускается (F-CAT-3)."""
    cfg = raw.config
    if not cfg:
        return None
    if cfg.get("deprecated") is True:
        return None
    if not raw.compose:
        logger.info(f"[appstore] skip {app_id}: нет docker-compose.yml")
        return None
    # F-CAT-6: проверка, что compose — валидный YAML
    try:
        yaml.safe_load(raw.compose)
    except Exception as e:
        logger.info(f"[appstore] skip {app_id}: невалидный compose YAML: {e}")
        return None

    archs = cfg.get("supported_architectures") or []
    available = bool(cfg.get("available", True))
    reason = None
    if not available:
        reason = "помечено недоступным в источнике"
    elif archs and _host_arch() not in [str(a).lower() for a in archs]:
        available = False
        reason = f"нет поддержки арх. {_host_arch()}"

    return {
        "name": cfg.get("name") or app_id,
        "version": str(cfg.get("version")) if cfg.get("version") is not None else None,
        "tipi_version": cfg.get("tipi_version") if isinstance(cfg.get("tipi_version"), int) else None,
        "categories": cfg.get("categories") or [],
        "short_desc": cfg.get("short_desc"),
        "description_md": raw.description_md or cfg.get("description"),
        "port": cfg.get("port") if isinstance(cfg.get("port"), int) else None,
        "form_fields": cfg.get("form_fields") or [],
        "compose_yaml": raw.compose,
        "architectures": archs,
        "available": available,
        "unavailable_reason": reason,
        "deprecated": bool(cfg.get("deprecated", False)),
        "dynamic_config": bool(cfg.get("dynamic_config", False)),
        "source_url": cfg.get("source"),
        "author": cfg.get("author"),
    }


def sync_catalog(db: Session, ref: Optional[str] = None,
                 provider: Optional[CatalogProvider] = None) -> dict:
    """Идемпотентная синхронизация каталога. Возвращает статистику."""
    provider = provider or RuntipiCatalogProvider(ref=ref)
    started = _utcnow()
    apps = provider.fetch()  # может бросить сетевую ошибку — обрабатывает вызывающий

    created = updated = skipped = errors = 0
    seen: List[str] = []

    for app_id, raw in apps.items():
        try:
            fields = _build_fields(app_id, raw)
            if fields is None:
                skipped += 1
                continue
            fields["logo_path"] = _save_logo(app_id, raw)
            fields["synced_at"] = _utcnow()

            existing = db.query(CatalogApp).filter(CatalogApp.app_id == app_id).first()
            if existing:
                for k, v in fields.items():
                    if k == "logo_path" and v is None:
                        continue  # не затирать существующий логотип, если в этот раз не пришёл
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(CatalogApp(app_id=app_id, **fields))
                created += 1
            seen.append(app_id)
            db.commit()
        except Exception as e:  # F-CAT-5 — не роняем весь синк
            errors += 1
            db.rollback()
            logger.warning(f"[appstore] sync {app_id} failed: {e}")

    # Приложения, исчезнувшие из источника → пометить недоступными (не удаляем — M2 installed_apps)
    disappeared = 0
    if seen:
        disappeared = (
            db.query(CatalogApp)
            .filter(~CatalogApp.app_id.in_(seen), CatalogApp.available.is_(True))
            .update(
                {CatalogApp.available: False,
                 CatalogApp.unavailable_reason: "удалено из источника"},
                synchronize_session=False,
            )
        )
        db.commit()

    # F-CAT-4: выставить update_available для установленных приложений
    flagged = _refresh_update_flags(db)

    total = db.query(CatalogApp).count()
    stats = {
        "created": created, "updated": updated, "skipped": skipped,
        "errors": errors, "disappeared": disappeared, "flagged": flagged, "total": total,
        "ref": (ref or settings.RUNTIPI_APPSTORE_REF),
        "duration_sec": round((_utcnow() - started).total_seconds(), 1),
        "synced_at": _utcnow().isoformat(),
    }
    logger.info(f"[appstore] catalog sync done: {stats}")
    return stats


def _refresh_update_flags(db: Session) -> int:
    """Сравнить tipi_version каталога с установленными → выставить update_available (F-CAT-4)."""
    catalog = {c.app_id: c for c in db.query(CatalogApp).all()}
    changed = 0
    for ia in db.query(InstalledApp).all():
        c = catalog.get(ia.app_id)
        avail = bool(
            c and c.tipi_version and ia.tipi_version_installed
            and c.tipi_version > ia.tipi_version_installed
        )
        if ia.update_available != avail:
            ia.update_available = avail
            changed += 1
    if changed:
        db.commit()
    return changed


def get_catalog_meta(db: Session) -> dict:
    total = db.query(CatalogApp).count()
    last = (
        db.query(CatalogApp.synced_at)
        .order_by(CatalogApp.synced_at.desc())
        .first()
    )
    cats = set()
    for (arr,) in db.query(CatalogApp.categories).all():
        for c in (arr or []):
            cats.add(c)
    return {
        "total": total,
        "last_synced_at": last[0].isoformat() if last and last[0] else None,
        "repo": settings.RUNTIPI_APPSTORE_REPO,
        "ref": settings.RUNTIPI_APPSTORE_REF,
        "categories": sorted(cats),
    }


# ── Планировщик (F-CAT-1: авто раз в 24ч) ─────────────────────────────────────

def _scheduled_sync() -> None:
    db = SessionLocal()
    try:
        sync_catalog(db)
    except Exception as e:  # NF-4 — не роняем планировщик, кэш остаётся
        logger.warning(f"[appstore] scheduled catalog sync failed: {e}")
    finally:
        db.close()


def start_catalog_scheduler():
    """Зарегистрировать периодическую синхронизацию в общем APScheduler. Из lifespan."""
    from .backup_scheduler import get_scheduler

    aps = get_scheduler()
    aps.add_job(
        _scheduled_sync,
        trigger=IntervalTrigger(hours=settings.CATALOG_SYNC_INTERVAL_HOURS),
        id="appstore_catalog_sync",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    if not aps.running:
        aps.start()
    logger.info(
        f"App Store catalog scheduler registered (every {settings.CATALOG_SYNC_INTERVAL_HOURS}h)"
    )
    return aps
