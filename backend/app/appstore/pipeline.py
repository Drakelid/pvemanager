"""
M0 PoC install-пайплайн: clone (create from golden vztmpl) → push → exec → health-check.

Ядро переиспользует существующую инфраструктуру панели:
- `_get_proxmox_client()` / `create_lxc_container()` / `wait_for_task()` /
  `start_container()` / `stop_container()` / `delete_container()` — Proxmox API;
- `SSHClient` (root@node, тот же паттерн, что в proxmox/mixins/cluster.py) — для
  `pct exec` / `pct push` с полным выводом (нужно для логов и наблюдаемости шагов).

Это seed будущего services/appstore_engine.py. Прогресс отдаётся через callback
`on_step(step, progress)` — в реальном движке он станет WS-broadcast'ом.

Безопасность (S-4): содержимое docker-compose.yml и .env НЕ конкатенируется в
shell-строку. Файлы доставляются на ноду через base64→файл→`pct push`, поэтому
произвольный ввод не может вырваться в шелл. Имя приложения валидируется regex.
"""

from __future__ import annotations

import base64
import re
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, Optional

from loguru import logger
from sqlalchemy.orm import Session

from ..api.proxmox._helpers import _get_proxmox_client, get_next_vmid
from ..models import ProxmoxServer
from ..ssh_client import SSHClient

# Docker-сеть, на которую ссылаются compose-файлы Runtipi как external.
TIPI_NETWORK = "tipi_main_network"
APP_DIR = "/opt/app"           # сюда кладём docker-compose.yml + .env
APP_DATA_DIR = "/opt/app-data"  # значение APP_DATA_DIR для приложений

# Имя = hostname LXC: буквы/цифры/дефис, 1..63.
_NAME_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$")

StepCb = Callable[[str, int], None]


class PocError(RuntimeError):
    """Ошибка пайплайна с человекочитаемым шагом, на котором упали."""


@dataclass
class InstallSpec:
    server_id: int
    ostemplate: str                       # golden vztmpl, напр. local:vztmpl/golden-docker_12_amd64.tar.zst
    name: str                             # hostname / имя приложения
    compose_yaml: str                     # содержимое docker-compose.yml
    port: int = 3001                      # порт для health-check
    env_vars: Dict[str, str] = field(default_factory=dict)
    node: Optional[str] = None            # если None — выбирается автоматически
    vmid: Optional[int] = None            # если задан — использовать его (идемпотентный повтор)
    cores: int = 2
    memory: int = 2048                    # МБ
    swap: int = 512                       # МБ
    disk: int = 8                         # ГБ
    storage: str = "local-lvm"
    bridge: str = "vmbr0"
    features: str = "nesting=1,keyctl=1"  # обязательно для Docker в unprivileged LXC
    health_timeout: int = 300             # сек
    ip_timeout: int = 60                  # сек ожидания IP после старта


@dataclass
class InstallResult:
    vmid: int
    node: str
    ip: Optional[str]
    url: Optional[str]
    status: str


def _noop(step: str, progress: int) -> None:
    logger.info(f"[appstore-poc] {progress:3d}% {step}")


# ── SSH-хелперы (root@node), идентичный паттерн cluster.py ────────────────────

def _node_ssh(server: ProxmoxServer, client) -> SSHClient:
    ssh_host = (server.ip_address or server.hostname or "").split(":")[0]
    return SSHClient(
        hostname=ssh_host,
        username="root",
        password=getattr(client, "_password", None),
    )


def _run(ssh: SSHClient, cmd: str, *, what: str) -> str:
    """Выполнить команду на ноде, вернуть stdout. Бросить PocError при exit!=0."""
    output, exit_code = ssh.execute(cmd, return_exit_code=True)
    if exit_code != 0:
        raise PocError(f"{what}: exit={exit_code}: {(output or '').strip()[:400]}")
    return output or ""


def _pct(vmid: int, inner: str) -> str:
    """pct exec в контейнере через bash -lc (inner фиксированный, без польз. ввода)."""
    return f"pct exec {vmid} -- /bin/bash -lc {_shq(inner)}"


def _shq(s: str) -> str:
    """Одинарные кавычки для shell (безопасно для фиксированных строк)."""
    return "'" + s.replace("'", "'\"'\"'") + "'"


