"""
Shared pytest fixtures.

The DB engine is constructed at import time in ``app.db``. To keep tests
hermetic we set environment variables BEFORE importing the application.
The engine itself is created lazily-connected, so as long as no test issues
a real query the configured URL is irrelevant.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

# --- Environment must be set BEFORE importing app.* ---------------------------

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("LOG_LEVEL", "WARNING")

# Generate a deterministic Fernet key for tests so encrypt/decrypt are stable.
from cryptography.fernet import Fernet  # noqa: E402

os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())

# Ensure the backend root is on sys.path so ``import app`` works regardless of
# the working directory pytest is launched from.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# pydantic-settings auto-loads ``.env`` from the current working directory.
# A developer .env may contain operational keys (POSTGRES_PASSWORD, ALLOWED_HOSTS,
# ...) that are not declared on the Settings model and would raise
# ``extra_forbidden``. Run from a clean temp dir so only env vars are honoured.
_TEST_CWD = Path(tempfile.mkdtemp(prefix="pvemanager-tests-"))
os.chdir(_TEST_CWD)

import pytest  # noqa: E402


# --- Reusable fixtures --------------------------------------------------------


@pytest.fixture
def fake_role_factory():
    """Build a stand-in Role object with a permissions dict."""

    def _make(permissions: dict | None = None, name: str = "tester"):
        return SimpleNamespace(
            name=name,
            permissions=permissions or {},
            has_permission=lambda perm: bool((permissions or {}).get(perm)),
        )

    return _make


@pytest.fixture
def fake_user_factory(fake_role_factory):
    """Build a stand-in User object compatible with auth/rbac code paths."""

    def _make(
        username: str = "alice",
        is_admin: bool = False,
        is_active: bool = True,
        role=None,
        permissions: dict | None = None,
    ):
        if role is None and permissions is not None:
            role = fake_role_factory(permissions=permissions)
        return SimpleNamespace(
            id=1,
            username=username,
            is_admin=is_admin,
            is_active=is_active,
            role=role,
            locked_until=None,
        )

    return _make


@pytest.fixture
def mock_db():
    """Bare MagicMock standing in for a SQLAlchemy session."""
    return MagicMock(name="db_session")
