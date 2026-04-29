# Backend Tests

Smoke / unit tests for the FastAPI backend, focused on the security-critical
modules: `app.crypto`, `app.auth`, `app.rbac`.

## Layout

```
backend/
├── pytest.ini              # pytest config (testpaths=tests, markers, addopts)
├── requirements-dev.txt    # test deps (-r requirements.txt + pytest …)
└── tests/
    ├── conftest.py         # env setup + reusable fixtures
    ├── test_crypto.py      # Fernet field-encryption helpers
    ├── test_auth.py        # password hashing, JWT, IP parsing, perm helpers
    └── test_rbac.py        # PermissionEngine + registry
```

## How `conftest.py` keeps tests hermetic

The application reads configuration at import time:

- `app.config.Settings` is a `pydantic-settings` model that auto-loads `.env`
  from the current working directory.
- `app.db` constructs the SQLAlchemy engine on import.

`tests/conftest.py` therefore, **before any `app.*` import**:

1. Sets `DATABASE_URL`, `SECRET_KEY`, `ADMIN_PASSWORD`, `LOG_LEVEL` to safe
   test values via `os.environ.setdefault`.
2. Generates a fresh `FERNET_KEY` so encrypt/decrypt round-trips succeed.
3. Adds `backend/` to `sys.path`.
4. `chdir`s to a temp directory so the developer's local `.env` (which contains
   keys not declared on `Settings`) is **not** picked up. Without this step
   pydantic raises `extra_forbidden`.

No real Postgres connection is opened — SQLAlchemy connects lazily, and these
tests never issue a query.

## Running locally

There is no system-wide Python on this host, so use the same Python image as CI:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app python:3.12-slim bash -c '
  pip install -r requirements-dev.txt &&
  python -m pytest -p no:warnings
'
```

Run a single test:

```bash
python -m pytest tests/test_auth.py::TestJWT -v
```

## CI

GitHub Actions runs the suite on every push / PR to `main` that touches
`backend/**` — see [.github/workflows/backend-tests.yml](../.github/workflows/backend-tests.yml).
Coverage is reported to the job log and uploaded as an artifact.

## Adding more tests

- **Pure / domain logic** (no DB): use the `fake_user_factory` /
  `fake_role_factory` fixtures in `conftest.py`. They produce
  `SimpleNamespace` objects that satisfy duck-typed access in `auth.py` and
  `rbac/engine.py`.
- **Touches the DB**: build out a SQLite-backed fixture (override
  `app.db.engine` with `sqlite:///:memory:` and `Base.metadata.create_all`).
  Not required for the current smoke layer.
- **API endpoints**: spin up `TestClient(app)` once `get_db` and any external
  Proxmox / SSH dependencies are dependency-overridden.

## Markers

Defined in `pytest.ini`:

- `@pytest.mark.smoke` — quickest sanity checks.
- `@pytest.mark.unit` — pure unit tests.
- `@pytest.mark.integration` — multi-module integration.

Run only smoke tests:

```bash
python -m pytest -m smoke
```
