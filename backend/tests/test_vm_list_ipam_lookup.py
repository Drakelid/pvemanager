"""IP shown for a guest must come from its own IPAM allocation, never from a
same-named guest on another server."""

import pytest

from app.models import IPAMAllocation, IPAMNetwork, ProxmoxServer, VMInstance


@pytest.mark.integration
class TestVMListIPAMLookup:
    @pytest.fixture(autouse=True)
    def setup(self, db_session, seed_users):
        def _server(name, ip):
            server = ProxmoxServer(name=name, hostname=name, ip_address=ip, port=8006,
                                   api_user="root@pam", use_password=True, password="pw",
                                   verify_ssl=False, is_online=False)
            db_session.add(server)
            db_session.commit()
            db_session.refresh(server)
            return server

        # Two distinct servers, each with its own node that happens to share a name.
        self.server_a = _server("homelab-dev", "10.10.10.2")
        self.server_b = _server("devserver", "192.168.43.254")

        network = IPAMNetwork(name="Home-Net", network="10.10.10.0/24",
                              gateway="10.10.10.1", is_active=True)
        db_session.add(network)
        db_session.commit()

        # Same guest name on both servers — the real-world "wireguard" case.
        self.linked = VMInstance(server_id=self.server_a.id, vmid=107, node="dev",
                                 vm_type="lxc", name="wireguard", status="running")
        self.other = VMInstance(server_id=self.server_b.id, vmid=102, node="dev",
                                vm_type="lxc", name="wireguard", status="running")
        db_session.add_all([self.linked, self.other])
        db_session.commit()

        db_session.add(IPAMAllocation(
            ip_address="10.10.10.35", network_id=network.id, status="allocated",
            resource_type="lxc", resource_name="wireguard",
            proxmox_server_id=self.server_a.id, proxmox_vmid=107, proxmox_node="dev",
        ))
        db_session.commit()
        self.db = db_session

    def _instances(self, client, headers):
        response = client.get("/proxmox/api/virtual-machines", headers=headers)
        assert response.status_code == 200
        return {(vm["server_id"], vm["vmid"]): vm for vm in response.json()}

    def test_allocation_is_not_shared_with_a_same_named_guest(self, client, admin_headers):
        vms = self._instances(client, admin_headers)

        assert vms[(self.server_a.id, 107)]["ip"] == "10.10.10.35"
        # The namesake on the other server owns no allocation and has no cached IP.
        assert vms[(self.server_b.id, 102)]["ip"] == ""

    def test_cached_ip_still_wins_when_no_allocation_exists(self, client, admin_headers):
        self.other.ip_address = "192.168.43.246"
        self.db.commit()

        vms = self._instances(client, admin_headers)
        assert vms[(self.server_b.id, 102)]["ip"] == "192.168.43.246"
        assert vms[(self.server_a.id, 107)]["ip"] == "10.10.10.35"

    def test_allocation_hostname_does_not_leak_either(self, client, admin_headers):
        """A hostname on the allocation used to match guests by name as well."""
        alloc = self.db.query(IPAMAllocation).one()
        alloc.hostname = "wireguard"
        self.db.commit()

        vms = self._instances(client, admin_headers)
        assert vms[(self.server_b.id, 102)]["ip"] == ""
