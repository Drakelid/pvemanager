"""Tests for IPAM link-allocations: MAC propagation and duplicate-IP handling."""

import ipaddress

import pytest

from app.api.ipam import _extract_ipv4s
from app.ipam_service import IPAMService
from app.models import IPAMAllocation, IPAMNetwork, ProxmoxServer, VMInstance


# --- _extract_ipv4s -----------------------------------------------------------

HOME_NET = ipaddress.ip_network("10.10.10.0/24")


class _Net:
    """Stand-in for an IPAMNetwork row (only .id is read by the caller)."""

    def __init__(self, id_=1):
        self.id = id_


def test_extract_returns_mac_and_interface_of_matching_nic():
    interfaces = [
        {"name": "eth0", "hardware_address": "bc:24:11:aa:bb:cc",
         "ips": [{"address": "10.10.10.9", "type": "ipv4", "prefix": 24}]},
    ]
    found = _extract_ipv4s(interfaces, [(_Net(), HOME_NET)])
    assert len(found) == 1
    assert (found[0].ip, found[0].mac, found[0].interface) == (
        "10.10.10.9", "BC:24:11:AA:BB:CC", "eth0")


def test_extract_returns_every_address_in_ipam_networks():
    """Гость с несколькими адресами отдаёт их все, а не только первый."""
    interfaces = [
        {"name": "eth0", "hardware_address": "AA:AA:AA:AA:AA:AA",
         "ips": [{"address": "192.168.99.5", "type": "ipv4", "prefix": 24},
                 {"address": "10.10.10.9", "type": "ipv4", "prefix": 24},
                 {"address": "10.10.10.90", "type": "ipv4", "prefix": 24}]},
        {"name": "eth1", "hardware_address": "BB:BB:BB:BB:BB:BB",
         "ips": [{"address": "10.10.10.44", "type": "ipv4", "prefix": 24}]},
    ]
    found = _extract_ipv4s(interfaces, [(_Net(), HOME_NET)])

    assert [f.ip for f in found] == ["10.10.10.9", "10.10.10.90", "10.10.10.44"]
    assert [f.interface for f in found] == ["eth0", "eth0", "eth1"]
    assert found[-1].mac == "BB:BB:BB:BB:BB:BB"


def test_extract_skips_loopback_and_link_local():
    interfaces = [{"name": "eth0", "ips": [
        {"address": "127.0.0.1", "type": "ipv4", "prefix": 8},
        {"address": "169.254.1.5", "type": "ipv4", "prefix": 16},
        {"address": "10.10.10.9", "type": "ipv4", "prefix": 24},
    ]}]
    assert [f.ip for f in _extract_ipv4s(interfaces, [(_Net(), HOME_NET)])] == ["10.10.10.9"]


def test_extract_without_mac_returns_none():
    interfaces = [{"name": "eth0", "ips": [{"address": "10.10.10.9", "type": "ipv4", "prefix": 24}]}]
    assert _extract_ipv4s(interfaces, [(_Net(), HOME_NET)])[0].mac is None


def test_extract_no_match_returns_empty_list():
    interfaces = [{"name": "eth0", "hardware_address": "AA:BB:CC:DD:EE:FF",
                   "ips": [{"address": "192.168.43.222", "type": "ipv4", "prefix": 24}]}]
    assert _extract_ipv4s(interfaces, [(_Net(), HOME_NET)]) == []


# --- sync_from_proxmox_vm -----------------------------------------------------

@pytest.fixture
def ipam_env(db_session):
    """A server, a network and a helper to add guests."""
    server = ProxmoxServer(name="Homelab: Dev", ip_address="10.10.10.2", hostname="pve1",
                           api_user="root@pam", use_password=True, password="x")
    db_session.add(server)
    db_session.commit()

    network = IPAMNetwork(name="Home-Net", network="10.10.10.0/24", gateway="10.10.10.1",
                          is_active=True)
    db_session.add(network)
    db_session.commit()

    def add_guest(vmid, name, vm_type="lxc", deleted_at=None):
        guest = VMInstance(server_id=server.id, vmid=vmid, node="pve1", vm_type=vm_type,
                           name=name, status="running", deleted_at=deleted_at)
        db_session.add(guest)
        db_session.commit()
        return guest

    return {"db": db_session, "server": server, "network": network, "add_guest": add_guest,
            "service": IPAMService(db_session)}


