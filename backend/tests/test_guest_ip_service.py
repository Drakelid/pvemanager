"""Дополнительные адреса гостя: что уезжает в гостя и как трактуется ответ."""

import pytest

from app.ipam_service import IPAMService
from app.models import IPAMAllocation, IPAMNetwork, ProxmoxServer, VMInstance
from app.services import guest_ip_service, script_engine


OK_IFUPDOWN = "PVEMANAGER_PERSIST=ifupdown\nPVEMANAGER_OK=1\n"
OK_NO_PERSIST = "PVEMANAGER_PERSIST=none\nPVEMANAGER_OK=1\n"


class _Recorder:
    """Подменяет script_engine.execute и запоминает, что ушло в гостя."""

    def __init__(self, result):
        self.result = result
        self.calls = []

    def __call__(self, server, **kwargs):
        self.calls.append(kwargs)
        return self.result

    @property
    def last_script(self) -> str:
        return self.calls[-1]["script"]

    def exported(self, name: str) -> str:
        """Значение переменной из блока export, который добавляет render_params."""
        for line in self.last_script.splitlines():
            if line.startswith(f"export {name}="):
                return line.split("=", 1)[1].strip().strip("'")
        raise AssertionError(f"{name} not exported: {self.last_script[:200]}")


@pytest.fixture
def guest(db_session):
    server = ProxmoxServer(name="Devserver", ip_address="192.168.43.254", hostname="dev",
                           api_user="root@pam", use_password=True, password="pw")
    db_session.add(server)
    db_session.commit()

    network = IPAMNetwork(name="Home-Net", network="10.10.10.0/24", gateway="10.10.10.1",
                          is_active=True)
    db_session.add(network)
    db_session.commit()

    instance = VMInstance(server_id=server.id, vmid=120, node="dev", vm_type="lxc",
                          name="act-runner", status="running")
    db_session.add(instance)
    db_session.commit()

    service = IPAMService(db_session)

    def add_alias(ip, interface="eth0"):
        allocation, error = service.allocate_ip(
            ip_address=ip, network_id=network.id, resource_type="lxc",
            resource_name="act-runner", proxmox_server_id=server.id, proxmox_vmid=120,
            proxmox_node="dev", allocated_by="tester", assignment_kind="alias",
            target_interface=interface, apply_status=guest_ip_service.PENDING,
        )
        assert error is None
        return allocation

    return {"db": db_session, "server": server, "network": network, "instance": instance,
            "service": service, "add_alias": add_alias}


def _patch(monkeypatch, result):
    recorder = _Recorder(result)
    monkeypatch.setattr(guest_ip_service.script_engine, "execute", recorder)
    return recorder


def test_apply_sends_every_alias_of_the_interface(guest, monkeypatch):
    """В гостя уезжает полный список адресов, а не только новый."""
    guest["add_alias"]("10.10.10.90")
    second = guest["add_alias"]("10.10.10.91")
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    result = guest_ip_service.apply_address(guest["db"], second)

    assert result.success and result.status == guest_ip_service.APPLIED
    assert recorder.exported("IFACE") == "eth0"
    assert recorder.exported("ADDRESSES") == "10.10.10.90/24 10.10.10.91/24"
    assert recorder.calls[-1]["vm_type"] == "lxc"
    assert recorder.calls[-1]["vmid"] == 120


def test_prefix_comes_from_the_ipam_network(guest, monkeypatch):
    guest["network"].network = "10.10.0.0/16"
    guest["db"].commit()
    allocation = guest["add_alias"]("10.10.10.90")
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    guest_ip_service.apply_address(guest["db"], allocation)
    assert recorder.exported("ADDRESSES") == "10.10.10.90/16"


def test_unrecognised_stack_is_runtime_only(guest, monkeypatch):
    allocation = guest["add_alias"]("10.10.10.90")
    _patch(monkeypatch, script_engine.ExecResult(True, OK_NO_PERSIST, 0))

    result = guest_ip_service.apply_address(guest["db"], allocation)

    assert result.success
    assert result.status == guest_ip_service.RUNTIME_ONLY
    assert allocation.apply_status == guest_ip_service.RUNTIME_ONLY
    assert allocation.applied_at is not None


