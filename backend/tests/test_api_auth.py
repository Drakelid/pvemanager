import pytest
from app.models import User, ActiveSession
from app.auth import verify_password

@pytest.mark.integration
class TestAPIAuthentication:
    def test_login_success(self, client, seed_users):
        response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "UserPass123!"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, seed_users):
        response = client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "Incorrect username or password" in response.json()["detail"]

    def test_login_user_not_found(self, client, seed_users):
        response = client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "somepassword"}
        )
        assert response.status_code == 401

    def test_get_me(self, client, user_headers):
        response = client.get("/api/auth/me", headers=user_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "testuser@example.com"
        assert data["is_admin"] is False
        assert "permissions" in data

    def test_logout(self, client, user_headers, db_session):
        # Verify authenticated endpoint works before logout
        me_resp = client.get("/api/auth/me", headers=user_headers)
        assert me_resp.status_code == 200
        
        # Logout
        logout_resp = client.post("/api/auth/logout", headers=user_headers)
        assert logout_resp.status_code == 200
        assert logout_resp.json()["message"] == "Successfully logged out"
        
        # Verify request is rejected after logout because session is terminated
        me_resp2 = client.get("/api/auth/me", headers=user_headers)
        assert me_resp2.status_code == 401

    def test_change_password(self, client, user_headers, db_session, seed_users):
        response = client.post(
            "/api/auth/change-password",
            headers=user_headers,
            data={"old_password": "UserPass123!", "new_password": "NewSecurePass123!"}
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Password changed successfully"
        
        db_session.refresh(seed_users["user"])
        assert verify_password("NewSecurePass123!", seed_users["user"].hashed_password)

    def test_register_user_by_admin(self, client, admin_headers, db_session):
        response = client.post(
            "/api/auth/register",
            headers=admin_headers,
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "full_name": "New User",
                "password": "NewUserPassword123!"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["email"] == "newuser@example.com"
        
        user = db_session.query(User).filter(User.username == "newuser").first()
        assert user is not None

    def test_register_user_denied_for_standard_user(self, client, user_headers):
        response = client.post(
            "/api/auth/register",
            headers=user_headers,
            json={
                "username": "anotheruser",
                "email": "another@example.com",
                "full_name": "Another User",
                "password": "AnotherPassword123!"
            }
        )
        assert response.status_code == 403

    def test_list_users_by_admin(self, client, admin_headers):
        response = client.get("/api/users", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2

    def test_delete_user_by_admin(self, client, admin_headers, db_session, seed_users):
        target_user = seed_users["user"]
        response = client.delete(f"/api/users/{target_user.id}", headers=admin_headers)
        assert response.status_code == 204
        
        deleted_user = db_session.query(User).filter(User.id == target_user.id).first()
        assert deleted_user is None
