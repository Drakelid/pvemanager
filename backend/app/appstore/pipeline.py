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

import yaml
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
    # IPAM: статическая конфигурация сети. Если ip_config задан — используется
    # вместо ip=dhcp при создании net0; static_ip — заранее известный адрес
    # (тогда не ждём выдачи по DHCP).
    ip_config: Optional[str] = None       # напр. "ip=10.0.0.5/24,gw=10.0.0.1"
    static_ip: Optional[str] = None       # напр. "10.0.0.5"
    source: str = "runtipi"               # источник каталога: runtipi | umbrel


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
        timeout=30,  # запас на подключение; per-command таймаут задаётся в _run
    )


# Таймаут по умолчанию для быстрых команд на ноде (pct exec/push, mkdir и т.п.).
# Долгие шаги (docker compose pull/up) передают увеличенный таймаут явно.
_CMD_TIMEOUT = 60
_DOCKER_TIMEOUT = 600


def _run(ssh: SSHClient, cmd: str, *, what: str, timeout: int = _CMD_TIMEOUT) -> str:
    """Выполнить команду на ноде, вернуть stdout. Бросить PocError при exit!=0.

    При таймауте execute() вернёт exit_code=-1 → бросаем PocError (установка
    завершается с ошибкой, а не зависает бесконечно).
    """
    output, exit_code = ssh.execute(cmd, return_exit_code=True, timeout=timeout)
    if exit_code == -1:
        raise PocError(f"{what}: таймаут (>{timeout}с) или обрыв SSH")
    if exit_code != 0:
        raise PocError(f"{what}: exit={exit_code}: {(output or '').strip()[:2000]}")
    return output or ""


def _pct(vmid: int, inner: str) -> str:
    """pct exec в контейнере через bash -lc (inner фиксированный, без польз. ввода)."""
    return f"pct exec {vmid} -- /bin/bash -lc {_shq(inner)}"


def _shq(s: str) -> str:
    """Одинарные кавычки для shell (безопасно для фиксированных строк)."""
    return "'" + s.replace("'", "'\"'\"'") + "'"


def _to_int(v) -> Optional[int]:
    """Аккуратно привести значение к int (int или строка-число), иначе None."""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.strip().isdigit():
        return int(v.strip())
    return None


def _find_main_service(services: Dict) -> Optional[str]:
    """Определить главный сервис Runtipi-compose.

    Приоритет: сервис с `x-runtipi.is_main: true`. Если такого нет, но сервис
    единственный — берём его. Иначе None (не можем однозначно определить).
    """
    for name, svc in services.items():
        if isinstance(svc, dict):
            rt = svc.get("x-runtipi")
            if isinstance(rt, dict) and rt.get("is_main"):
                return name
    if len(services) == 1:
        return next(iter(services))
    return None


def _compose_env_get(env, key: str) -> Optional[str]:
    """Достать значение переменной из секции environment (dict или list-формат)."""
    if isinstance(env, dict):
        v = env.get(key)
        return str(v) if v is not None else None
    if isinstance(env, list):
        pref = key + "="
        for item in env:
            s = str(item)
            if s.startswith(pref):
                return s[len(pref):]
    return None


# Сервисы рантайма Umbrel, которые не запустятся вне Umbrel и должны быть
# вырезаны из compose перед standalone-запуском в LXC.
def _is_umbrel_infra_service(name: str) -> bool:
    low = name.lower()
    return low == "app_proxy" or low == "tor" or low.endswith("_tor") or low.endswith("-tor")


def _strip_dangling_depends(services: Dict, removed: set) -> None:
    """Убрать depends_on-ссылки на удалённые сервисы (иначе compose up падает)."""
    for svc in services.values():
        if not isinstance(svc, dict):
            continue
        dep = svc.get("depends_on")
        if isinstance(dep, list):
            new = [d for d in dep if d not in removed]
            if new:
                svc["depends_on"] = new
            else:
                svc.pop("depends_on", None)
        elif isinstance(dep, dict):
            for r in removed:
                dep.pop(r, None)
            if not dep:
                svc.pop("depends_on", None)


def _umbrel_main_service(services: Dict, app_host: Optional[str]) -> Optional[str]:
    """Определить главный сервис Umbrel-compose.

    Приоритет — сервис, на который указывает app_proxy (APP_HOST). Затем —
    единственный сервис, затем первый с образом.
    """
    if not services:
        return None
    if app_host:
        for name in services:
            if name == app_host or name in app_host.split("_") or name in app_host:
                return name
    if len(services) == 1:
        return next(iter(services))
    for name, svc in services.items():
        if isinstance(svc, dict) and svc.get("image"):
            return name
    return next(iter(services))