def _sync(env, vmid, name, ip, mac=None):
    return env["service"].sync_from_proxmox_vm(
        network_id=env["network"].id,
        proxmox_server_id=env["server"].id,
        vmid=vmid,
        vm_name=name,
        vm_type="lxc",
        ip_address=ip,
        node="pve1",
        mac_address=mac,
        synced_by="tester",
    )


def test_sync_stores_mac_on_new_allocation(ipam_env):
    ipam_env["add_guest"](109, "gitea")
    alloc, error = _sync(ipam_env, 109, "gitea", "10.10.10.17", "BC:24:11:AA:BB:CC")

    assert error is None
    assert alloc.mac_address == "BC:24:11:AA:BB:CC"
    assert alloc.proxmox_vmid == 109


def test_duplicate_ip_does_not_steal_allocation_from_a_live_guest(ipam_env):
    """The 10.10.10.101 case: two live guests advertising the same address."""
    ipam_env["add_guest"](101, "proxmox-center")
    ipam_env["add_guest"](104, "powerdns-admin")

    first, error = _sync(ipam_env, 101, "proxmox-center", "10.10.10.101")
    assert error is None and first is not None

    second, error = _sync(ipam_env, 104, "powerdns-admin", "10.10.10.101")
    assert second is None
    assert "already linked to proxmox-center" in error
    assert "VMID 101" in error

    # Owner untouched.
    alloc = ipam_env["db"].query(IPAMAllocation).filter(
        IPAMAllocation.ip_address == "10.10.10.101").one()
    assert (alloc.proxmox_vmid, alloc.resource_name) == (101, "proxmox-center")


def test_allocation_of_a_vanished_guest_is_reclaimed(ipam_env):
    """A guest that no longer exists must not hold the address hostage."""
    ipam_env["add_guest"](101, "old-guest", deleted_at=None)
    _sync(ipam_env, 101, "old-guest", "10.10.10.101")

    # Guest disappears from Proxmox (soft-deleted by the sync worker).
    guest = ipam_env["db"].query(VMInstance).filter(VMInstance.vmid == 101).one()
    from app.config import utcnow
    guest.deleted_at = utcnow()
    ipam_env["db"].commit()

    ipam_env["add_guest"](104, "powerdns-admin")
    alloc, error = _sync(ipam_env, 104, "powerdns-admin", "10.10.10.101")

    assert error is None
    assert (alloc.proxmox_vmid, alloc.resource_name) == (104, "powerdns-admin")


def test_manual_allocation_without_vmid_is_adopted(ipam_env):
    """A hand-made record with no Proxmox link is still linkable."""
    ipam_env["add_guest"](110, "postgresql")
    manual, error = ipam_env["service"].allocate_ip(
        ip_address="10.10.10.19", network_id=ipam_env["network"].id,
        resource_name="reserved by hand", allocated_by="admin")
    assert error is None and manual.proxmox_vmid is None

    alloc, error = _sync(ipam_env, 110, "postgresql", "10.10.10.19", "AA:BB:CC:DD:EE:FF")
    assert error is None
    assert alloc.proxmox_vmid == 110


def test_resync_of_the_same_guest_is_idempotent(ipam_env):
    ipam_env["add_guest"](115, "termix")
    first, _ = _sync(ipam_env, 115, "termix", "10.10.10.36", "AA:11:22:33:44:55")
    again, error = _sync(ipam_env, 115, "termix", "10.10.10.36", "AA:11:22:33:44:55")

    assert error is None
    assert again.id == first.id
    assert ipam_env["db"].query(IPAMAllocation).count() == 1
