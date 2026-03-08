# Changelog

All notable changes to PVEmanager will be documented in this file.

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