def _prepare_umbrel(doc: dict) -> tuple[Optional[str], Optional[int], bool]:
    """Адаптировать Umbrel-compose: снять порт из app_proxy, вырезать рантайм
    Umbrel, определить главный сервис.

    Возвращает (main_service, internal_port, changed).
    """
    services = doc.get("services")
    if not isinstance(services, dict):
        return None, None, False

    # Порт контейнера и целевой сервис задаёт app_proxy Umbrel.
    ap = services.get("app_proxy")
    internal: Optional[int] = None
    app_host: Optional[str] = None
    if isinstance(ap, dict):
        env = ap.get("environment")
        internal = _to_int(_compose_env_get(env, "APP_PORT"))
        app_host = _compose_env_get(env, "APP_HOST")

    # Вырезать app_proxy/tor — их образов у нас нет, они завесят/уронят up.
    removed = {n for n in list(services.keys()) if _is_umbrel_infra_service(n)}
    for n in removed:
        services.pop(n, None)
    if removed:
        _strip_dangling_depends(services, removed)

    main = _umbrel_main_service(services, app_host)
    return main, internal, bool(removed)


def _resolve_main_and_port(doc: dict, services: Dict, source: str
                           ) -> tuple[Optional[str], Optional[int], bool]:
    """Определить (главный_сервис, внутренний_порт, changed) по источнику."""
    if source == "umbrel":
        return _prepare_umbrel(doc)
    # runtipi: главный сервис и порт объявлены через x-runtipi.
    main = _find_main_service(services)
    internal = None
    if main is not None:
        svc = services.get(main)
        rt = svc.get("x-runtipi") if isinstance(svc, dict) else None
        internal = _to_int(rt.get("internal_port")) if isinstance(rt, dict) else None
    return main, internal, False


def _normalize_compose(compose_yaml: str, host_port: Optional[int] = None,
                       *, source: str = "runtipi") -> tuple[str, Optional[int]]:
    """Привести compose к самодостаточному виду для standalone-запуска в LXC.

    Делает то, что в родном рантайме (Runtipi/Umbrel) выполняет их оркестратор:

    1. Объявляет упомянутые, но необъявленные сети (напр. `tipi_main_network`)
       как external — иначе `docker compose up` падает с «refers to undefined
       network …». Сеть создаётся заранее на ноде (`docker network create`).

    2. Для Umbrel: вырезает сервисы рантайма (app_proxy, tor) — их образов у нас
       нет, а порт контейнера берётся из `app_proxy.environment.APP_PORT`.

    3. Публикует порт главного сервиса на хост LXC. И Runtipi (порт в
       `x-runtipi.internal_port`), и Umbrel (порт в app_proxy) обычно НЕ имеют
       секции `ports:` — наружу его пробрасывал бы их прокси, которого у нас нет.
       Без публикации приложение недоступно по IP контейнера (health-check не
       проходит). Поэтому главному сервису добавляем `ports: ["<host>:<internal>"]`.

    Возвращает `(normalized_yaml, published_port)`. При любой ошибке разбора —
    `(compose_yaml, None)` (используем исходный compose как есть).
    """
    try:
        doc = yaml.safe_load(compose_yaml)
        if not isinstance(doc, dict):
            return compose_yaml, None

        services = doc.get("services")
        if not isinstance(services, dict):
            return compose_yaml, None

        # Источнико-специфичная подготовка (для Umbrel мутирует services).
        main, internal, changed = _resolve_main_and_port(doc, services, source)
        services = doc.get("services")
        if not isinstance(services, dict):
            return compose_yaml, None

        # (1) Необъявленные сети → external.
        referenced: set[str] = set()
        for svc in services.values():
            if not isinstance(svc, dict):
                continue
            nets = svc.get("networks")
            if isinstance(nets, list):
                referenced.update(str(n) for n in nets)
            elif isinstance(nets, dict):
                referenced.update(str(n) for n in nets.keys())

        if referenced:
            top = doc.get("networks")
            if not isinstance(top, dict):
                top = {}
            for net in referenced:
                if net not in top:
                    top[net] = {"external": True}
                    changed = True
            if changed:
                doc["networks"] = top

        # Для Umbrel, если порт контейнера не удалось снять из app_proxy, но
        # известен порт из каталога — используем его как внутренний.
        if source == "umbrel" and internal is None and host_port:
            internal = host_port

        # (2) Публикация порта главного сервиса на хост LXC.
        published_port: Optional[int] = None
        svc = services.get(main) if main is not None else None
        if isinstance(svc, dict):
            if internal:
                # Уважаем уже объявленную публикацию (не переопределяем).
                if not svc.get("ports"):
                    # host_port из каталога, если задан и не дефолтные 80/0; иначе
                    # публикуем на том же номере, что слушает контейнер.
                    pub = host_port if (host_port and host_port not in (0, 80)) else internal
                    svc["ports"] = [f"{pub}:{internal}"]
                    published_port = pub
                    changed = True
                else:
                    ports = svc.get("ports")
                    if isinstance(ports, list) and ports:
                        first = str(ports[0])
                        published_port = _to_int(first.split(":")[0]) or internal
            elif svc.get("ports"):
                # Внутренний порт неизвестен, но публикация уже есть в compose.
                ports = svc.get("ports")
                if isinstance(ports, list) and ports:
                    published_port = _to_int(str(ports[0]).split(":")[0])

        if not changed:
            return compose_yaml, published_port

        return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True), published_port
    except Exception as e:
        logger.warning(f"[appstore-poc] normalize compose failed, using raw: {e}")
        return compose_yaml, None


