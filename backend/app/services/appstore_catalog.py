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

import base64
import json
import os
import tarfile
import tempfile
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
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

# Лимиты на вспомогательные файлы приложения (data_files): защищаемся от
# гигантских бинарей в репозитории каталога — они не нужны для bind-mount'ов
# конфигов/скриптов, а раздули бы БД.
_DATA_FILE_MAX = 512 * 1024        # на один файл
_DATA_TOTAL_MAX = 4 * 1024 * 1024  # суммарно на приложение


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _logos_dir() -> Path:
    d = Path(settings.APPSTORE_DATA_DIR) / "logos"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── DTO ───────────────────────────────────────────────────────────────────────

class AppRaw:
    """Сырые файлы одного приложения из репозитория."""
    def __init__(self, app_id: str, source: str = "runtipi"):
        self.app_id = app_id
        self.source = source
        self.config: Optional[dict] = None
        self.compose: Optional[str] = None
        self.description_md: Optional[str] = None
        self.logo_bytes: Optional[bytes] = None
        self.logo_ext: Optional[str] = None
        # Файлы приложения, которые compose монтирует из ${APP_DATA_DIR}:
        # {relpath: {"b64": <base64>, "exec": bool}}. Без них у ~60% приложений
        # bind-mount'ы указывают на несуществующие конфиги/скрипты.
        self.data_files: Dict[str, dict] = {}
        self._data_total = 0

    def add_data_file(self, relpath: str, data: bytes, mode: int) -> None:
        """Добавить вспомогательный файл с учётом лимитов размера."""
        if len(data) > _DATA_FILE_MAX:
            logger.info(f"[appstore] skip data file {self.app_id}/{relpath}: "
                        f"{len(data)} bytes > {_DATA_FILE_MAX}")
            return
        if self._data_total + len(data) > _DATA_TOTAL_MAX:
            logger.info(f"[appstore] skip data file {self.app_id}/{relpath}: "
                        f"превышен общий лимит {_DATA_TOTAL_MAX}")
            return
        self.data_files[relpath] = {
            "b64": base64.b64encode(data).decode("ascii"),
            "exec": bool(mode & 0o100),
        }
        self._data_total += len(data)


# ── Провайдер источника (изоляция, риск п.13) ─────────────────────────────────

class CatalogProvider(ABC):
    # источник, к которому относится провайдер (для scoping'а в sync_catalog)
    source: str = "runtipi"

    @abstractmethod
    def fetch(self) -> Dict[str, AppRaw]:
        """Вернуть словарь app_id → AppRaw. Может бросить при сетевой ошибке."""

    @staticmethod
    def _download_tarball(repo: str, ref: str) -> Path:
        url = f"https://github.com/{repo}/archive/{ref}.tar.gz"
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

    @staticmethod
    def _read(tar: tarfile.TarFile, member: tarfile.TarInfo) -> bytes:
        f = tar.extractfile(member)
        return f.read() if f else b""


class RuntipiCatalogProvider(CatalogProvider):
    source = "runtipi"

    def __init__(self, repo: Optional[str] = None, ref: Optional[str] = None):
        self.repo = repo or settings.RUNTIPI_APPSTORE_REPO
        self.ref = ref or settings.RUNTIPI_APPSTORE_REF

    def _download(self) -> Path:
        return self._download_tarball(self.repo, self.ref)

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
                    raw = apps.setdefault(app_id, AppRaw(app_id, source=self.source))
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
                        elif len(rel) >= 2 and rel[0] == "data":
                            # apps/<id>/data/** — файлы, которые Runtipi копирует в
                            # app-data и на которые compose ссылается как
                            # ${APP_DATA_DIR}/data/<...> (конфиги, скрипты).
                            raw.add_data_file("/".join(rel), self._read(tar, member),
                                              member.mode)
                    except Exception as e:
                        logger.warning(f"[appstore] parse {app_id}/{'/'.join(rel)}: {e}")
        finally:
            try:
                archive.unlink()
            except Exception:
                pass
        return apps


