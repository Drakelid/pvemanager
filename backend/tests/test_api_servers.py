import pytest
from app.models import ProxmoxServer, Workspace, WorkspaceServer, WorkspaceUser

@pytest.mark.integration
class TestAPIServers:
    def test_list_servers_admin_sees_all(self, client, admin_headers, db_session):
        # Create a test server
        server = ProxmoxServer(
            name="pve-admin-test",
            hostname="pve1.example.com",
            ip_address="192.168.1.50",
            port=8006,
            api_user="root@pam",
            use_password=True,
            password="securepassword",
            verify_ssl=False
        )
        db_session.add(server)
        db_session.commit()

        # Admin lists servers
        response = client.get("/proxmox/api/servers", headers=admin_headers)
        assert response.status_code == 200
        servers = response.json()
        assert len(servers) >= 1
        assert any(s["name"] == "pve-admin-test" for s in servers)

    def test_list_servers_user_isolation(self, client, user_headers, seed_users, db_session):
        # Create two test servers
        server_assigned = ProxmoxServer(
            name="pve-assigned",
            hostname="pve2.example.com",
            ip_address="192.168.1.51",
            port=8006,
            api_user="root@pam",
            use_password=True,
            password="securepassword",
            verify_ssl=False
        )
        server_unassigned = ProxmoxServer(
            name="pve-unassigned",
            hostname="pve3.example.com",
            ip_address="192.168.1.52",
            port=8006,
            api_user="root@pam",
            use_password=True,
            password="securepassword",
            verify_ssl=False
        )
        db_session.add_all([server_assigned, server_unassigned])
        db_session.commit()

        # Non-assigned check: standard user lists servers, gets empty list
        response = client.get("/proxmox/api/servers", headers=user_headers)
        assert response.status_code == 200
        assert len(response.json()) == 0

        # Set up a shared Workspace
        workspace = Workspace(name="Test Workspace", is_default=True)
        db_session.add(workspace)
        db_session.commit()

        # Link the assigned server and the standard user to the workspace
        ws_server = WorkspaceServer(workspace_id=workspace.id, server_id=server_assigned.id)
        ws_user = WorkspaceUser(workspace_id=workspace.id, user_id=seed_users["user"].id)
        db_session.add_all([ws_server, ws_user])

        # Directly assign the server to the user as well
        seed_users["user"].assigned_servers.append(server_assigned)
        db_session.commit()

        # Now standard user should see only the assigned server in their workspace
        response2 = client.get("/proxmox/api/servers", headers=user_headers)
        assert response2.status_code == 200
        servers = response2.json()
        assert len(servers) == 1
        assert servers[0]["name"] == "pve-assigned"

    def test_create_server_success(self, client, admin_headers, db_session, mock_proxmox):
        response = client.post(
            "/proxmox/api/servers",
            headers=admin_headers,
            json={
                "name": "new-pve-server",
                "hostname": "pve-new.example.com",
                "ip_address": "192.168.1.53",
                "port": 8006,
                "api_user": "root@pam",
                "use_password": True,
                "password": "securepassword",
                "verify_ssl": False,
                "description": "Newly created test server"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "new-pve-server"
        assert data["is_online"] is True  # Set true because mock_proxmox connects successfully

        # Verify added to database
        server = db_session.query(ProxmoxServer).filter(ProxmoxServer.name == "new-pve-server").first()
        assert server is not None

    def test_create_server_duplicate_name(self, client, admin_headers, db_session, mock_proxmox):
        # Create first server
        server = ProxmoxServer(
            name="duplicate-pve",
            hostname="pve-dup1.example.com",
            ip_address="192.168.1.54",
            port=8006,
            api_user="root@pam",
            use_password=True,
            password="securepassword",
            verify_ssl=False
        )
        db_session.add(server)
        db_session.commit()

        # Try creating another server with the same name
        response = client.post(
            "/proxmox/api/servers",
            headers=admin_headers,
            json={
                "name": "duplicate-pve",
                "hostname": "pve-dup2.example.com",
                "ip_address": "192.168.1.55",
                "port": 8006,
                "api_user": "root@pam",
                "use_password": True,
                "password": "securepassword",
                "verify_ssl": False
            }
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_server_permission_denied(self, client, user_headers):
        response = client.post(
            "/proxmox/api/servers",
            headers=user_headers,
            json={
                "name": "unauthorized-pve",
                "hostname": "pve-unauth.example.com",
                "ip_address": "192.168.1.56",
                "port": 8006,
                "api_user": "root@pam",
                "use_password": True,
                "password": "securepassword",
                "verify_ssl": False
            }
        )
        assert response.status_code == 403

    def test_get_server_detail(self, client, admin_headers, db_session):
        server = ProxmoxServer(
            name="pve-detail-test",
            hostname="pve-detail.example.com",
            ip_address="192.168.1.57",
            port=8006,
            api_user="root@pam",
            use_password=True,
            password="securepassword",
            verify_ssl=False
        )
        db_session.add(server)
        db_session.commit()

        response = client.get(f"/proxmox/api/servers/{server.id}", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "pve-detail-test"
        assert "password" not in data  # Sensitive fields must be excluded
