<div align="center">

# PVEmanager

**Modern web panel for managing Proxmox servers, virtual machines and LXC containers**

[![Version](https://img.shields.io/badge/version-1.1.3-blue?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](compose.yml)
[![Python](https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](backend/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](backend/)
[![Proxmox](https://img.shields.io/badge/Proxmox%20VE-7.x%20%7C%208.x%20%7C%209.x-E57000?style=flat-square)](https://www.proxmox.com/)

</div>

---

## Overview

PVEmanager is a self-hosted web panel that provides a unified interface for managing multiple Proxmox VE servers and clusters. It covers the full VM/LXC lifecycle — from provisioning to monitoring — with role-based access control, notifications, and IP address management.

## Features

### Infrastructure
- **Multi-server management** — connect and manage multiple Proxmox servers and clusters from a single panel
- **VM & LXC lifecycle** — create, start, stop, restart, resize, delete virtual machines and containers
- **Bulk operations** — mass start / stop / restart / delete with queue and progress tracking
- **Snapshot management** — create, rollback, delete snapshots with an async queue system
- **OS templates** — deploy VMs from templates; cross-node replication handled automatically
- **SDN support** — manage Software-Defined Networking zones, VNets, and subnets

### Access & Console
- **VNC console** — in-browser console via noVNC, no client software required
- **Remote commands** — execute bash commands via QEMU Guest Agent
- **RBAC v2** — granular role-based access control with per-resource permissions
- **Session management** — active session list, remote session revocation, login protection

### Monitoring & Alerts
- **Real-time metrics** — CPU, RAM, Disk, Network charts per node and per VM
- **Background sync** — automatic VM state synchronization from Proxmox API
- **Notifications** — In-App (bell icon), Email (SMTP), Telegram (Bot API)
- **Audit log** — full action log with user, timestamp, and details

### Other
- **IPAM** — IP Address Management with allocation history and orphan detection
- **Multilingual** — Russian and English interface
- **Encrypted credentials** — sensitive fields stored encrypted in the database

---

## Quick Start

```bash
# 1. Clone
git clone https://git.tzim.uz/markmorado/pvemanager.git
cd pvemanager

# 2. Configure
cp .env.example .env
cp backend/.env.example backend/.env
# Edit .env — set POSTGRES_PASSWORD and TZ

# 3. Start
docker compose up -d

# 4. Open
# http://localhost:8000
# Default login: admin / admin123
```

> **Important:** Change the default password immediately after first login.

---

## Requirements

| Requirement | Minimum |
|---|---|
| Docker | 24.x+ |
| Docker Compose | v2.x+ |
| RAM | 512 MB (app) + 256 MB (DB) |
| Proxmox VE | 7.x / 8.x / 9.x |

---

## Configuration

### Environment variables (`.env`)

```bash
# Database
POSTGRES_PASSWORD=your_secure_password

# Timezone (IANA format)
TZ=Europe/Moscow

# Update checks (for private repos — disable or provide a token)
DISABLE_UPDATE_CHECK=false
GITHUB_TOKEN=                     # optional, for private repo update checks
```

### Notifications

Configured via the web interface — **Settings → Notifications**:

- **Email** — SMTP server, port, login, password (Yandex, Gmail, Mail.ru and others)
- **Telegram** — Bot token and Chat ID via [@BotFather](https://t.me/BotFather)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Frontend | Jinja2 templates, Vanilla JS, Bootstrap 5 |
| Database | PostgreSQL 16 |
| Containerization | Docker, Alpine Linux |
| Proxmox API | proxmoxer |
| VNC | noVNC |
| Charts | Chart.js |
| Terminal | xterm.js |

---

## Documentation

| Document | Description |
|---|---|
| [WIKI.md](WIKI.md) | Full user and administrator guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

Made with ❤️ for Proxmox users

[Issues](https://git.tzim.uz/markmorado/pvemanager/issues) · [Changelog](CHANGELOG.md) · [Wiki](WIKI.md)

</div>
