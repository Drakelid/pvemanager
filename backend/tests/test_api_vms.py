import pytest
from app.models import ProxmoxServer, VMInstance

@pytest.mark.integration
class TestAPIVirtualMachines:
    @pytest.fixture(autouse=True)
    def setup_servers_and_vms(self, db_session, seed_users):
        """Seed a Proxmox server and some VMInstances for testing."""
        # Create server
        self.server = ProxmoxServer(
            name="pve-vm-test",
            hostname="pve-vm.example.com",
            ip_address="192.168.1.60",
            port=8006,
            api_user="root@pam",
            use_password=True,
            password="securepassword",
            verify_ssl=False,
            is_online=True
        )
        db_session.add(self.server)
        db_session.commit()
        db_session.refresh(self.server)

        # Create user VM
        self.user_vm = VMInstance(
            server_id=self.server.id,
            vmid=100,
            node="pve1",
            vm_type="qemu",
            name="test-user-vm",
            owner_id=seed_users["user"].id,
            status="running"
        )
        
        # Create admin VM
        self.admin_vm = VMInstance(
            server_id=self.server.id,
            vmid=101,
            node="pve1",
            vm_type="qemu",
            name="test-admin-vm",
            owner_id=seed_users["admin"].id,
            status="running"
        )

        db_session.add_all([self.user_vm, self.admin_vm])
        db_session.commit()

    def test_get_vm_status_success(self, client, user_headers, mock_proxmox):
        response = client.get(
            f"/proxmox/api/{self.server.id}/vm/100/status?node=pve1",
            headers=user_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        mock_proxmox["client"].get_vm_status.assert_called_once_with("pve1", 100)

    def test_get_vm_status_access_denied(self, client, user_headers, mock_proxmox, db_session, seed_users):
        # Limited user tries to access admin's VM
        # First restrict user's permissions to 'vms.view.own'
        user_role = seed_users["user"].role
        old_perms = dict(user_role.permissions)
        # We need both 'vms.view' (to pass the endpoint route dependency) 
        # and 'vms.view.own' (to fail the `require_vm_access` owner check).
        user_role.permissions = {"proxmox.view": True, "vms.view": True, "vms.view.own": True}
        db_session.commit()
        
        response = client.get(
            f"/proxmox/api/{self.server.id}/vm/101/status?node=pve1",
            headers=user_headers
        )
        
        # Restore permissions
        user_role.permissions = old_perms
        db_session.commit()
        
        assert response.status_code == 403
        assert "access to this virtual machine" in response.json()["detail"]

    def test_get_vm_status_admin_bypass(self, client, admin_headers, mock_proxmox):
        # Admin can access standard user's VM
        response = client.get(
            f"/proxmox/api/{self.server.id}/vm/100/status?node=pve1",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"

    def test_get_vm_config_success(self, client, user_headers, mock_proxmox):
        response = client.get(
            f"/proxmox/api/{self.server.id}/vm/100/config?node=pve1",
            headers=user_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["cores"] == 2
        assert data["memory"] == 2048
        mock_proxmox["client"].get_vm_config.assert_called_once_with("pve1", 100)

    def test_get_vm_interfaces(self, client, user_headers, mock_proxmox):
        response = client.get(
            f"/proxmox/api/{self.server.id}/vm/100/interfaces?node=pve1",
            headers=user_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["interfaces"]) == 1
        assert data["interfaces"][0]["ip"] == "192.168.1.100"

    def test_delete_vm_success(self, client, admin_headers, mock_proxmox):
        # Mock status check to indicate VM is stopped, otherwise it will try to stop it
        mock_proxmox["client"].get_vm_status.return_value = {"status": "stopped"}
        
        response = client.delete(
            f"/proxmox/api/{self.server.id}/vm/100?node=pve1&force=true",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        
        # Verify ProxmoxClient delete method called
        mock_proxmox["client"].delete_vm.assert_called_once_with("pve1", 100)