def _platform_env(env: Dict[str, str], ip: str, source: str) -> Dict[str, str]:
    """Заполнить IP-зависимые платформенные переменные окружения (ТЗ 5.3).

    Общие: APP_DOMAIN/APP_HOST/APP_IP. runtipi → LOCAL_DOMAIN. umbrel →
    DEVICE_DOMAIN_NAME/DEVICE_HOSTNAME/APP_SEED (частые ссылки в их compose).
    """
    env.setdefault("APP_DOMAIN", ip)
    env.setdefault("APP_HOST", ip)
    env["APP_IP"] = ip
    if source == "umbrel":
        env.setdefault("DEVICE_DOMAIN_NAME", f"{ip}.local")
        env.setdefault("DEVICE_HOSTNAME", "umbrel")
        env.setdefault("APP_SEED", "pvemanager")
    else:
        env.setdefault("LOCAL_DOMAIN", "tipi.local")  # стандартная переменная Runtipi
    return env


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
        ip_cfg = spec.ip_config or "ip=dhcp"
        net0 = f"name=eth0,bridge={spec.bridge},{ip_cfg},firewall=1"
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
        # Статический IP из IPAM известен заранее — подтверждаем через контейнер,
        # но при таймауте всё равно используем выделенный адрес.
        ip = _wait_ip(ssh, vmid, spec.ip_timeout) or spec.static_ip
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
        normalized, pub_port = _normalize_compose(spec.compose_yaml, spec.port,
                                                  source=spec.source)
        if pub_port:
            # Порт, реально опубликованный на хосте LXC → на нём и проверяем/URL.
            spec.port = pub_port
        _push_file(ssh, vmid, normalized, f"{APP_DIR}/docker-compose.yml")
        # IP-зависимые платформенные переменные (ТЗ 5.3) заполняем здесь — IP уже известен.
        env = _platform_env(dict(spec.env_vars), ip, spec.source)
        # значения .env: убираем переводы строк (одна строка на переменную)
        env_content = "".join(f"{k}={str(v).replace(chr(10), ' ').replace(chr(13), ' ')}\n"
                              for k, v in env.items())
        _push_file(ssh, vmid, env_content, f"{APP_DIR}/.env")

        on_step("Запуск docker compose up -d...", 85)
        _run(
            ssh,
            _pct(vmid, f"cd {APP_DIR} && docker compose --env-file .env up -d 2>&1"),
            what="docker compose up",
            timeout=_DOCKER_TIMEOUT,  # тянет образы — может идти минуты
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
               on_step: StepCb = _noop, health_timeout: int = 300,
               source: str = "runtipi") -> str:
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
        normalized, pub_port = _normalize_compose(compose_yaml, port, source=source)
        if pub_port:
            port = pub_port
        _push_file(ssh, vmid, normalized, f"{APP_DIR}/docker-compose.yml")
        env = _platform_env(dict(env_vars), ip, source)
        env_content = "".join(f"{k}={str(v).replace(chr(10), ' ').replace(chr(13), ' ')}\n"
                              for k, v in env.items())
        _push_file(ssh, vmid, env_content, f"{APP_DIR}/.env")

        on_step("docker compose pull && up -d...", 65)
        _run(
            ssh,
            _pct(vmid, f"cd {APP_DIR} && docker compose --env-file .env pull 2>&1 && "
                       f"docker compose --env-file .env up -d 2>&1"),
            what="docker compose pull/up",
            timeout=_DOCKER_TIMEOUT,  # pull больших образов — может идти минуты
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
