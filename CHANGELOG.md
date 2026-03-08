# Changelog

All notable changes to PVEmanager will be documented in this file.

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