class UmbrelCatalogProvider(CatalogProvider):
    """Провайдер каталога Umbrel (getumbrel/umbrel-apps).

    Структура репозитория: `<repo>-<ref>/<app-id>/{umbrel-app.yml,
    docker-compose.yml, <logo>}`. Метаданные лежат в umbrel-app.yml (а не в
    compose, как у Runtipi), поэтому нормализуем их в тот же shape, что ждёт
    _build_fields. app_id префиксуется "umbrel-" для изоляции PK от Runtipi.
    """
    source = "umbrel"
    PREFIX = "umbrel-"

    def __init__(self, repo: Optional[str] = None, ref: Optional[str] = None,
                 gallery_cdn: Optional[str] = None):
        self.repo = repo or settings.UMBREL_APPSTORE_REPO
        self.ref = ref or settings.UMBREL_APPSTORE_REF
        self.gallery_cdn = gallery_cdn or settings.UMBREL_APPSTORE_GALLERY_CDN

    def fetch(self) -> Dict[str, AppRaw]:
        archive = self._download_tarball(self.repo, self.ref)
        apps: Dict[str, AppRaw] = {}
        try:
            with tarfile.open(archive, mode="r:gz") as tar:
                for member in tar:
                    if not member.isfile():
                        continue
                    # путь вида "<repo>-<ref>/<app-id>/<...>"
                    parts = member.name.split("/")
                    if len(parts) < 3:
                        continue
                    raw_id = parts[1]
                    if not raw_id or raw_id.startswith("."):
                        continue  # .github, .gitignore и т.п.
                    app_id = self.PREFIX + raw_id
                    fname = parts[-1].lower()
                    rel = "/".join(parts[2:])  # путь внутри папки приложения
                    raw = apps.setdefault(app_id, AppRaw(app_id, source=self.source))
                    try:
                        if rel == "umbrel-app.yml":
                            raw.config = self._map_manifest(
                                raw_id, yaml.safe_load(self._read(tar, member)))
                        elif rel == "docker-compose.yml":
                            raw.compose = self._read(tar, member).decode("utf-8", "replace")
                        elif len(parts) == 3 and fname in _LOGO_NAMES:
                            raw.logo_bytes = self._read(tar, member)
                            raw.logo_ext = os.path.splitext(fname)[1] or ".jpg"
                        elif len(parts) == 3 and fname.startswith(("icon.", "gallery")):
                            pass  # ассеты витрины — не файлы приложения
                        else:
                            # Остальные файлы (включая вложенные, напр. data/**,
                            # entrypoint.sh) Umbrel копирует в app-data приложения,
                            # а compose монтирует их как ${APP_DATA_DIR}/<relpath>.
                            raw.add_data_file(rel, self._read(tar, member), member.mode)
                    except Exception as e:
                        logger.warning(f"[appstore] parse umbrel {app_id}/{fname}: {e}")
        finally:
            try:
                archive.unlink()
            except Exception:
                pass

        # Иконки — из галереи Umbrel (<app-id>/icon.svg), пофайлово с CDN. Сбой
        # получения иконок не должен ронять синк каталога.
        try:
            raw_ids = [app_id[len(self.PREFIX):] for app_id in apps]
            icons = self._fetch_gallery_icons(raw_ids)
            for app_id, raw in apps.items():
                data = icons.get(app_id[len(self.PREFIX):])
                if data:
                    raw.logo_bytes = data
                    raw.logo_ext = ".svg"
            logger.info(f"[appstore] umbrel icons fetched: {len(icons)}/{len(apps)}")
        except Exception as e:
            logger.warning(f"[appstore] umbrel gallery icons failed: {e}")

        return apps

    def _fetch_gallery_icons(self, raw_ids: List[str]) -> Dict[str, bytes]:
        """Скачать icon.svg каждого приложения параллельно с CDN галереи Umbrel.

        Быстрее тяжёлого tarball галереи (тот тянет и скриншоты). HTTP 404 → у
        приложения нет иконки (не ошибка); сетевой сбой отдельного запроса просто
        пропускает иконку, не роняя синк.
        """
        base = (self.gallery_cdn or "").rstrip("/")
        if not base or not raw_ids:
            return {}

        def _one(raw_id: str):
            url = f"{base}/{raw_id}/icon.svg"
            try:
                r = httpx.get(url, timeout=15, follow_redirects=True)
                if r.status_code == 200 and r.content:
                    return raw_id, r.content
            except Exception:
                return None
            return None

        icons: Dict[str, bytes] = {}
        with ThreadPoolExecutor(max_workers=16, thread_name_prefix="umbrel_icons") as ex:
            for res in ex.map(_one, raw_ids):
                if res:
                    icons[res[0]] = res[1]
        return icons

    @staticmethod
    def _map_manifest(raw_id: str, meta: Optional[dict]) -> Optional[dict]:
        """umbrel-app.yml → config-словарь в формате, ожидаемом _build_fields."""
        if not isinstance(meta, dict):
            return None
        cat = meta.get("category")
        categories = [str(cat)] if cat else []
        port = meta.get("port")
        # Учётные данные по умолчанию: без них пользователю после установки
        # неоткуда узнать логин/пароль приложения (Umbrel показывает их в своём
        # UI). deterministicPassword: true — пароль генерирует рантайм и
        # передаёт через APP_PASSWORD (у нас — сгенерированный при установке).
        default_creds = None
        du = str(meta.get("defaultUsername") or "").strip()
        dp = str(meta.get("defaultPassword") or "").strip()
        deterministic = bool(meta.get("deterministicPassword"))
        if du or dp or deterministic:
            default_creds = {"username": du or None, "password": dp or None,
                             "deterministic": deterministic}
        return {
            "name": meta.get("name") or raw_id,
            "version": str(meta.get("version")) if meta.get("version") is not None else None,
            # у Umbrel нет целочисленной версии рецепта — update_available по
            # tipi_version для umbrel-приложений не вычисляется (см. _refresh_update_flags).
            "tipi_version": None,
            "categories": categories,
            "short_desc": meta.get("tagline"),
            "description": meta.get("description"),
            "port": port if isinstance(port, int) else None,
            "form_fields": [],  # Umbrel не описывает поля формы декларативно
            "supported_architectures": [],  # обычно multi-arch — не ограничиваем
            "available": True,
            "deprecated": False,
            "dynamic_config": False,
            "source": meta.get("repo") or meta.get("website"),
            "author": meta.get("developer") or meta.get("submitter"),
            "default_credentials": default_creds,
        }


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
        "source": raw.source or "runtipi",
        "name": cfg.get("name") or app_id,
        "version": str(cfg.get("version")) if cfg.get("version") is not None else None,
        "tipi_version": cfg.get("tipi_version") if isinstance(cfg.get("tipi_version"), int) else None,
        "categories": cfg.get("categories") or [],
        "short_desc": cfg.get("short_desc"),
        "description_md": raw.description_md or cfg.get("description"),
        "port": cfg.get("port") if isinstance(cfg.get("port"), int) else None,
        "form_fields": cfg.get("form_fields") or [],
        "compose_yaml": raw.compose,
        "data_files": raw.data_files or None,
        "default_credentials": cfg.get("default_credentials"),
        "architectures": archs,
        "available": available,
        "unavailable_reason": reason,
        "deprecated": bool(cfg.get("deprecated", False)),
        "dynamic_config": bool(cfg.get("dynamic_config", False)),
        "source_url": cfg.get("source"),
        "author": cfg.get("author"),
    }