def test_unreachable_guest_keeps_allocation_pending(guest, monkeypatch):
    """Гость выключен или нет SSH — адрес остаётся за ним, статус pending."""
    allocation = guest["add_alias"]("10.10.10.90")
    _patch(monkeypatch, script_engine.ExecResult(
        False, "", -1, error="Не удалось подключиться по SSH к Devserver"))

    result = guest_ip_service.apply_address(guest["db"], allocation)

    assert not result.success
    assert result.status == guest_ip_service.PENDING
    assert allocation.apply_status == guest_ip_service.PENDING
    assert "SSH" in allocation.apply_error
    assert allocation.applied_at is None
    # Аллокация никуда не делась — адрес зарезервирован
    assert guest["db"].query(IPAMAllocation).count() == 1


def test_script_error_marks_allocation_failed(guest, monkeypatch):
    allocation = guest["add_alias"]("10.10.10.90")
    _patch(monkeypatch, script_engine.ExecResult(
        False, "failed to add 10.10.10.90/24 on eth0", 1))

    result = guest_ip_service.apply_address(guest["db"], allocation)

    assert result.status == guest_ip_service.FAILED
    assert allocation.apply_status == guest_ip_service.FAILED


def test_missing_ok_marker_is_not_treated_as_success(guest, monkeypatch):
    """exit=0 без маркера — скрипт не доработал; успехом это не считаем."""
    allocation = guest["add_alias"]("10.10.10.90")
    _patch(monkeypatch, script_engine.ExecResult(True, "some noise", 0))

    result = guest_ip_service.apply_address(guest["db"], allocation)
    assert not result.success and result.status == guest_ip_service.FAILED


def test_released_address_disappears_from_the_synced_list(guest, monkeypatch):
    """Снятие адреса = синхронизация без него: скрипт сам сделает ip addr del."""
    keep = guest["add_alias"]("10.10.10.90")
    drop = guest["add_alias"]("10.10.10.91")
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    guest["service"].release_ip(drop.ip_address, released_by="tester")
    guest_ip_service.sync_interface(guest["db"], guest["server"].id, 120, "eth0")

    assert recorder.exported("ADDRESSES") == "10.10.10.90/24"
    assert keep.apply_status == guest_ip_service.APPLIED


def test_last_address_removal_sends_empty_list(guest, monkeypatch):
    only = guest["add_alias"]("10.10.10.90")
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    guest["service"].release_ip(only.ip_address, released_by="tester")
    guest_ip_service.sync_interface(guest["db"], guest["server"].id, 120, "eth0")

    assert recorder.exported("ADDRESSES") == ""


def test_addresses_of_other_interfaces_are_not_touched(guest, monkeypatch):
    guest["add_alias"]("10.10.10.90", interface="eth0")
    guest["add_alias"]("10.10.10.91", interface="eth1")
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    guest_ip_service.sync_interface(guest["db"], guest["server"].id, 120, "eth1")

    assert recorder.exported("IFACE") == "eth1"
    assert recorder.exported("ADDRESSES") == "10.10.10.91/24"


def test_bogus_interface_name_never_reaches_the_guest(guest, monkeypatch):
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    result = guest_ip_service.sync_interface(
        guest["db"], guest["server"].id, 120, "eth0; rm -rf /")

    assert not result.success and result.status == guest_ip_service.FAILED
    assert recorder.calls == []


def test_primary_address_is_not_pushed_into_the_guest(guest, monkeypatch):
    """Основной адрес задаётся конфигом Proxmox — скрипт для него не нужен."""
    allocation, _ = guest["service"].allocate_ip(
        ip_address="10.10.10.5", network_id=guest["network"].id,
        proxmox_server_id=guest["server"].id, proxmox_vmid=120,
        allocated_by="tester", is_primary=True, assignment_kind="primary",
    )
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    result = guest_ip_service.apply_address(guest["db"], allocation)

    assert result.success
    assert recorder.calls == []


def test_unknown_guest_is_pending_not_crash(guest, monkeypatch):
    allocation = guest["add_alias"]("10.10.10.90")
    guest["instance"].deleted_at = __import__("app.config", fromlist=["utcnow"]).utcnow()
    guest["db"].commit()
    recorder = _patch(monkeypatch, script_engine.ExecResult(True, OK_IFUPDOWN, 0))

    result = guest_ip_service.sync_interface(guest["db"], guest["server"].id, 120, "eth0")

    assert result.status == guest_ip_service.PENDING
    assert recorder.calls == []
