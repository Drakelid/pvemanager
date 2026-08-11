"""Tests for the setting:view split (migration 42).

``table_exists`` queries ``information_schema`` and is therefore
PostgreSQL-only; it is stubbed so the migration itself — whose statements are
portable — can run against the SQLite test database.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import text

from migrations import migrations as mig
from migrations.migrations import migrate_setting_view_panel_only
from app.models import Role


@pytest.fixture(autouse=True)
def postgres_only_checks(monkeypatch):
    monkeypatch.setattr(mig, "table_exists", lambda conn, table: True)


def _run(db_session):
    """Run the migration on a connection sharing the session's transaction."""
    migrate_setting_view_panel_only(db_session.connection())


def _role(db_session, name, permissions):
    role = Role(
        name=name, display_name=name.title(), permissions=permissions,
        is_system=False, is_active=True,
    )
    db_session.add(role)
    db_session.commit()
    return role


def _perms(db_session, name) -> dict:
    raw = db_session.connection().execute(
        text("SELECT permissions FROM roles WHERE name = :n"), {"n": name}
    ).scalar()
    return raw if isinstance(raw, dict) else json.loads(raw or "{}")


def test_view_only_role_loses_the_grant(db_session):
    _role(db_session, "viewer", {"vm:view": True, "setting:view": True})

    _run(db_session)

    assert "setting:view" not in _perms(db_session, "viewer")
    assert _perms(db_session, "viewer")["vm:view"] is True


def test_panel_administrator_keeps_the_grant(db_session):
    _role(db_session, "ops", {"setting:view": True, "setting:update": True})
    _role(db_session, "sec", {"setting:view": True, "setting:manage": True})

    _run(db_session)

    assert _perms(db_session, "ops")["setting:view"] is True
    assert _perms(db_session, "sec")["setting:view"] is True


def test_role_without_the_grant_is_untouched(db_session):
    _role(db_session, "plain", {"vm:view": True})

    _run(db_session)

    assert _perms(db_session, "plain") == {"vm:view": True}


def test_runs_once_so_a_later_grant_survives(db_session):
    _role(db_session, "viewer", {"setting:view": True})

    _run(db_session)
    # An admin re-grants it deliberately after the upgrade.
    db_session.connection().execute(
        text("UPDATE roles SET permissions = :p WHERE name = 'viewer'"),
        {"p": json.dumps({"setting:view": True})},
    )
    _run(db_session)

    assert _perms(db_session, "viewer")["setting:view"] is True