def _enabled_providers(ref: Optional[str] = None) -> List[CatalogProvider]:
    """Список провайдеров по настройке APPSTORE_SOURCES."""
    raw = (settings.APPSTORE_SOURCES or "runtipi")
    names = [s.strip().lower() for s in raw.split(",") if s.strip()]
    providers: List[CatalogProvider] = []
    for n in names:
        if n == "runtipi":
            providers.append(RuntipiCatalogProvider(ref=ref))
        elif n == "umbrel":
            # ref относится к runtipi (совместимость со старой сигнатурой) — Umbrel
            # берёт собственный UMBREL_APPSTORE_REF.
            providers.append(UmbrelCatalogProvider())
        else:
            logger.warning(f"[appstore] unknown catalog source '{n}', пропущен")
    if not providers:
        providers.append(RuntipiCatalogProvider(ref=ref))
    return providers


def sync_catalog(db: Session, ref: Optional[str] = None,
                 provider: Optional[CatalogProvider] = None) -> dict:
    """Идемпотентная синхронизация каталога из всех активных источников.

    Каждый источник синхронизируется независимо: сетевой сбой одного не отменяет
    остальные, а пометка «исчезнувших» приложений scoped'ится по source, чтобы
    синк runtipi не задел записи umbrel и наоборот.
    """
    providers = [provider] if provider is not None else _enabled_providers(ref)
    started = _utcnow()

    created = updated = skipped = errors = disappeared = 0
    source_errors: List[str] = []

    for prov in providers:
        try:
            apps = prov.fetch()
        except Exception as e:  # NF-4 — источник недоступен, не роняем остальные
            source_errors.append(f"{prov.source}: {e}")
            logger.warning(f"[appstore] fetch source '{prov.source}' failed: {e}")
            continue

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
                            continue  # не затирать существующий логотип
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

        # Исчезнувшие из ЭТОГО источника → недоступны (scoped по source).
        if seen:
            disappeared += (
                db.query(CatalogApp)
                .filter(
                    CatalogApp.source == prov.source,
                    ~CatalogApp.app_id.in_(seen),
                    CatalogApp.available.is_(True),
                )
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
        "sources": [p.source for p in providers if p is not None],
        "source_errors": source_errors,
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
    sources = sorted(
        s for (s,) in db.query(CatalogApp.source).distinct().all() if s
    )
    return {
        "total": total,
        "last_synced_at": last[0].isoformat() if last and last[0] else None,
        "repo": settings.RUNTIPI_APPSTORE_REPO,
        "ref": settings.RUNTIPI_APPSTORE_REF,
        "categories": sorted(cats),
        "sources": sources,
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

    # Стартовый синк: на свежем деплое каталог пуст, а IntervalTrigger впервые
    # сработает только через CATALOG_SYNC_INTERVAL_HOURS. Чтобы не ждать 24ч,
    # запускаем разовый синк немедленно в фоне (не блокируя старт приложения).
    try:
        db = SessionLocal()
        try:
            is_empty = db.query(CatalogApp).count() == 0
        finally:
            db.close()
        if is_empty:
            aps.add_job(
                _scheduled_sync,
                trigger="date",  # run_date по умолчанию = сейчас → разовый запуск
                id="appstore_catalog_initial_sync",
                replace_existing=True,
                misfire_grace_time=600,
            )
            logger.info("App Store catalog empty — initial sync scheduled")
    except Exception as e:
        logger.warning(f"App Store initial catalog sync check failed: {e}")

    if not aps.running:
        aps.start()
    logger.info(
        f"App Store catalog scheduler registered (every {settings.CATALOG_SYNC_INTERVAL_HOURS}h)"
    )
    return aps
