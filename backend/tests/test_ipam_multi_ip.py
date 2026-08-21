"""Несколько IP-адресов на одном инстансе: сервис, API и колонка IP."""

import pytest

from app.ipam_service import IPAMService
from app.models import IPAMAllocation, IPAMNetwork, ProxmoxServer, VMInstance
from app.services import guest_ip_service, script_engine


OK_OUTPUT = "PVEMANAGER_PERSIST=ifupdown\nPVEMANAGER_OK=1\n"


@pytest.fixture
def env(db_session, seed_users):
    server = ProxmoxServer(name="Homelab: Dev", ip_address="10.10.10.2", hostname="dev",
                           api_user="root@pam", use_password=True, password="pw",
                           is_online=True)
    db_session.add(server)
    db_session.commit()

    network = IPAMNetwork(name="Home-Net", network="10.10.10.0/24", gateway="10.10.10.1",
                          is_active=True)
    db_session.add(network)
    db_session.commit()

    instance = VMInstance(server_id=server.id, vmid=109, node="dev", vm_type="lxc",
                          name="gitea", status="running")
    db_session.add(instance)
    db_session.commit()

    service = IPAMService(db_session)

    def allocate(ip, primary=False, kind="alias", interface="eth0"):
        allocation, error = service.allocate_ip(
            ip_address=ip, network_id=network.id, resource_type="lxc", resource_name="gitea",
            proxmox_server_id=server.id, proxmox_vmid=109, proxmox_node="dev",
            allocated_by="tester", is_primary=primary, assignment_kind=kind,
            target_interface=interface,
        )
        assert error is None, error
        return allocation

    return {"db": db_session, "server": server, "network": network, "instance": instance,
            "service": service, "allocate": allocate}


@pytest.fixture(autouse=True)
def no_real_guest(monkeypatch):
    """Скрипт в гостя не уезжает — транспорт проверяется отдельным тестом."""
    monkeypatch.setattr(
        guest_ip_service.script_engine, "execute",
        lambda server, **kwargs: script_engine.ExecResult(True, OK_OUTPUT, 0),
    )


# --- сервис -------------------------------------------------------------------

def test_guest_can_hold_several_addresses(env):
    env["allocate"]("10.10.10.17", primary=True, kind="primary")
    env["allocate"]("10.10.10.90")
    env["allocate"]("10.10.10.91")

    rows = env["service"].find_allocations_by_resource(env["server"].id, 109)
    assert [r.ip_address for r in rows] == ["10.10.10.17", "10.10.10.90", "10.10.10.91"]
    assert rows[0].is_primary is True


def test_primary_lookup_returns_the_flagged_address(env):
    env["allocate"]("10.10.10.90")
    primary = env["allocate"]("10.10.10.17", primary=True, kind="primary")

    found = env["service"].find_allocation_by_resource(env["server"].id, 109)
    assert found.id == primary.id


def test_lookup_falls_back_to_earliest_without_flag(env):
    """Записи старше миграции multi-IP флага не имеют — берём самую раннюю."""
    first = env["allocate"]("10.10.10.90")
    env["allocate"]("10.10.10.91")

    found = env["service"].find_allocation_by_resource(env["server"].id, 109)
    assert found.id == first.id


def test_set_primary_leaves_exactly_one_primary(env):
    old = env["allocate"]("10.10.10.17", primary=True, kind="primary")
    new = env["allocate"]("10.10.10.90")

    updated, error = env["service"].set_primary(env["server"].id, 109, new.id, changed_by="tester")

    assert error is None and updated.id == new.id
    env["db"].refresh(old)
    assert [a.is_primary for a in env["service"].find_allocations_by_resource(env["server"].id, 109)] \
        == [True, False]
    assert old.is_primary is False


def test_set_primary_rejects_foreign_allocation(env):
    other = env["service"].allocate_ip(
        ip_address="10.10.10.50", network_id=env["network"].id,
        proxmox_server_id=env["server"].id, proxmox_vmid=999, allocated_by="tester")[0]

    updated, error = env["service"].set_primary(env["server"].id, 109, other.id)
    assert updated is None and "does not belong" in error


def test_deleting_a_guest_releases_every_address(env):
    env["allocate"]("10.10.10.17", primary=True, kind="primary")
    env["allocate"]("10.10.10.90")
    env["allocate"]("10.10.10.91")

    released, ips = env["service"].release_ip_by_vmid(env["server"].id, 109, released_by="tester")

    assert released is True
    assert "10.10.10.17" in ips and "10.10.10.91" in ips
    assert env["db"].query(IPAMAllocation).count() == 0


# --- API ----------------------------------------------------------------------