def _push_file(ssh: SSHClient, vmid: int, content: str, dest: str) -> None:
    """Доставить файл в контейнер без shell-инъекций: base64 → файл на ноде → pct push."""
    b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
    tmp = f"/tmp/appstore_{vmid}_{abs(hash(dest)) % 100000}"
    # b64 состоит из [A-Za-z0-9+/=], безопасно внутри одинарных кавычек.
    _run(ssh, f"printf '%s' '{b64}' | base64 -d > {tmp}", what=f"write {dest} on node")
    _run(ssh, f"pct push {vmid} {tmp} {dest}", what=f"pct push {dest}")
    _run(ssh, f"rm -f {tmp}", what="cleanup temp")


def _wait_ip(ssh: SSHClient, vmid: int, timeout: int) -> Optional[str]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        out, code = ssh.execute(f"pct exec {vmid} -- hostname -I", return_exit_code=True)
        if code == 0 and out and out.strip():
            ip = out.strip().split()[0]
            if ip and not ip.startswith("127."):
                return ip
        time.sleep(3)
    return None


# ── Выбор ноды (как в _do_lxc_deploy) ─────────────────────────────────────────

def _resolve_node(client, requested: Optional[str]) -> str:
    if requested:
        return requested
    nodes = client.get_nodes()
    if not nodes:
        raise PocError("Не найдено нод Proxmox")
    for n in nodes:
        try:
            for s in client.proxmox.nodes(n["node"]).storage.get():
                if "vztmpl" in s.get("content", ""):
                    return n["node"]
        except Exception:
            pass
    return nodes[0]["node"]


# ── Основной пайплайн ─────────────────────────────────────────────────────────

def poc_install(db: Session, spec: InstallSpec, on_step: StepCb = _noop) -> InstallResult:
    if not _NAME_RE.match(spec.name):
        raise PocError(f"Недопустимое имя приложения: {spec.name!r} (a-z, 0-9, дефис)")

    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == spec.server_id).first()
    if not server:
        raise PocError(f"Proxmox сервер id={spec.server_id} не найден")

    on_step("Подключение к Proxmox...", 5)
    client = _get_proxmox_client(server)
    if not client.is_connected():
        raise PocError("Не удалось подключиться к Proxmox")

    node = _resolve_node(client, spec.node)
    vmid = spec.vmid or get_next_vmid(db, server.id)

    # Идемпотентность повтора (ТЗ 6.1): если контейнер с этим vmid уже создан —
    # не пересоздаём, продолжаем с доставки/запуска compose.
    already_exists = False
    if spec.vmid:
        try:
            already_exists = bool(client.get_container_status(node, vmid))
        except Exception:
            already_exists = False

    if already_exists:
        on_step(f"Контейнер VMID {vmid} уже существует — повтор без пересоздания", 40)
    else:
        on_step(f"Создание LXC VMID {vmid} на ноде {node}...", 20)
        net0 = f"name=eth0,bridge={spec.bridge},ip=dhcp,firewall=1"
        upid = client.create_lxc_container(
            node=node,
            vmid=vmid,
            ostemplate=spec.ostemplate,
            hostname=spec.name,
            cores=spec.cores,
            memory=spec.memory,
            swap=spec.swap,
            storage=spec.storage,
            rootfs_size=spec.disk,
            net0=net0,
            features=spec.features,       # nesting=1,keyctl=1 — критично для Docker
            unprivileged=True,
            start_after_create=False,
            description=f"pvemanager-appstore: {spec.name}",
        )
        if not upid:
            raise PocError("Proxmox не вернул UPID создания контейнера")

        on_step("Ожидание завершения создания...", 35)
        if not client.wait_for_task(node, upid, timeout=300):
            raise PocError("Таймаут создания контейнера (>5 мин)")

    on_step("Запуск контейнера...", 45)
    client.start_container(node, vmid)

    ssh = _node_ssh(server, client)
    if not ssh.connect():
        raise PocError("SSH к ноде не установлен (нужен root-доступ к ноде для pct exec/push)")
    try:
        on_step("Ожидание IP-адреса...", 55)
        ip = _wait_ip(ssh, vmid, spec.ip_timeout)
        if not ip:
            raise PocError(f"Контейнер не получил IP за {spec.ip_timeout}с")

        on_step("Подготовка каталогов и Docker-сети...", 65)
        _run(ssh, _pct(vmid, f"mkdir -p {APP_DIR} {APP_DATA_DIR}"), what="mkdir app dirs")
        _run(
            ssh,
            _pct(vmid, f"docker network inspect {TIPI_NETWORK} >/dev/null 2>&1 || "
                       f"docker network create {TIPI_NETWORK}"),
            what="ensure docker network",
        )

        on_step("Доставка docker-compose.yml и .env (pct push)...", 75)
        _push_file(ssh, vmid, spec.compose_yaml, f"{APP_DIR}/docker-compose.yml")
        # IP-зависимые платформенные переменные (ТЗ 5.3) заполняем здесь — IP уже известен.
        env = dict(spec.env_vars)
        env.setdefault("APP_DOMAIN", ip)
        env.setdefault("APP_HOST", ip)
        env["APP_IP"] = ip
        # значения .env: убираем переводы строк (одна строка на переменную)
        env_content = "".join(f"{k}={str(v).replace(chr(10), ' ').replace(chr(13), ' ')}\n"
                              for k, v in env.items())
        _push_file(ssh, vmid, env_content, f"{APP_DIR}/.env")

        on_step("Запуск docker compose up -d...", 85)
        _run(
            ssh,
            _pct(vmid, f"cd {APP_DIR} && docker compose --env-file .env up -d"),
            what="docker compose up",
        )

        on_step(f"Health-check http://{ip}:{spec.port} ...", 92)
        ok = _health_check(ip, spec.port, spec.health_timeout)
        status = "running" if ok else "unhealthy"
        url = f"http://{ip}:{spec.port}"
        on_step(f"Готово ({status}): {url}", 100)
        return InstallResult(vmid=vmid, node=node, ip=ip, url=url, status=status)
    finally:
        ssh.close()


