"""Tests for the ownerless-instance backfill (migration 41).

``table_exists`` / ``column_exists`` query ``information_schema`` and are
therefore PostgreSQL-only; they are stubbed so the migration itself — whose
statements are portable — can run against the SQLite test database.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from migrations import migrations as mig
from migrations.migrations import migrate_backfill_instance_owner, pick_backfill_owner
from app.models import AuditLog, DeployTask, ProxmoxServer, VMInstance


@pytest.fixture(autouse=True)
def postgres_only_checks(monkeypatch):
    monkeypatch.setattr(mig, "table_exists", lambda conn, table: True)
    monkeypatch.setattr(mig, "column_exists", lambda conn, table, column: True)


def _run(db_session):
    """Run the migration on a connection sharing the session's transaction.

    The connection is fetched here rather than in a fixture because committing
    seed data returns the previous one to the pool and closes it.
    """
    migrate_backfill_instance_owner(db_session.connection())


def _server(db_session, name="pve-1"):
    srv = ProxmoxServer(
        name=name, hostname=f"{name}.local", ip_address="10.0.0.1", port=8006,
        api_user="root@pam", password="secret", use_password=True, verify_ssl=False,
    )
    db_session.add(srv)
    db_session.commit()
    return srv


def _instance(db_session, server_id, vmid, owner_id=None, deleted_at=None):
    row = VMInstance(
        server_id=server_id, vmid=vmid, node="pve1", vm_type="qemu",
        name=f"vm-{vmid}", status="running", owner_id=owner_id, deleted_at=deleted_at,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _deploy_task(db_session, user_id, vmid, server_id):
    db_session.add(DeployTask(
        status="completed", step="done", progress=100, name=f"vm-{vmid}",
        user_id=user_id, vmid=vmid, server_id=server_id,
    ))
    db_session.commit()


def _create_log(db_session, username, vmid, server_id, action="vm_create", success=True):
    db_session.add(AuditLog(
        level="info", category="proxmox", action=action,
        message=f"VM {vmid} created by {username}",
        username=username, resource_type="vm", resource_id=str(vmid),
        server_id=server_id, success=success,
    ))
    db_session.commit()


def _owner_of(db_session, instance_id):
    db_session.expire_all()
    return db_session.query(VMInstance).get(instance_id).owner_id


# ── pick_backfill_owner ─────────────────────────────────────────────────────

def test_pick_returns_the_single_named_user():
    assert pick_backfill_owner([(1, 7), (1, 7), (None, 7)]) == 7


def test_pick_refuses_to_guess_between_users():
    assert pick_backfill_owner([(1, 7), (1, 9)]) is None


def test_pick_handles_no_candidates():
    assert pick_backfill_owner([]) is None


# ── Backfill from deploy_tasks ──────────────────────────────────────────────

def test_owner_recovered_from_deploy_task(db_session, seed_users):
    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 100)
    _deploy_task(db_session, user.id, vmid=100, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_deploy_task_without_server_id_still_matches(db_session, seed_users):
    """LXC deploys queue a task without server_id — it must not be discarded."""
    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 101)
    _deploy_task(db_session, user.id, vmid=101, server_id=None)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_deploy_task_for_a_different_server_is_ignored(db_session, seed_users):
    srv_a = _server(db_session, "pve-a")
    srv_b = _server(db_session, "pve-b")
    inst = _instance(db_session, srv_a.id, 102)
    _deploy_task(db_session, seed_users["user"].id, vmid=102, server_id=srv_b.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) is None


# ── Backfill from audit_logs ────────────────────────────────────────────────

def test_owner_recovered_from_audit_log(db_session, seed_users):
    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 110)
    _create_log(db_session, user.username, vmid=110, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


@pytest.mark.parametrize("action", ["ct_create", "lxc_create", "container_create"])
def test_container_create_actions_are_recognised(db_session, seed_users, action):
    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 111)
    _create_log(db_session, user.username, vmid=111, server_id=srv.id, action=action)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_failed_create_is_not_evidence(db_session, seed_users):
    srv = _server(db_session)
    inst = _instance(db_session, srv.id, 112)
    _create_log(db_session, seed_users["user"].username, vmid=112,
                server_id=srv.id, success=False)

    _run(db_session)

    assert _owner_of(db_session, inst.id) is None


def test_log_from_a_deleted_user_is_ignored(db_session, seed_users):
    srv = _server(db_session)
    inst = _instance(db_session, srv.id, 113)
    _create_log(db_session, "ghost", vmid=113, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) is None


def test_non_numeric_resource_id_does_not_break_the_run(db_session, seed_users):
    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 114)
    db_session.add(AuditLog(
        level="info", category="proxmox", action="vm_create", message="junk",
        username=user.username, resource_type="vm", resource_id="not-a-vmid",
        server_id=srv.id, success=True,
    ))
    db_session.commit()
    _create_log(db_session, user.username, vmid=114, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_deploy_task_wins_over_audit_log(db_session, seed_users):
    srv = _server(db_session)
    admin, user = seed_users["admin"], seed_users["user"]
    inst = _instance(db_session, srv.id, 115)
    _deploy_task(db_session, user.id, vmid=115, server_id=srv.id)
    _create_log(db_session, admin.username, vmid=115, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_falls_back_to_logs_when_deploy_tasks_are_ambiguous(db_session, seed_users):
    srv = _server(db_session)
    admin, user = seed_users["admin"], seed_users["user"]
    inst = _instance(db_session, srv.id, 116)
    _deploy_task(db_session, user.id, vmid=116, server_id=srv.id)
    _deploy_task(db_session, admin.id, vmid=116, server_id=srv.id)
    _create_log(db_session, user.username, vmid=116, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


# ── Safety ──────────────────────────────────────────────────────────────────

def test_ambiguous_evidence_leaves_the_instance_ownerless(db_session, seed_users):
    """A reused VMID must not hand someone else's VM to the wrong user."""
    srv = _server(db_session)
    admin, user = seed_users["admin"], seed_users["user"]
    inst = _instance(db_session, srv.id, 120)
    _deploy_task(db_session, user.id, vmid=120, server_id=srv.id)
    _deploy_task(db_session, admin.id, vmid=120, server_id=srv.id)
    _create_log(db_session, admin.username, vmid=120, server_id=srv.id)
    _create_log(db_session, user.username, vmid=120, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) is None