def test_list_addresses_returns_primary_first(env, client, admin_headers):
    env["allocate"]("10.10.10.90")
    env["allocate"]("10.10.10.17", primary=True, kind="primary")

    response = client.get(
        f"/ipam/api/guests/{env['server'].id}/109/addresses", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["addresses"][0]["ip_address"] == "10.10.10.17"
    assert body["addresses"][0]["is_primary"] is True
    assert body["addresses"][0]["prefix"] == "24"


def test_add_address_allocates_and_applies(env, client, admin_headers):
    response = client.post(
        f"/ipam/api/guests/{env['server'].id}/109/addresses",
        headers=admin_headers,
        json={"network_id": env["network"].id, "ip_address": "10.10.10.90",
              "target_interface": "eth0"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["applied"] is True
    assert body["apply_status"] == guest_ip_service.APPLIED
    assert body["address"]["assignment_kind"] == "alias"

    stored = env["db"].query(IPAMAllocation).filter(
        IPAMAllocation.ip_address == "10.10.10.90").one()
    assert stored.proxmox_vmid == 109
    assert stored.target_interface == "eth0"


def test_add_address_picks_next_free_ip(env, client, admin_headers):
    env["allocate"]("10.10.10.2", primary=True, kind="primary")

    response = client.post(
        f"/ipam/api/guests/{env['server'].id}/109/addresses",
        headers=admin_headers,
        json={"network_id": env["network"].id, "target_interface": "eth0"},
    )

    assert response.status_code == 200, response.text
    assigned = response.json()["address"]["ip_address"]
    assert assigned.startswith("10.10.10.")
    assert assigned not in ("10.10.10.1", "10.10.10.2")  # шлюз и занятый адрес


def test_add_address_can_take_over_as_primary(env, client, admin_headers):
    old = env["allocate"]("10.10.10.17", primary=True, kind="primary")

    response = client.post(
        f"/ipam/api/guests/{env['server'].id}/109/addresses",
        headers=admin_headers,
        json={"network_id": env["network"].id, "ip_address": "10.10.10.90",
              "target_interface": "eth0", "make_primary": True},
    )

    assert response.status_code == 200, response.text
    env["db"].refresh(old)
    env["db"].refresh(env["instance"])
    assert old.is_primary is False
    # Кэш инстанса показывает новый основной адрес
    assert env["instance"].ip_address == "10.10.10.90"


def test_duplicate_address_is_rejected(env, client, admin_headers):
    env["allocate"]("10.10.10.90")

    response = client.post(
        f"/ipam/api/guests/{env['server'].id}/109/addresses",
        headers=admin_headers,
        json={"network_id": env["network"].id, "ip_address": "10.10.10.90",
              "target_interface": "eth0"},
    )
    assert response.status_code == 400
    assert "already allocated" in response.json()["detail"]


def test_release_address_frees_it(env, client, admin_headers):
    alias = env["allocate"]("10.10.10.90")

    response = client.delete(
        f"/ipam/api/guests/{env['server'].id}/109/addresses/{alias.id}", headers=admin_headers)

    assert response.status_code == 200, response.text
    assert response.json()["released"] == "10.10.10.90"
    assert env["db"].query(IPAMAllocation).filter(
        IPAMAllocation.ip_address == "10.10.10.90").first() is None


def test_primary_address_cannot_be_released_here(env, client, admin_headers):
    primary = env["allocate"]("10.10.10.17", primary=True, kind="primary")

    response = client.delete(
        f"/ipam/api/guests/{env['server'].id}/109/addresses/{primary.id}", headers=admin_headers)

    assert response.status_code == 400
    assert "NIC config" in response.json()["detail"]
    assert env["db"].query(IPAMAllocation).count() == 1


def test_address_of_another_guest_is_not_accessible(env, client, admin_headers):
    foreign = env["service"].allocate_ip(
        ip_address="10.10.10.50", network_id=env["network"].id,
        proxmox_server_id=env["server"].id, proxmox_vmid=999, allocated_by="tester")[0]

    response = client.delete(
        f"/ipam/api/guests/{env['server'].id}/109/addresses/{foreign.id}", headers=admin_headers)
    assert response.status_code == 404


def test_instance_list_exposes_all_addresses(env, client, admin_headers):
    env["allocate"]("10.10.10.17", primary=True, kind="primary")
    env["allocate"]("10.10.10.90")

    response = client.get("/proxmox/api/virtual-machines", headers=admin_headers)
    assert response.status_code == 200

    vm = next(v for v in response.json() if v["vmid"] == 109)
    assert vm["ip"] == "10.10.10.17"  # колонка IP показывает основной
    assert [a["ip"] for a in vm["ips"]] == ["10.10.10.17", "10.10.10.90"]
    assert [a["is_primary"] for a in vm["ips"]] == [True, False]


def test_network_scan_skips_node_and_cached_guest_ips(env):
    """Скан вне пула не должен предлагать адрес ноды или известного гостя."""
    # Нода Homelab: Dev живёт на 10.10.10.2, гость gitea — на 10.10.10.3
    env["instance"].ip_address = "10.10.10.3"
    env["db"].commit()

    ip = env["service"].get_next_available_ip(
        env["network"].id, None, allow_network_scan=True)

    assert ip not in ("10.10.10.1", "10.10.10.2", "10.10.10.3")
