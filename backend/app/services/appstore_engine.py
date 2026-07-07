"""
App Engine (M2) — жизненный цикл приложения поверх пайплайна M0.

Установка: клон золотого шаблона → pct push compose/.env → docker compose up →
health-check, с журналом шагов (app_operations), статусами (installed_apps),
шифрованием env-секретов (Fernet) и прогрессом по WebSocket.

Переиспуёт app/appstore/pipeline.py (poc_install / poc_teardown).
"""

from __future__ import annotations

import json
import re
import secrets as _secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from apscheduler.triggers.interval import IntervalTrigger

from ..appstore.pipeline import (
    APP_DIR, APP_DATA_DIR, InstallSpec, PocError, _NAME_RE, _node_ssh, _shq,
    poc_install, poc_teardown, poc_update,
)
from ..api.proxmox._helpers import _get_proxmox_client, get_next_vmid
from ..config import settings
from ..db import SessionLocal
from ..ipam_service import IPAMService
from ..models import AppOperation, CatalogApp, InstalledApp, IPAMNetwork, ProxmoxServer
from ..websocket_manager import broadcast_task_update

_engine_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="appstore_engine")


class EngineError(RuntimeError):
    """Ошибка бизнес-валидации движка (человекочитаемая)."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Журнал операции + WS ──────────────────────────────────────────────────────

def _record_step(operation_id: int, user_id: int, step: str, progress: int) -> None:
    """Добавить шаг в журнал операции и разослать по WebSocket (своя сессия)."""
    db = SessionLocal()
    try:
        op = db.get(AppOperation, operation_id)
        if not op:
            return
        log = list(op.steps_log or [])
        log.append({"step": step, "progress": progress, "ts": _utcnow().isoformat()})
        op.steps_log = log
        op.progress = progress
        db.commit()
        try:
            broadcast_task_update(user_id, "appstore_operation_update", op.to_dict())
        except Exception:
            pass
    finally:
        db.close()


def _finish_op(operation_id: int, user_id: int, status: str, error: Optional[str] = None) -> None:
    db = SessionLocal()
    try:
        op = db.get(AppOperation, operation_id)
        if not op:
            return
        op.status = status
        op.finished_at = _utcnow()
        if error:
            op.error_text = error[:2000]
        if status == "completed":
            op.progress = 100
        db.commit()
        try:
            broadcast_task_update(user_id, "appstore_operation_update", op.to_dict())
        except Exception:
            pass
    finally:
        db.close()


# ── Генерация env (ТЗ 5.3 + 6.2) ──────────────────────────────────────────────

def _generate_random(length: int) -> str:
    length = max(8, int(length or 32))
    # hex → безопасно для .env (нет спецсимволов), длина = length
    return _secrets.token_hex(length // 2 + 1)[:length]


def build_env(app: CatalogApp, form_answers: dict) -> tuple[dict, dict]:
    """Собрать .env: платформенные переменные + ответы формы + random-секреты.

    Возвращает (env, secrets_shown) — secrets_shown показываются пользователю один раз.
    """
    form_answers = form_answers or {}
    env = {
        "APP_PORT": str(app.port or 80),
        "APP_DATA_DIR": APP_DATA_DIR,
        "APP_PROTOCOL": "http",
        "APP_EXPOSED": "false",
        "APP_ID": app.app_id,
        "TZ": settings.TZ,
        "ROOT_FOLDER_HOST": APP_DATA_DIR,
    }
    secrets_shown: dict = {}

    for field in (app.form_fields or []):
        ev = field.get("env_variable")
        if not ev:
            continue
        ftype = (field.get("type") or "text").lower()

        if ftype == "random":
            val = _generate_random(field.get("min") or 32)
            env[ev] = val
            secrets_shown[ev] = val
            continue

        val = form_answers.get(ev)
        if val is None or val == "":
            if field.get("required"):
                raise EngineError(f"Поле '{field.get('label') or ev}' обязательно")
            val = field.get("default", "")

        if ftype == "boolean":
            val = "true" if str(val).lower() in ("1", "true", "yes", "on") else "false"
        val = str(val)
        env[ev] = val
        if ftype == "password":
            secrets_shown[ev] = val

    return env, secrets_shown


# ── Установка ─────────────────────────────────────────────────────────────────

def _allocate_ipam(db, *, network_id: int, pool_id: Optional[int], name: str,
                   server_id: int, vmid: int, node: Optional[str],
                   allocated_by: Optional[str]) -> tuple[str, str]:
    """Выделить IP из IPAM для приложения. Возвращает (ip_config, static_ip).

    ip_config — строка для net0 ("ip=<addr>/<mask>,gw=<gw>"). Бросает EngineError
    при отсутствии свободного адреса, чтобы ошибка сразу вернулась пользователю.
    """
    ipam = IPAMService(db)
    allocation, error = ipam.auto_allocate_ip(
        network_id=network_id, pool_id=pool_id,
        resource_type="ct", resource_name=name,
        proxmox_server_id=server_id, proxmox_vmid=vmid, proxmox_node=node,
        allocated_by=allocated_by, notes=f"App Store: {name}",
    )
    if error or not allocation:
        raise EngineError(f"Не удалось выделить IP из IPAM: {error or 'нет свободных адресов'}")

    ip = allocation.ip_address
    net = db.query(IPAMNetwork).filter(IPAMNetwork.id == network_id).first()
    mask = "24"
    gateway = None
    if net:
        if net.network and "/" in net.network:
            mask = net.network.split("/")[1]
        gateway = net.gateway or None
    ip_config = f"ip={ip}/{mask},gw={gateway}" if gateway else f"ip={ip}/{mask}"
    return ip_config, ip


def install(db, user, *, app_id: str, name: str, form_answers: dict,
            server_id: int, node: Optional[str] = None, cores: int = 2,
            memory: int = 2048, disk: int = 8, storage: str = "local-lvm",
            bridge: str = "vmbr0", ostemplate: Optional[str] = None,
            ipam_network_id: Optional[int] = None,
            ipam_pool_id: Optional[int] = None) -> dict:
    """Синхронная часть: валидация + запись в БД. Пайплайн — в пуле потоков."""
    app = db.query(CatalogApp).filter(CatalogApp.app_id == app_id).first()
    if not app:
        raise EngineError("Приложение не найдено в каталоге")
    if not app.available:
        raise EngineError("Приложение помечено недоступным")
    if not app.compose_yaml:
        raise EngineError("У приложения отсутствует docker-compose.yml")
    if not _NAME_RE.match(name or ""):
        raise EngineError("Недопустимое имя приложения (a-z, 0-9, дефис, 1..63)")

    golden = ostemplate or settings.APPSTORE_GOLDEN_TEMPLATE
    if not golden:
        raise EngineError("Не настроен золотой шаблон LXC (APPSTORE_GOLDEN_TEMPLATE)")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise EngineError("Proxmox сервер не найден")

    env, secrets_shown = build_env(app, form_answers)
    vmid = get_next_vmid(db, server_id)

    # IPAM (опционально): выделяем адрес до старта пайплайна, чтобы ошибка
    # (нет свободных IP) вернулась пользователю синхронно.
    ip_config = None
    static_ip = None
    if ipam_network_id:
        ip_config, static_ip = _allocate_ipam(
            db, network_id=ipam_network_id, pool_id=ipam_pool_id, name=name,
            server_id=server_id, vmid=vmid, node=node,
            allocated_by=getattr(user, "username", None),
        )

    ia = InstalledApp(
        app_id=app_id, server_id=server_id, vmid=vmid, node=node, name=name,
        version_installed=str(app.version) if app.version is not None else None,
        tipi_version_installed=app.tipi_version,
        env_encrypted=json.dumps(env), ip=static_ip, port=app.port, status="installing",
        owner_id=user.id,
    )
    db.add(ia)
    db.commit()
    db.refresh(ia)

    op = _new_operation(db, ia.id, "install", user.id)

    _engine_executor.submit(
        _run_install, ia.id, op.id, user.id, app.compose_yaml, env, golden,
        cores, memory, disk, server_id, node, name, app.port, ia.version_installed, vmid,
        storage, bridge, ip_config, static_ip,
    )
    return {"installed_app_id": ia.id, "operation_id": op.id, "vmid": vmid, "secrets": secrets_shown}


def _new_operation(db, installed_app_id: int, op_type: str, user_id: int) -> AppOperation:
    op = AppOperation(
        installed_app_id=installed_app_id, type=op_type,
        status="running", progress=0, steps_log=[], user_id=user_id,
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return op


def _run_install(installed_app_id, operation_id, user_id, compose_yaml, env, ostemplate,
                 cores, memory, disk, server_id, node, name, port, version, vmid,
                 storage, bridge, ip_config=None, static_ip=None):
    """Тело установки в пуле потоков."""
    db = SessionLocal()
    try:
        spec = InstallSpec(
            server_id=server_id, ostemplate=ostemplate, name=name,
            compose_yaml=compose_yaml, port=port or 80, env_vars=env,
            node=node, vmid=vmid, cores=cores, memory=memory, disk=disk,
            storage=storage, bridge=bridge, ip_config=ip_config, static_ip=static_ip,
        )

        def on_step(step: str, progress: int) -> None:
            _record_step(operation_id, user_id, step, progress)

        result = poc_install(db, spec, on_step)

        ia = db.get(InstalledApp, installed_app_id)
        if ia:
            ia.vmid = result.vmid
            ia.node = result.node
            ia.ip = result.ip
            ia.port = spec.port
            ia.version_installed = version
            ia.status = "running" if result.status == "running" else "error"
            db.commit()

        if result.status == "running":
            _finish_op(operation_id, user_id, "completed")
        else:
            _finish_op(operation_id, user_id, "failed",
                       error="Health-check не прошёл (приложение не ответило по HTTP)")
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        try:
            ia = db.get(InstalledApp, installed_app_id)
            if ia:
                ia.status = "error"
                ia.vmid = vmid  # сохранить vmid для идемпотентного повтора
                db.commit()
        except Exception:
            pass
        logger.error(f"[appstore-engine] install #{installed_app_id} failed: {e}")
        _finish_op(operation_id, user_id, "failed", error=str(e))
    finally:
        db.close()


def retry_install(db, user, installed_app_id: int) -> dict:
    """Повтор установки (ТЗ 6.1): контейнер не пересоздаётся (проверка по vmid)."""
    ia = db.get(InstalledApp, installed_app_id)
    if not ia:
        raise EngineError("Установка не найдена")
    if ia.status not in ("error", "installing"):
        raise EngineError(f"Повтор недоступен из статуса '{ia.status}'")

    app = db.query(CatalogApp).filter(CatalogApp.app_id == ia.app_id).first()
    compose = app.compose_yaml if app else None
    if not compose:
        raise EngineError("compose приложения недоступен для повтора")
    golden = settings.APPSTORE_GOLDEN_TEMPLATE
    if not golden:
        raise EngineError("Не настроен золотой шаблон LXC (APPSTORE_GOLDEN_TEMPLATE)")

    env = ia.env_dict()
    ia.status = "installing"
    db.commit()

    op = _new_operation(db, ia.id, "install", user.id)
    # Контейнер уже создан (идемпотентный повтор): net0 не применяется заново,
    # поэтому ip_config не нужен. Известный статический IP передаём, чтобы не
    # ждать выдачи впустую (для DHCP он None → ожидание по-старому).
    _engine_executor.submit(
        _run_install, ia.id, op.id, user.id, compose, env, golden,
        2, 2048, 8, ia.server_id, ia.node, ia.name, ia.port, ia.version_installed, ia.vmid,
        "local-lvm", "vmbr0", None, ia.ip,
    )
    return {"installed_app_id": ia.id, "operation_id": op.id}


# ── Удаление (нужно для обработки сбоя M2; полный lifecycle — M3) ──────────────

def delete_app(db, user, installed_app_id: int) -> dict:
    ia = db.get(InstalledApp, installed_app_id)
    if not ia:
        raise EngineError("Установка не найдена")

    op = _new_operation(db, ia.id, "delete", user.id)
    ia.status = "deleting"
    db.commit()

    _engine_executor.submit(_run_delete, ia.id, op.id, user.id, ia.server_id, ia.vmid, ia.node)
    return {"operation_id": op.id}


def _run_delete(installed_app_id, operation_id, user_id, server_id, vmid, node):
    db = SessionLocal()
    try:
        def on_step(step: str, progress: int) -> None:
            _record_step(operation_id, user_id, step, progress)

        if vmid and server_id:
            try:
                poc_teardown(db, server_id, vmid, node, on_step)
            except Exception as e:
                logger.warning(f"[appstore-engine] teardown vmid={vmid}: {e}")
            # Освобождаем IP в IPAM (no-op, если приложение ставилось по DHCP).
            try:
                IPAMService(db).release_ip_by_vmid(
                    server_id, vmid, released_by="appstore",
                    reason=f"App Store: удаление приложения #{installed_app_id}")
            except Exception as e:
                logger.warning(f"[appstore-engine] IPAM release vmid={vmid}: {e}")

        # финальное событие ДО удаления записи (каскад удалит app_operations)
        _finish_op(operation_id, user_id, "completed")

        ia = db.get(InstalledApp, installed_app_id)
        if ia:
            db.delete(ia)
            db.commit()
        try:
            broadcast_task_update(user_id, "appstore_app_deleted", {"installed_app_id": installed_app_id})
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[appstore-engine] delete #{installed_app_id} failed: {e}")
        _finish_op(operation_id, user_id, "failed", error=str(e))
    finally:
        db.close()


# ── Обновление и откат (M4) ───────────────────────────────────────────────────

_SNAP_PREFIX = "preupd"


def _snap_name(version: Optional[str], ts: datetime) -> str:
    """Имя снапшота pre-update: буквы/цифры/подчёркивание, ≤ 40, начинается с буквы."""
    ver = re.sub(r"[^A-Za-z0-9]", "", str(version or "0"))[:12] or "0"
    stamp = ts.strftime("%Y%m%d%H%M%S")
    return f"{_SNAP_PREFIX}_{ver}_{stamp}"[:40]


def _prune_snapshots(client, node: str, vmid: int, keep: str) -> None:
    """Оставить только последний pre-update снапшот (ТЗ 6.3), старые удалить."""
    try:
        snaps = client.get_container_snapshots(node, vmid)
    except Exception:
        return
    for s in snaps or []:
        name = s.get("name")
        if not name or name == "current" or name == keep:
            continue
        if name.startswith(_SNAP_PREFIX + "_"):
            try:
                res = client.delete_container_snapshot(node, vmid, name)
                upid = res.get("upid") if isinstance(res, dict) else None
                if upid:
                    client.wait_for_task(node, upid, timeout=120)
            except Exception as e:
                logger.warning(f"[appstore-engine] prune snapshot {name}: {e}")


def update(db, user, installed_app_id: int, form_answers: Optional[dict] = None) -> dict:
    """Обновление приложения: снапшот → pull → up → health (ТЗ 6.3)."""
    ia = db.get(InstalledApp, installed_app_id)
    if not ia:
        raise EngineError("Установка не найдена")
    if ia.status not in ("running", "stopped", "update_failed"):
        raise EngineError(f"Обновление недоступно из статуса '{ia.status}'")
    if not ia.vmid or not ia.server_id or not ia.node:
        raise EngineError("У приложения нет привязанного контейнера")

    app = db.query(CatalogApp).filter(CatalogApp.app_id == ia.app_id).first()
    if not app or not app.compose_yaml:
        raise EngineError("Свежая версия приложения недоступна в каталоге")

    op = _new_operation(db, ia.id, "update", user.id)
    _engine_executor.submit(
        _run_update, ia.id, op.id, user.id, app.compose_yaml,
        str(app.version) if app.version is not None else None, app.tipi_version,
        form_answers or {},
    )
    return {"installed_app_id": ia.id, "operation_id": op.id}


def _run_update(installed_app_id, operation_id, user_id, compose_yaml,
                new_version, new_tipi, form_answers):
    db = SessionLocal()
    try:
        ia = db.get(InstalledApp, installed_app_id)
        if not ia:
            _finish_op(operation_id, user_id, "failed", error="Установка исчезла")
            return
        server, client = _client_for(db, ia.server_id)

        def on_step(step: str, progress: int) -> None:
            _record_step(operation_id, user_id, step, progress)

        # 1. Снапшот pre-update-<version>-<timestamp>
        on_step("Создание снапшота перед обновлением...", 15)
        snapname = _snap_name(ia.version_installed, _utcnow())
        snap = client.create_container_snapshot(
            ia.node, ia.vmid, snapname, description="pvemanager-appstore pre-update")
        if not (isinstance(snap, dict) and snap.get("success")):
            err = snap.get("error") if isinstance(snap, dict) else "snapshot failed"
            ia.status = "update_failed"
            db.commit()
            _finish_op(operation_id, user_id, "failed", error=f"Снапшот не создан: {err}")
            return

        ia.last_snapshot = snapname
        ia.snapshot_version = ia.version_installed
        ia.snapshot_tipi_version = ia.tipi_version_installed
        ia.status = "updating"
        db.commit()

        # 2. env: сохраняем прежний, доливаем новые ответы формы (ТЗ 6.3)
        env = ia.env_dict()
        for k, v in (form_answers or {}).items():
            env[k] = str(v)

        # 3-4. push нового compose → pull && up → health
        status = poc_update(server, client, ia.vmid, ia.node, compose_yaml,
                            env, ia.port or 80, ia.ip, on_step)

        if status == "running":
            ia.status = "running"
            ia.version_installed = new_version
            ia.tipi_version_installed = new_tipi
            ia.update_available = False
            ia.env_encrypted = json.dumps(env)
            db.commit()
            _prune_snapshots(client, ia.node, ia.vmid, keep=snapname)  # хранить последний 1
            _finish_op(operation_id, user_id, "completed")
        else:
            ia.status = "update_failed"
            db.commit()
            _finish_op(operation_id, user_id, "failed",
                       error="Health-check после обновления не прошёл — доступен откат")
    except Exception as e:
        try:
            db.rollback()
            ia = db.get(InstalledApp, installed_app_id)
            if ia:
                ia.status = "update_failed"
                db.commit()
        except Exception:
            pass
        logger.error(f"[appstore-engine] update #{installed_app_id} failed: {e}")
        _finish_op(operation_id, user_id, "failed", error=str(e))
    finally:
        db.close()


def rollback(db, user, installed_app_id: int) -> dict:
    """Откат обновления восстановлением снапшота (ТЗ 6.4)."""
    ia = db.get(InstalledApp, installed_app_id)
    if not ia:
        raise EngineError("Установка не найдена")
    if not ia.last_snapshot:
        raise EngineError("Нет pre-update снапшота для отката")
    if not ia.vmid or not ia.server_id or not ia.node:
        raise EngineError("У приложения нет привязанного контейнера")

    op = _new_operation(db, ia.id, "rollback", user.id)
    _engine_executor.submit(_run_rollback, ia.id, op.id, user.id)
    return {"installed_app_id": ia.id, "operation_id": op.id}


def _run_rollback(installed_app_id, operation_id, user_id):
    db = SessionLocal()
    try:
        ia = db.get(InstalledApp, installed_app_id)
        if not ia:
            _finish_op(operation_id, user_id, "failed", error="Установка исчезла")
            return
        server, client = _client_for(db, ia.server_id)
        snapname = ia.last_snapshot

        def on_step(step: str, progress: int) -> None:
            _record_step(operation_id, user_id, step, progress)

        on_step("Остановка контейнера...", 20)
        try:
            upid = client.stop_container(ia.node, ia.vmid)
            if upid:
                client.wait_for_task(ia.node, upid, timeout=60)
        except Exception:
            pass

        on_step(f"Восстановление снапшота {snapname}...", 45)
        res = client.rollback_container_snapshot(ia.node, ia.vmid, snapname, start=True)
        upid = res.get("upid") if isinstance(res, dict) else None
        if isinstance(res, dict) and not res.get("success"):
            ia.status = "update_failed"
            db.commit()
            _finish_op(operation_id, user_id, "failed",
                       error=f"Откат не удался: {res.get('error')}")
            return
        if upid:
            client.wait_for_task(ia.node, upid, timeout=300)

        on_step("Запуск контейнера...", 70)
        try:
            client.start_container(ia.node, ia.vmid)
        except Exception:
            pass

        on_step(f"Health-check http://{ia.ip}:{ia.port} ...", 88)
        from ..appstore.pipeline import _health_check
        ok = _health_check(ia.ip, ia.port or 80, 180) if ia.ip else False

        # вернуть прежнюю версию в БД (ТЗ 6.4)
        if ia.snapshot_version is not None:
            ia.version_installed = ia.snapshot_version
            ia.tipi_version_installed = ia.snapshot_tipi_version
        ia.status = "running" if ok else "stopped"
        db.commit()
        _finish_op(operation_id, user_id, "completed" if ok else "failed",
                   error=None if ok else "Контейнер восстановлен, но health-check не прошёл")
    except Exception as e:
        try:
            db.rollback()
            ia = db.get(InstalledApp, installed_app_id)
            if ia:
                ia.status = "update_failed"
                db.commit()
        except Exception:
            pass
        logger.error(f"[appstore-engine] rollback #{installed_app_id} failed: {e}")
        _finish_op(operation_id, user_id, "failed", error=str(e))
    finally:
        db.close()


# ── Управление жизненным циклом (M3): start / stop / restart / logs ───────────

def _client_for(db, server_id: int):
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise EngineError("Proxmox сервер не найден")
    return server, _get_proxmox_client(server)


def lifecycle_action(db, user, installed_app_id: int, action: str) -> dict:
    """Start / stop / restart LXC приложения (ТЗ 6.5)."""
    if action not in ("start", "stop", "restart"):
        raise EngineError(f"Неизвестное действие: {action}")
    ia = db.get(InstalledApp, installed_app_id)
    if not ia:
        raise EngineError("Установка не найдена")
    if not ia.vmid or not ia.server_id or not ia.node:
        raise EngineError("У приложения нет привязанного контейнера")

    _server, client = _client_for(db, ia.server_id)
    if action == "start":
        upid = client.start_container(ia.node, ia.vmid)
        new_status = "running"
    elif action == "stop":
        upid = client.stop_container(ia.node, ia.vmid)
        new_status = "stopped"
    else:  # restart
        upid = client.restart_container(ia.node, ia.vmid)
        new_status = "running"

    if upid:
        try:
            client.wait_for_task(ia.node, upid, timeout=60)
        except Exception:
            pass

    ia.status = new_status
    db.commit()
    db.refresh(ia)
    try:
        broadcast_task_update(user.id, "appstore_operation_update",
                              {"kind": "appstore", "installed_app_id": ia.id,
                               "type": action, "status": "completed", "progress": 100})
    except Exception:
        pass
    return ia.to_dict()


def get_logs(db, installed_app_id: int, tail: int = 200) -> str:
    """docker compose logs --tail N через pct exec (ТЗ 6.5, по запросу)."""
    ia = db.get(InstalledApp, installed_app_id)
    if not ia or not ia.vmid or not ia.server_id:
        raise EngineError("У приложения нет привязанного контейнера")
    server, client = _client_for(db, ia.server_id)
    ssh = _node_ssh(server, client)
    if not ssh.connect():
        raise EngineError("SSH к ноде не установлен")
    try:
        tail = max(1, min(int(tail or 200), 2000))
        inner = f"cd {APP_DIR} && docker compose logs --tail {tail} --no-color 2>&1"
        out, _code = ssh.execute(
            f"pct exec {ia.vmid} -- /bin/bash -lc {_shq(inner)}", return_exit_code=True)
        return out or ""
    finally:
        ssh.close()


# ── Реконсиляция состояния (ТЗ 6.6) ───────────────────────────────────────────

_RECONCILE_STATES = ("running", "stopped", "orphaned")


def reconcile(db) -> dict:
    """Сверить статус LXC в Proxmox с БД. Пропавший контейнер → 'orphaned'."""
    apps = db.query(InstalledApp).filter(InstalledApp.status.in_(_RECONCILE_STATES)).all()
    changed = 0
    for ia in apps:
        if not ia.vmid or not ia.server_id or not ia.node:
            continue
        try:
            _server, client = _client_for(db, ia.server_id)
            st = client.get_container_status(ia.node, ia.vmid)
        except Exception:
            st = None

        if not st:
            new_status = "orphaned"
        else:
            s = (st.get("status") or "").lower()
            new_status = "running" if s == "running" else "stopped" if s == "stopped" else ia.status

        if new_status != ia.status:
            ia.status = new_status
            changed += 1
    if changed:
        db.commit()
    return {"checked": len(apps), "changed": changed}


def _scheduled_reconcile() -> None:
    db = SessionLocal()
    try:
        reconcile(db)
    except Exception as e:
        logger.warning(f"[appstore-engine] scheduled reconcile failed: {e}")
    finally:
        db.close()


def start_reconcile_scheduler():
    """Периодическая реконсиляция каждые 60с (ТЗ 6.6). Из lifespan."""
    from .backup_scheduler import get_scheduler

    aps = get_scheduler()
    aps.add_job(
        _scheduled_reconcile,
        trigger=IntervalTrigger(seconds=60),
        id="appstore_reconcile",
        replace_existing=True,
        misfire_grace_time=30,
    )
    if not aps.running:
        aps.start()
    logger.info("App Store reconcile scheduler registered (every 60s)")
    return aps
