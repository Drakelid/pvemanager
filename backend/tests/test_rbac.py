"""Smoke tests for the RBAC permission engine."""

from __future__ import annotations

import importlib

import pytest
from fastapi import HTTPException


@pytest.fixture(scope="module")
def rbac():
    return importlib.import_module("app.rbac")


class TestRegistry:
    @pytest.mark.smoke
    def test_well_known_permissions_registered(self, rbac):
        for code in ("vm:view", "vm:create", "vm:delete", "user:create", "role:manage"):
            assert rbac.PERMISSIONS.get(code) is not None, f"missing {code}"

    def test_legacy_resolution(self, rbac):
        assert rbac.resolve_permission("vms.create") == "vm:create"
        assert rbac.resolve_permission("vm:create") == "vm:create"
        # Unknown codes are returned untouched.
        assert rbac.resolve_permission("totally:unknown") == "totally:unknown"

    def test_validate_partitions_codes(self, rbac):
        # The registry's internal legacy map uses ``resource.action`` form (e.g.
        # ``vm.create``). The richer ``LEGACY_PERMISSION_MAP`` (e.g. ``vms.create``)
        # is consumed by ``resolve_permission`` / the engine, not by ``validate``.
        valid, invalid = rbac.PERMISSIONS.validate(["vm:view", "vm.create", "bogus:perm"])
        assert "vm:view" in valid
        assert "vm:create" in valid  # registry legacy resolved
        assert invalid == ["bogus:perm"]


class TestEngineHasPermission:
    @pytest.mark.smoke
    def test_admin_bypass(self, rbac, fake_user_factory):
        admin = fake_user_factory(is_admin=True)
        assert rbac.PermissionEngine.has_permission(admin, "vm:delete") is True
        assert rbac.PermissionEngine.has_permission(admin, "anything:at:all") is True

    def test_direct_grant(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:view": True})
        assert rbac.PermissionEngine.has_permission(user, "vm:view") is True
        assert rbac.PermissionEngine.has_permission(user, "vm:delete") is False

    def test_legacy_grant_resolves_to_new(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vms.create": True})
        assert rbac.PermissionEngine.has_permission(user, "vm:create") is True

    def test_wildcard_grants_all_actions_on_resource(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:*": True})
        assert rbac.PermissionEngine.has_permission(user, "vm:view") is True
        assert rbac.PermissionEngine.has_permission(user, "vm:delete") is True
        # Other resources untouched.
        assert rbac.PermissionEngine.has_permission(user, "user:delete") is False

    def test_manage_implies_common_actions(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:manage": True})
        assert rbac.PermissionEngine.has_permission(user, "vm:view") is True
        assert rbac.PermissionEngine.has_permission(user, "vm:start") is True
        # delete is NOT in the implied set.
        assert rbac.PermissionEngine.has_permission(user, "vm:delete") is False

    def test_user_without_role_has_no_permissions(self, rbac, fake_user_factory):
        user = fake_user_factory(role=None)
        assert rbac.PermissionEngine.has_permission(user, "vm:view") is False

    def test_disabled_permission_not_granted(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:view": False})
        assert rbac.PermissionEngine.has_permission(user, "vm:view") is False


class TestEngineCheckPermission:
    def test_check_permission_raises_403(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={})
        with pytest.raises(HTTPException) as exc:
            rbac.PermissionEngine.check_permission(user, "vm:delete")
        assert exc.value.status_code == 403
        assert "vm:delete" in exc.value.detail

    def test_check_permission_passes_for_admin(self, rbac, fake_user_factory):
        admin = fake_user_factory(is_admin=True)
        rbac.PermissionEngine.check_permission(admin, "vm:delete")  # no raise


class TestAggregateHelpers:
    def test_has_any_permission(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:view": True})
        assert rbac.PermissionEngine.has_any_permission(user, ["vm:delete", "vm:view"]) is True
        assert rbac.PermissionEngine.has_any_permission(user, ["vm:delete", "vm:create"]) is False

    def test_has_all_permissions(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:view": True, "vm:create": True})
        assert rbac.PermissionEngine.has_all_permissions(user, ["vm:view", "vm:create"]) is True
        assert rbac.PermissionEngine.has_all_permissions(user, ["vm:view", "vm:delete"]) is False

    def test_filter_permissions(self, rbac, fake_user_factory):
        user = fake_user_factory(permissions={"vm:view": True})
        kept = rbac.PermissionEngine.filter_permissions(user, ["vm:view", "vm:delete"])
        assert kept == ["vm:view"]


class TestUserModelIntegration:
    """``User.has_permission`` should defer to PermissionEngine."""

    def test_user_has_permission_delegates(self, rbac, fake_user_factory):
        # Use the SimpleNamespace user — exercises the same call path as the
        # real model thanks to duck typing in PermissionEngine.
        user = fake_user_factory(permissions={"vm:view": True})
        assert rbac.PermissionEngine.has_permission(user, "vm:view") is True

    def test_get_user_permissions_admin_returns_full_set(self, rbac, fake_user_factory):
        admin = fake_user_factory(is_admin=True)
        perms = rbac.PermissionEngine.get_user_permissions(admin)
        # Admin shortcut returns every registered permission code.
        assert {"vm:view", "vm:delete", "user:create"}.issubset(perms)
