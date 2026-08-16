# Contributing to PVEmanager

Thank you for considering contributing to PVEmanager! This guide will help you get started.

## Prerequisites

| Tool | Version |
|---|---|
| Docker & Docker Compose | 24.x+ / v2.x+ |
| Node.js | 20+ |
| Python | 3.12+ |
| Git | 2.x+ |

You also need access to at least one Proxmox VE host (7.x / 8.x / 9.x) for integration testing.

## Getting Started

```bash
# Clone the repo
git clone https://git.tzim.uz/markmorado/pvemanager.git
cd pvemanager

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Start everything with Docker
docker compose up -d

# Or use dev mode with Vite HMR for frontend:
docker compose -f compose.yml -f compose.dev.yml up -d frontend
```

The panel is available at `http://localhost:3001` (default login: `admin` / `admin123`).

### Frontend (local development)

```bash
cd frontend
npm install
npm run dev       # Vite dev server with HMR
npm run lint      # ESLint
npm run build:check  # TypeScript check + build
```

### Backend (local development)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements-dev.txt
pytest                      # run test suite
```

## Project Structure

```
pvemanager/
├── backend/            # Python 3.12 + FastAPI + SQLAlchemy
│   ├── app/            # Application code
│   ├── alembic/        # Database migration config
│   ├── migrations/     # Alembic migration scripts
│   └── tests/          # pytest tests
├── frontend/           # React 19 + TypeScript + Vite 8
│   └── src/
│       ├── features/   # Feature modules
│       └── lib/        # Shared utilities
├── nginx/              # Reverse proxy config
├── systemd/            # Systemd service files
└── compose.yml         # Docker Compose (production)
```

## Branch Strategy

- `main` is the primary branch. All pull requests target `main`.
- Use descriptive branch names: `feat/ssh-key-rotation`, `fix/vnc-reconnect`, `i18n/missing-keys`.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/). Write commit messages **in English**.

Format: `<type>(<optional scope>): <description>`

| Type | Use for |
|---|---|
| `feat` | New features |
| `fix` | Bug fixes |
| `docs` | Documentation changes |
| `i18n` | Translations |
| `refactor` | Code changes that neither fix bugs nor add features |
| `test` | Adding or updating tests |
| `scripts` | Shell scripts, tooling |
| `chore` | Maintenance, dependencies |

Examples:
```
feat(frontend): add bulk snapshot dialog
fix: prevent SSL rollback by using container state
i18n: translate dashboard and action dialogs
docs: release notes and version bump for v1.16.1
```

## Code Style

### Backend (Python)
- Follow PEP 8.
- Use type hints for function signatures.
- Keep imports sorted: stdlib, third-party, local.

### Frontend (TypeScript / React)
- Run `npm run lint` before committing.
- Use functional components with hooks.
- UI components: [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS v4.
- State management: Zustand for global state, TanStack Query for server state.

## Internationalization (i18n)

The UI supports Russian and English. Translation files live under `frontend/src/` and use `i18next`.

- Every user-facing string must have a translation key.
- Add keys to both `en` and `ru` translation files.
- Use the `useTranslation()` hook, not hardcoded strings.

## Testing

### Backend
```bash
cd backend
pytest                      # all tests
pytest -m smoke             # smoke tests only
pytest -m unit              # unit tests only
pytest -m integration       # integration tests
pytest --cov                # with coverage
```

### Frontend
```bash
cd frontend
npm run lint                # ESLint checks
npm run build:check         # TypeScript type checking + build
```

## Database Migrations

We use Alembic for database schema changes.

```bash
cd backend
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

Always test migrations both up and down before submitting.

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Make your changes, following the code style and commit conventions above.
3. Add or update tests if applicable.
4. Update translations if you added user-facing strings.
5. Run the full test suite and linter.
6. Open a pull request with a clear description of what and why.

### PR Checklist

- [ ] Commit messages follow Conventional Commits (in English)
- [ ] Linter passes (`npm run lint` / PEP 8)
- [ ] Tests pass (`pytest` / `npm run build:check`)
- [ ] New strings have i18n keys in both `en` and `ru`
- [ ] Database migration included (if schema changed)
- [ ] No secrets or credentials in the diff

## Security

If you discover a security vulnerability, **do not** open a public issue. Instead, refer to [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