def test_existing_owner_is_never_overwritten(db_session, seed_users):
    srv = _server(db_session)
    admin, user = seed_users["admin"], seed_users["user"]
    inst = _instance(db_session, srv.id, 121, owner_id=user.id)
    _deploy_task(db_session, admin.id, vmid=121, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_soft_deleted_instances_are_left_alone(db_session, seed_users):
    from datetime import datetime, timezone

    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 122, deleted_at=datetime.now(timezone.utc))
    _deploy_task(db_session, user.id, vmid=122, server_id=srv.id)

    _run(db_session)

    assert _owner_of(db_session, inst.id) is None


def test_instance_without_any_evidence_stays_ownerless(db_session, seed_users):
    srv = _server(db_session)
    inst = _instance(db_session, srv.id, 123)

    _run(db_session)

    assert _owner_of(db_session, inst.id) is None


def test_migration_is_idempotent(db_session, seed_users):
    srv = _server(db_session)
    user = seed_users["user"]
    inst = _instance(db_session, srv.id, 124)
    _deploy_task(db_session, user.id, vmid=124, server_id=srv.id)

    _run(db_session)
    _run(db_session)

    assert _owner_of(db_session, inst.id) == user.id


def test_no_ownerless_instances_is_a_no_op(db_session, seed_users):
    srv = _server(db_session)
    _instance(db_session, srv.id, 125, owner_id=seed_users["user"].id)

    _run(db_session)

    remaining = db_session.connection().execute(
        text("SELECT COUNT(*) FROM vm_instances WHERE owner_id IS NULL")
    ).scalar()
    assert remaining == 0