def _health_check(ip: str, port: int, timeout: int) -> bool:
    """Успех = любой HTTP-ответ (включая 3xx/401). Ретраи каждые 5с до timeout."""
    import httpx

    deadline = time.time() + timeout
    url = f"http://{ip}:{port}"
    while time.time() < deadline:
        try:
            r = httpx.get(url, timeout=5, follow_redirects=False)
            logger.info(f"[appstore-poc] health {url} -> HTTP {r.status_code}")
            return True
        except Exception:
            time.sleep(5)
    return False


def poc_update(server, client, vmid: int, node: str, compose_yaml: str,
               env_vars: Dict[str, str], port: int, ip: str,
               on_step: StepCb = _noop, health_timeout: int = 300) -> str:
    """Обновление приложения в существующем контейнере (M4): доставка нового
    docker-compose.yml → docker compose pull && up -d → health-check.

    Возвращает 'running' (health OK) или 'unhealthy'.
    """
    ssh = _node_ssh(server, client)
    if not ssh.connect():
        raise PocError("SSH к ноде не установлен (нужен root-доступ для pct exec/push)")
    try:
        on_step("Доставка нового docker-compose.yml...", 45)
        _run(ssh, _pct(vmid, f"mkdir -p {APP_DIR} {APP_DATA_DIR}"), what="mkdir app dirs")
        _run(
            ssh,
            _pct(vmid, f"docker network inspect {TIPI_NETWORK} >/dev/null 2>&1 || "
                       f"docker network create {TIPI_NETWORK}"),
            what="ensure docker network",
        )
        _push_file(ssh, vmid, compose_yaml, f"{APP_DIR}/docker-compose.yml")
        env = dict(env_vars)
        env.setdefault("APP_DOMAIN", ip)
        env.setdefault("APP_HOST", ip)
        env["APP_IP"] = ip
        env_content = "".join(f"{k}={str(v).replace(chr(10), ' ').replace(chr(13), ' ')}\n"
                              for k, v in env.items())
        _push_file(ssh, vmid, env_content, f"{APP_DIR}/.env")

        on_step("docker compose pull && up -d...", 65)
        _run(
            ssh,
            _pct(vmid, f"cd {APP_DIR} && docker compose --env-file .env pull && "
                       f"docker compose --env-file .env up -d"),
            what="docker compose pull/up",
        )

        on_step(f"Health-check http://{ip}:{port} ...", 88)
        return "running" if _health_check(ip, port, health_timeout) else "unhealthy"
    finally:
        ssh.close()


def poc_teardown(db: Session, server_id: int, vmid: int, node: Optional[str] = None,
                 on_step: StepCb = _noop) -> None:
    """Остановить и удалить контейнер PoC (для повторяемого прогона)."""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise PocError(f"Proxmox сервер id={server_id} не найден")
    client = _get_proxmox_client(server)
    node = node or _resolve_node(client, None)

    on_step(f"Остановка LXC {vmid}...", 30)
    try:
        upid = client.stop_container(node, vmid, force=True)
        if upid:
            client.wait_for_task(node, upid, timeout=120)
    except Exception as e:
        logger.warning(f"stop_container: {e}")

    on_step(f"Удаление LXC {vmid}...", 70)
    upid = client.delete_container(node, vmid, force=True)
    if upid:
        client.wait_for_task(node, upid, timeout=180)
    on_step("Удалено", 100)
