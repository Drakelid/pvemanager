"""Tests for instance ownership and SSH key assignment on deploy.

Covers two regressions:

* ``save_vm_instance`` used to drop ``owner_id`` whenever a row for the
  (server, vmid) pair already existed. Since ``sync_vm_cache`` runs every 10s
  and registers VMs it sees on Proxmox with ``owner_id=NULL``, a deploy that
  takes longer than one sync tick (i.e. every real deploy) always landed in
  that branch and produced ownerless instances.
* SSH keys were resolved against the *requester's* profile, so a VM created by
  an admin on behalf of a user received the admin's key instead of the owner's.
"""

from __future__ import annotations

import pytest

from app.api.proxmox._helpers import save_vm_instance
from app.api.ssh_keys import build_deploy_ssh_keys
from app.models import ProxmoxServer, VMInstance


KEY_ADMIN = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIadmin admin@panel"
KEY_OWNER = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIowner owner@laptop"
KEY_PASTED = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIpasted pasted@manual"


@pytest.fixture
def server(db_session):
    srv = ProxmoxServer(
        name="pve-test",
        hostname="pve-test.local",
        ip_address="10.0.0.1",
        port=8006,
        api_user="root@pam",
        password="secret",
        use_password=True,
        verify_ssl=False,
    )
    db_session.add(srv)
    db_session.commit()
    return srv


def _sync_worker_registers_vm(db_session, server_id: int, vmid: int) -> VMInstance:
    """Mimic sync_vm_cache picking the VM up mid-deploy (no owner known)."""
    row = VMInstance(
        server_id=server_id, vmid=vmid, node="pve1",
        vm_type="qemu", name="web-01", status="running",
    )
    db_session.add(row)
    db_session.commit()
    return row


# ── Ownership ───────────────────────────────────────────────────────────────

def test_owner_assigned_when_sync_registered_vm_first(db_session, server, seed_users):
    """The deploy must claim the row the background sync already created."""
    owner = seed_users["user"]
    _sync_worker_registers_vm(db_session, server.id, 100)

    save_vm_instance(
        db=db_session, server_id=server.id, vmid=100, node="pve1",
        vm_type="qemu", name="web-01", owner_id=owner.id,
    )

    row = db_session.query(VMInstance).filter_by(server_id=server.id, vmid=100).one()
    assert row.owner_id == owner.id


def test_owner_assigned_when_no_prior_row(db_session, server, seed_users):
    owner = seed_users["user"]
    save_vm_instance(
        db=db_session, server_id=server.id, vmid=101, node="pve1",
        vm_type="qemu", name="web-02", owner_id=owner.id,
    )

    row = db_session.query(VMInstance).filter_by(server_id=server.id, vmid=101).one()
    assert row.owner_id == owner.id


def test_owner_preserved_when_caller_omits_owner(db_session, server, seed_users):
    """Callers that don't know the owner (e.g. save-before-delete) must not wipe it."""
    owner = seed_users["user"]
    save_vm_instance(
        db=db_session, server_id=server.id, vmid=102, node="pve1",
        vm_type="qemu", name="web-03", owner_id=owner.id,
    )

    save_vm_instance(
        db=db_session, server_id=server.id, vmid=102, node="pve1",
        vm_type="qemu", name="web-03",
    )

    row = db_session.query(VMInstance).filter_by(server_id=server.id, vmid=102).one()
    assert row.owner_id == owner.id


def test_owner_reassigned_on_restore_of_soft_deleted_row(db_session, server, seed_users):
    admin, owner = seed_users["admin"], seed_users["user"]
    save_vm_instance(
        db=db_session, server_id=server.id, vmid=103, node="pve1",
        vm_type="qemu", name="web-04", owner_id=admin.id,
    )
    row = db_session.query(VMInstance).filter_by(server_id=server.id, vmid=103).one()
    from sqlalchemy import func
    row.deleted_at = func.now()
    db_session.commit()

    save_vm_instance(
        db=db_session, server_id=server.id, vmid=103, node="pve1",
        vm_type="qemu", name="web-04", owner_id=owner.id,
    )

    row = db_session.query(VMInstance).filter_by(server_id=server.id, vmid=103).one()
    assert row.deleted_at is None
    assert row.owner_id == owner.id


# ── SSH keys ────────────────────────────────────────────────────────────────

def test_admin_deploy_uses_owner_profile_key_not_own(db_session, seed_users):
    admin, owner = seed_users["admin"], seed_users["user"]
    admin.ssh_public_key = KEY_ADMIN
    owner.ssh_public_key = KEY_OWNER
    db_session.commit()

    keys = build_deploy_ssh_keys(db_session, admin, owner.id)

    assert KEY_OWNER in keys
    assert KEY_ADMIN not in keys


def test_self_deploy_uses_own_profile_key(db_session, seed_users):
    user = seed_users["user"]
    user.ssh_public_key = KEY_OWNER
    db_session.commit()

    keys = build_deploy_ssh_keys(db_session, user, user.id)

    assert keys.strip() == KEY_OWNER


def test_pasted_keys_and_profile_key_are_merged_and_deduped(db_session, seed_users):
    user = seed_users["user"]
    user.ssh_public_key = KEY_OWNER
    db_session.commit()

    keys = build_deploy_ssh_keys(
        db_session, user, user.id, raw_keys=f"{KEY_PASTED}\n{KEY_OWNER}"
    )

    assert keys.splitlines() == [KEY_PASTED, KEY_OWNER]


def test_saved_library_keys_are_included(db_session, seed_users):
    from app.models import UserSSHKey

    user = seed_users["user"]
    saved = UserSSHKey(user_id=user.id, name="laptop", public_key=KEY_PASTED)
    db_session.add(saved)
    db_session.commit()

    keys = build_deploy_ssh_keys(db_session, user, user.id, key_ids=[saved.id])

    assert KEY_PASTED in keys


def test_user_cannot_use_another_users_saved_key(db_session, seed_users):
    from fastapi import HTTPException
    from app.models import UserSSHKey

    admin, user = seed_users["admin"], seed_users["user"]
    admin_key = UserSSHKey(user_id=admin.id, name="admin-key", public_key=KEY_ADMIN)
    db_session.add(admin_key)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        build_deploy_ssh_keys(db_session, user, user.id, key_ids=[admin_key.id])
    assert exc.value.status_code == 403


def test_no_keys_anywhere_yields_empty_string(db_session, seed_users):
    assert build_deploy_ssh_keys(db_session, seed_users["user"], seed_users["user"].id) == ""
