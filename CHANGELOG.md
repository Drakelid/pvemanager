# Changelog

All notable changes to PVEmanager will be documented in this file.

---

## [v1.1.4] - 2026-03-15

### 🗂️ Workspaces — Scoped Server Groups

- New **Workspace** entity: named group of Proxmox servers with scoped user access
- DB models: `Workspace`, `WorkspaceServer`, `WorkspaceUser` with automatic DB migration
- Full CRUD REST API (`/api/workspaces`, `/api/workspaces/{id}`) — admin-only create/update/delete, filtered list for regular users
- `X-Active-Workspace` request header propagated from frontend — filters server/VM/backup API responses to the active workspace
- Default workspace created on first run; all existing servers assigned to it
- Admin workspace management page (`/workspaces`) — create/edit/delete workspaces, assign servers and users
- **Sidebar workspace selector** — active workspace label shown in sidebar, switch without page reload
- `proxmox_server_detail.html` — dedicated server detail page (new template)
- i18n keys added for all workspace UI strings (EN + RU)

### 🔧 Fixes

- Fixed `PermissionChecker` import error in `dashboard.py`

---

## [v1.1.3] - 2026-03-10

### 🚨 Dashboard — Alerts Panel & Real-time Node Stats

- New API endpoint `GET /api/dashboard/alerts` — returns error/critical `AuditLog` entries for the last 24 h (up to 50), protected by `logs.view` permission
- Alerts modal (`openAlertsModal()`) on the dashboard status chip — click to view recent errors
- Mini sparkline charts (Chart.js) for **CPU, RAM, Storage** per node — updates in-place without re-rendering
- Node stats fetched in parallel via `Promise.all` for all online servers
- Full i18n coverage for new dashboard elements: `nodes_label`, `clusters_label`, `alerts_label`, `all_online`, `all_healthy`, `no_alerts`, `all_systems_operational`, `view_all`, `recent_audit_events`, `no_audit_events`, `last_24h`, `ram`, `ram_usage`, `storage`, `paused`, and more

### 🔒 Security — Log sanitisation

- Removed IP addresses from structured log messages in `servers.py` to prevent credential leakage via logs
- `logging_middleware.py` now suppresses noisy GET polling traffic — requests to `/proxmox/api/`, `/api/notifications/unread-count`, `/settings/api/panel` etc. are only logged on HTTP errors (≥ 400) or slow responses (> 5 s)

### 🎨 UI — CSS variables & GitHub stars

- `base.html`: GitHub stars counter switched from Gitea API to GitHub API (`api.github.com`, `stargazers_count`)
- Hard-coded `rgba()` colours in `backups.html` and `proxmox_vms.html` replaced with CSS theme variables (`var(--info-light)`, `var(--warning-light)`)
- Backups server selector redesigned — added icon and label for better clarity

### 📖 WIKI — Fixes & new content

- Fixed broken anchor links in Table of Contents (`#deployment-guide` → `#installation-and-deployment`)
- Added **Snapshots** section with creation guide, management table, and full API reference
- Added **Main Features / Dashboard** section
- Fixed broken emoji characters in section headings (`🛠️ pve CLI Tool`, `🔌 API Reference`)

---

## [v1.1.2] - 2026-03-08

### 🎨 Dashboard Redesign

- New 5-column stat grid: **Nodes, VMs, Containers, Clusters, Alerts**
- Real-time VM/CT count loaded via API on page open
- Resource cards row with mini sparkline charts: **CPU, RAM, Storage**
- Status chip in header: `All systems operational` / warnings / critical
- Header datetime display (live clock)
- Cluster count computed from DB (named clusters + standalone nodes)
- Alerts count sourced from `AuditLog` — errors + criticals in last 24 h
- Recent audit events (last 5) now passed to dashboard context

### 🖥️ Sidebar & Layout (`base.html`)

- **Cluster Selector** widget in sidebar — shows active cluster/standalone name
- **Version badge** in header (`v{{ version }}`)
- `page_subtitle` and `header_status` Jinja2 blocks for per-page overrides
- `loadSidebarCluster()` JS helper — fetches known servers, picks named cluster

### 🛠️ `pve` CLI Tool

- New `pve` shell script at project root — management shortcuts (logs, restart, update, exec, etc.)
- `deploy.sh --install-cli` — installs `pve` to `/usr/local/bin/pve`, patches `PVE_DIR` to project path
- Help visible after installation: `pve help`

### 🎨 Theme CSS

- New CSS classes for redesigned dashboard: `.stats-grid-5`, `.stat-card-v2`, `.resource-cards-row`, `.resource-card`, `.version-badge`, `.status-chip`, `.header-datetime`, `.sidebar-cluster-section`
- Minor CSS fixes across login, logs, tasks, os_templates, users, proxmox_vms, virtual_machines, ipam_dashboard

---

## [v1.1.1] - 2026-03-08

### 🔧 Fix: Update System — Host-side Rebuild

- **Root cause fixed**: `docker compose down` убивал cgroup контейнера вместе с `nohup`-скриптом внутри него — rebuild никогда не завершался, был виден только результат `git pull` (обновлённый `VERSION`)
- **Новый подход**: нажатие «Обновить панель» теперь записывает файл-триггер `.update_trigger` в корень проекта
- Host-side watchdog (`pvemanager-update.service` / `update_host.sh`) обнаруживает триггер и выполняет на хосте:
  `git pull → docker compose down → docker compose build --no-cache app → docker compose up -d`
- Watchdog работает как systemd-сервис на хосте — не зависит от жизни контейнера
- `PROJECT_DIR` определяется динамически в момент установки (не хардкодится)
- `User=` в systemd-юните совпадает с пользователем, запустившим `deploy.sh --watchdog`
- Установка / переустановка watchdog: `sudo ./deploy.sh --watchdog`
- Лог обновления: `./logs/update_host.log`

---

## [v1.1.0] - 2026-03-08

### 🚀 New Features

#### Backup Module
- New **Backups** page with 3 tabs: backup files, storages, scheduled jobs
- Proxmox Backup Server (PBS) support
- APScheduler-based backup job scheduler with cron expressions
- Backup retention policies (keep_last, keep_daily, keep_weekly, keep_monthly)
- Storage pool management (add, edit, delete)
- Task progress tracking via Proxmox UPID
- RBAC permissions for backup resources

#### IPAM Improvements
- Networks now bound to a specific **Proxmox server and node** — prevents cross-server IP assignment
- Manual server + network selection modal when linking IP to a VM/LXC
- Dynamic server and node dropdowns in network creation forms
- New `proxmox_node` field in IPAMNetwork model and schema
- Database migration #16

### 🔧 Fixes

- **Update system**: now correctly rebuilds Docker image after `git pull`
- Auto-detect current git branch (no more hardcoded `main`)
- Update logs saved to persistent `/app/logs/update.log` volume
- `docker-compose` package added to Dockerfile (was missing)

### 🎨 Theme

- All hardcoded colors (`#fff`, `rgba(...)`, `color: white`) replaced with CSS variables across all major templates

### 🌍 Localization

- Added Uzbek language keys for: `proxmox_node`, node selector, link-allocations modal

---

## [v1.0] - 2025-12-15

### 🎉 Initial Production Release

Production-ready version with complete feature set for Proxmox management.

---
