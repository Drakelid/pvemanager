"""Дополнительные IP-адреса гостя (alias поверх основного интерфейса).

Основной адрес живёт в конфиге Proxmox (`net0` у LXC, `ipconfig0` у QEMU) и
здесь не трогается. Дополнительные навешиваются внутри гостя как alias и
учитываются в IPAM: одна аллокация — один адрес.

Транспорт не изобретаем: `services/script_engine.py` уже умеет выполнять
скрипт и в LXC (`pct exec` по SSH ноды), и в VM (QEMU guest agent).

Модуль работает синхронизацией, а не пошаговым add/remove: в гостя всегда
уезжает полный список alias-адресов интерфейса, а скрипт приводит состояние
к нему. Поэтому добавление, удаление и повторное применение — один и тот же
код, а расхождения (адрес сняли руками) чинятся сами.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from loguru import logger
from sqlalchemy.orm import Session

from ..config import utcnow
from ..models import IPAMAllocation, IPAMNetwork, ProxmoxServer, VMInstance
from . import script_engine

_SCRIPT_PATH = Path(__file__).parent / "guest_ip" / "sync_aliases.sh"
_SYNC_TIMEOUT = 60

# Значения IPAMAllocation.apply_status
APPLIED = "applied"            # поднят и закреплён в конфиге ОС
RUNTIME_ONLY = "runtime_only"  # поднят, но стек не распознан — ребут не переживёт
PENDING = "pending"            # гость недоступен, попробуем позже
FAILED = "failed"              # скрипт отработал с ошибкой

_PERSIST_RE = re.compile(r"^PVEMANAGER_PERSIST=(\w+)$", re.MULTILINE)
_OK_RE = re.compile(r"^PVEMANAGER_OK=1$", re.MULTILINE)
_IFACE_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,15}$")

DEFAULT_INTERFACE = "eth0"


@dataclass
class ApplyResult:
    success: bool
    status: str
    persist: Optional[str] = None
    error: Optional[str] = None
    output: str = ""


def _load_script() -> str:
    return _SCRIPT_PATH.read_text(encoding="utf-8")


def prefix_for(db: Session, allocation: IPAMAllocation) -> Optional[int]:
    """Длина префикса адреса — берётся из сети, которой он принадлежит."""
    network = db.query(IPAMNetwork).filter(IPAMNetwork.id == allocation.network_id).first()
    if not network or not network.network:
        return None
    try:
        return ipaddress.ip_network(network.network, strict=False).prefixlen
    except ValueError:
        return None


def alias_allocations(db: Session, server_id: int, vmid: int,
                      interface: str) -> List[IPAMAllocation]:
    """Все alias-адреса гостя на конкретном интерфейсе, по возрастанию адреса."""
    rows = db.query(IPAMAllocation).filter(
        IPAMAllocation.proxmox_server_id == server_id,
        IPAMAllocation.proxmox_vmid == vmid,
        IPAMAllocation.assignment_kind == "alias",
        IPAMAllocation.target_interface == interface,
        IPAMAllocation.status.in_(["allocated", "reserved"]),
    ).all()

    def _sort_key(row: IPAMAllocation):
        try:
            return (0, int(ipaddress.ip_address(row.ip_address)))
        except ValueError:
            return (1, 0)

    return sorted(rows, key=_sort_key)


def _guest_target(db: Session, server_id: int, vmid: int,
                  allocation: Optional[IPAMAllocation] = None
                  ) -> Tuple[Optional[ProxmoxServer], Optional[str], Optional[str]]:
    """(server, node, vm_type) для запуска скрипта; None-ы, если гость неизвестен."""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    guest = db.query(VMInstance).filter(
        VMInstance.server_id == server_id,
        VMInstance.vmid == vmid,
        VMInstance.deleted_at.is_(None),
    ).first()

    node = (guest.node if guest else None) or (allocation.proxmox_node if allocation else None)
    vm_type = guest.vm_type if guest else None
    if not vm_type and allocation and allocation.resource_type in ("qemu", "lxc"):
        vm_type = allocation.resource_type
    return server, node, vm_type


def resolve_interface(client, vm_type: str, node: str, vmid: int,
                      primary_ip: Optional[str] = None) -> str:
    """Интерфейс по умолчанию — тот, на котором висит основной адрес гостя.

    Данные берём у существующих методов клиента; если гость молчит,
    возвращаем eth0 — пользователь всё равно может выбрать интерфейс вручную.
    """
    try:
        if vm_type == "lxc":
            interfaces = client.get_container_interfaces(node, vmid)
        else:
            interfaces = client.get_vm_interfaces(node, vmid)
    except Exception as e:
        logger.debug(f"[guest-ip] не удалось получить интерфейсы {vmid}: {e}")
        return DEFAULT_INTERFACE

    fallback = None
    for iface in interfaces or []:
        name = iface.get("name") or ""
        if not name or name == "lo":
            continue
        fallback = fallback or name
        if primary_ip:
            for ip_info in iface.get("ips") or []:
                if ip_info.get("address") == primary_ip:
                    return name
    return fallback or DEFAULT_INTERFACE


def sync_interface(db: Session, server_id: int, vmid: int, interface: str,
                   allocation: Optional[IPAMAllocation] = None) -> ApplyResult:
    """Привести alias-адреса интерфейса в госте к тому, что записано в IPAM.

    Обновляет apply_status у всех alias-аллокаций этого интерфейса: они
    применяются одним вызовом, значит и исход у них общий.
    """
    if not _IFACE_RE.match(interface or ""):
        return ApplyResult(False, FAILED, error=f"Некорректное имя интерфейса: {interface}")

    server, node, vm_type = _guest_target(db, server_id, vmid, allocation)
    rows = alias_allocations(db, server_id, vmid, interface)

    if not server:
        return _finish(db, rows, ApplyResult(False, PENDING, error="Сервер Proxmox не найден"))
    if not node or not vm_type:
        return _finish(db, rows, ApplyResult(
            False, PENDING, error="Гость не найден в кэше — синхронизируйте инстансы"))

    addresses = []
    for row in rows:
        prefix = prefix_for(db, row)
        if prefix is None:
            return _finish(db, rows, ApplyResult(
                False, FAILED,
                error=f"Не удалось определить префикс сети для {row.ip_address}"))
        addresses.append(f"{row.ip_address}/{prefix}")

    script = script_engine.render_params(
        _load_script(), {"IFACE": interface, "ADDRESSES": " ".join(addresses)}
    )
    result = script_engine.execute(
        server, target_type="guest", node=node, vmid=vmid, vm_type=vm_type,
        script=script, interpreter="/bin/sh", timeout=_SYNC_TIMEOUT,
    )

    output = result.output or ""
    if not result.success or not _OK_RE.search(output):
        error = (result.error or output or "").strip()[:1000] or "Скрипт не завершился успешно"
        # exit_code == -1 — транспорт: гость выключен, нет SSH к ноде или нет
        # guest agent. Это не ошибка конфигурации, поэтому pending: адрес
        # закреплён в IPAM и применится, когда гость станет доступен.
        status = PENDING if result.exit_code == -1 else FAILED
        return _finish(db, rows, ApplyResult(False, status, error=error, output=output))

    persist_match = _PERSIST_RE.search(output)
    persist = persist_match.group(1) if persist_match else "none"
    status = RUNTIME_ONLY if persist == "none" else APPLIED
    return _finish(db, rows, ApplyResult(True, status, persist=persist, output=output))


def _finish(db: Session, rows: List[IPAMAllocation], result: ApplyResult) -> ApplyResult:
    """Записать исход применения во все затронутые аллокации."""
    for row in rows:
        row.apply_status = result.status
        row.apply_error = result.error
        if result.success:
            row.applied_at = utcnow()
    db.commit()
    return result


def apply_address(db: Session, allocation: IPAMAllocation) -> ApplyResult:
    """Применить (или переприменить) alias-адрес к гостю."""
    if allocation.assignment_kind != "alias":
        return ApplyResult(True, APPLIED, persist="primary",
                           output="Основной адрес задаётся конфигом Proxmox")
    return sync_interface(
        db, allocation.proxmox_server_id, allocation.proxmox_vmid,
        allocation.target_interface or DEFAULT_INTERFACE, allocation,
    )


def remove_address(db: Session, allocation: IPAMAllocation) -> ApplyResult:
    """Снять alias-адрес с гостя.

    К моменту вызова аллокация должна быть уже освобождена или удалена —
    скрипт снимает всё, чего нет в переданном ему списке.
    """
    if allocation.assignment_kind != "alias":
        return ApplyResult(True, APPLIED, persist="primary")
    return sync_interface(
        db, allocation.proxmox_server_id, allocation.proxmox_vmid,
        allocation.target_interface or DEFAULT_INTERFACE, allocation,
    )
