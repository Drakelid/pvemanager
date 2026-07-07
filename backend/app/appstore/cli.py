"""
Ручной раннер M0 PoC. Запускается в окружении бэкенда (с доступом к БД панели):

    # установка тестового приложения из золотого шаблона:
    python -m app.appstore.cli install \
        --server-id 1 \
        --ostemplate local:vztmpl/golden-docker_12_amd64.tar.zst \
        --name poc-uptime-kuma \
        --port 3001

    # повторяемость — снести контейнер:
    python -m app.appstore.cli teardown --server-id 1 --vmid 131

По умолчанию берётся встроенный sample uptime-kuma (samples/uptime-kuma.compose.yml).
Свой compose/env — через --compose-file / --env-file.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ..db import SessionLocal
from .pipeline import InstallSpec, PocError, poc_install, poc_teardown

_SAMPLES = Path(__file__).parent / "samples"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _parse_env(text: str) -> dict:
    env = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def cmd_install(args) -> int:
    compose_path = Path(args.compose_file) if args.compose_file else _SAMPLES / "uptime-kuma.compose.yml"
    env_path = Path(args.env_file) if args.env_file else _SAMPLES / "uptime-kuma.env"
    compose_yaml = _read(compose_path)
    env_vars = _parse_env(_read(env_path)) if env_path.exists() else {}

    spec = InstallSpec(
        server_id=args.server_id,
        ostemplate=args.ostemplate,
        name=args.name,
        compose_yaml=compose_yaml,
        port=args.port,
        env_vars=env_vars,
        node=args.node,
        cores=args.cores,
        memory=args.memory,
        disk=args.disk,
        storage=args.storage,
        bridge=args.bridge,
    )
    db = SessionLocal()
    try:
        res = poc_install(db, spec)
    finally:
        db.close()
    print("\n=== PoC install OK ===")
    print(f"vmid   : {res.vmid}")
    print(f"node   : {res.node}")
    print(f"ip     : {res.ip}")
    print(f"url    : {res.url}")
    print(f"status : {res.status}")
    return 0 if res.status == "running" else 2


def cmd_teardown(args) -> int:
    db = SessionLocal()
    try:
        poc_teardown(db, args.server_id, args.vmid, args.node)
    finally:
        db.close()
    print(f"Teardown OK: vmid={args.vmid}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="app.appstore.cli", description="App Store M0 PoC runner")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("install", help="Установить тестовое приложение (clone→push→exec→health)")
    pi.add_argument("--server-id", type=int, required=True)
    pi.add_argument("--ostemplate", required=True, help="Золотой vztmpl, напр. local:vztmpl/golden-docker_12_amd64.tar.zst")
    pi.add_argument("--name", default="poc-uptime-kuma")
    pi.add_argument("--port", type=int, default=3001)
    pi.add_argument("--node", default=None)
    pi.add_argument("--cores", type=int, default=2)
    pi.add_argument("--memory", type=int, default=2048)
    pi.add_argument("--disk", type=int, default=8)
    pi.add_argument("--storage", default="local-lvm")
    pi.add_argument("--bridge", default="vmbr0")
    pi.add_argument("--compose-file", default=None, help="Свой docker-compose.yml (по умолчанию sample uptime-kuma)")
    pi.add_argument("--env-file", default=None, help="Свой .env (по умолчанию sample)")
    pi.set_defaults(func=cmd_install)

    pt = sub.add_parser("teardown", help="Остановить и удалить контейнер PoC")
    pt.add_argument("--server-id", type=int, required=True)
    pt.add_argument("--vmid", type=int, required=True)
    pt.add_argument("--node", default=None)
    pt.set_defaults(func=cmd_teardown)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except PocError as e:
        print(f"\n[PoC FAILED] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
