# Changelog

All notable changes to PVEmanager will be documented in this file.

---

## [v1.7.0] - 2026-06-26

### 🎯 Quotas

- **Per-user resource quotas** — limit each user's number of instances and the summed vCPU, RAM and disk across their VMs/LXC. A missing quota row or a `NULL` column means *unlimited* for that metric, so admins and unrestricted users are never blocked
  - Backend: new `UserQuota` model (`user_quotas` table) and `quota_service` (`get_user_usage` / `check_quota`); usage is computed from the `vm_instances` cache (`owner_id`) — non-deleted, non-template instances only; enforcement raises **HTTP 429** on VM/LXC deploy when a limit would be exceeded
  - Permissions: new `quota:view` and `quota:manage` RBAC permissions (category *User Management*, both require `user:view`)
  - API: `GET/PUT /api/users/{id}/quota` (admin) returns limits plus current usage; `GET /api/quota` (self-service) returns the current user's own limits and usage
  - Frontend: admin quota dialog with usage bars on the Users page; own-limits card on the Settings page; remaining-quota hint in the Create Instance wizard config step; `useUserQuota` / `useSetUserQuota` / `useMyQuota` hooks; RU/EN locales
  - Migration: `user_quotas` table added via `backend/migrations/migrations.py`

---

## [v1.6.0] - 2026-06-23

### ✨ Images

- **Cloud image catalog** — browse and download OS images from multiple sources (default Proxmox mirror and custom mirrors); images are downloaded to Proxmox storage
- **Auto-convert to VM template** — option to automatically convert downloaded `.qcow2` images to Proxmox VM templates on completion
- **Custom mirrors for admins** — admin-only UI to add, edit, list and delete custom mirror sources for image discovery
- **Architecture-aware filtering** — images filtered by node platform architecture (x86-64, aarch64); default architecture matches the selected node's platform
- **Image download with progress** — download dialog with real-time progress tracking and optional template conversion toggle

### 🐛 Bug Fixes

- **Image import filename normalization** — `.img` extension automatically normalized to `.qcow2` during import
- **VM sanitization on image import** — VM names are sanitized during image import to prevent creation errors; improved error messages for transparent user feedback

---

## [v1.5.2-1] - 2026-06-20

### 🖥️ UI

- **Styled confirmation dialogs** — all native browser `confirm()` popups replaced with a consistent themed modal (`ConfirmDialog`). Added global `ConfirmDialogProvider` + `useConfirm` hook (Promise-based API). Affected: update panel, delete template/server/storage/SSH key/HA resource/SDN zone/VNet/subnet/IPAM pool/allocation, apply/revert network changes, IPAM orphan cleanup (16 call-sites across 11 files).

---

## [v1.5.2] - 2026-06-20

### 📊 Metrics

- **Real-time VM disk fill, IOPS and network I/O** — live per-disk usage, disk read/write and network in/out rates added to the instance Overview tab, instances list and dashboard top-loaded list
  - Backend: `get_vm_fsinfo()` pulls per-filesystem usage via QEMU guest agent; `metrics_broadcaster` computes I/O rates (bytes/sec) from cumulative counters; instances-list loop now refreshes each running VM via `status/current` (1 s granularity) instead of `cluster/resources` (10 s pvestatd), with bounded concurrency and 1 s cadence
  - Frontend: per-disk cards, Network I/O and I/O-rate cards on OverviewTab via WebSocket; Net and Disk I/O columns in InstancesPage; Disk% shown for LXC; realtime metrics overlay in DashboardPage top-loaded list

### ⚙️ Settings

- **Per-user language preference** — each user account now has its own `language` column (migration 26); the language selector moved from the Panel tab to the Profile tab; language is saved to DB and applied via `i18n.changeLanguage()` immediately on save
- **Panel tab improvements** — `panel_name` field is read-only in UI (falls back to env `PANEL_NAME`); `log_retention_days` field exposed; Panel API accepts `panel_name` in `PUT` to allow DB override without touching the env var

### 🐛 Bug Fixes

- **SMTP/security settings fields** — renamed SMTP request/response fields (`host`, `port`, `username`, `password`, `from_email`, `tls`) and pointed security settings hooks at `/admin/api/security/settings` with a typed `SecuritySettings` shape; added `minutes` / `security_saved` i18n keys
- **Notifications form UX** — added success/error toasts to SMTP and Telegram save buttons; Profile tab language selector wired up; password-change fields cleared only on success
- **Telegram admin section** — removed the Chat ID field from the global Telegram section (it was never persisted to DB); testing is now done via the personal "My notifications → Send test" flow
- **Webhook URL field** — removed the unimplemented Webhook URL field from the notifications settings to avoid misleading users

---

## [v1.5.1] - 2026-06-04

### 🐛 Bug Fixes

- **Frontend build: missing LogsPage component** — `src/router.tsx` referenced `./features/logs/LogsPage.tsx`, but the file was missing, so Vite 8.0.5 / rolldown failed to resolve the dynamic import. Added `frontend/src/features/logs/LogsPage.tsx` with stats cards (24h total, errors, failed logins, page count), level filter, search, pagination and i18n strings. Wires up to existing `useLogs` / `useLogStats` / `useLogLevels` hooks.
- **Frontend build: `.gitignore` collision** — `frontend/.gitignore` had a bare `logs` entry that matched both the root `logs/` directory and `src/features/logs/`, hiding the new page from VCS. Scoped the rule to `/logs` so the features tree is no longer ignored.

### 📚 Documentation

- WIKI: bumped to v1.5.1 and added a new **Logs & Audit** section with page layout, log-level colour mapping, API reference (`/logs/api/logs`, `/logs/api/stats`, `/logs/api/levels`, `/logs/api/categories`), query parameters, response shape and access-control notes
- README: updated version badge to 1.5.1

---

## [v1.5.0] - 2026-05-07

### 🐧 LXC — CT Template Deployment

- **Create LXC from CT templates** — full deployment workflow for creating LXC containers directly from Proxmox CT template files (`.tar.zst`, `.tar.gz`); node/storage selection, IPAM integration, SSH keys support
- **Unified Create Instance Wizard** — redesigned wizard (`CreateInstanceWizard`) supports both VM templates (QEMU) and CT templates (LXC) in a single multi-step flow with type selector, template browser, config step, and confirmation
- **Reinstall LXC from CT template** — reinstall support for containers created from CT templates; hostname, password, SSH keys, and IP address are preserved across reinstall
- **Preserve credentials/IP across LXC reinstall** — root password, SSH keys, IP configuration, and gateway are carried over automatically when reinstalling an LXC container
- **nesting=1 by default** — all newly created LXC containers get `nesting=1` enabled to ensure compatibility with systemd 255+ (cgroup v2)
- **Fix: double URL-encoding of SSH public keys** — SSH keys passed to Proxmox API during LXC creation no longer get double-encoded

### 🔑 SSH Keys Management

- **SSH Keys API** — full CRUD for user SSH key library: `GET /api/ssh-keys`, `POST /api/ssh-keys`, `PUT /api/ssh-keys/{id}`, `DELETE /api/ssh-keys/{id}`
- **Admin key management** — `GET /api/ssh-keys/user/{user_id}` — admins can view and manage SSH keys of any user
- **Key fingerprint** — SHA-256 fingerprint is computed and stored automatically on key creation/update
- **Private key storage** — optional encrypted private key storage alongside the public key
- **SSH Keys Manager UI** — new tab in Settings page for adding, editing, and deleting SSH keys; shows key name, fingerprint, comment, and creation date
- **Key selector in wizard** — when deploying a VM or LXC, SSH keys can be selected from the personal library; admins deploying on behalf of another user can pick from that user's keys
- **Per-user isolation** — regular users manage only their own keys; users with `users.manage` permission can manage keys for any account

### 🗑️ VM/LXC Operations

- **Auto-stop before destroy** — if a VM or LXC container is running when a delete request is issued, it is automatically stopped first; prevents Proxmox `can't lock file` errors on destruction

### 🖥️ Frontend Improvements

- **InstancesPage** — refreshed layout, improved status badges and action menus
- **NodesPage** — updated node cards with cleaner metrics display
- **TemplatesPage** — improved template list with better filtering and group management
- **BackupsPage** — fixed several edge-cases in backup listing, restore dialog, and job scheduling UI
- **UsersPage** — improved user table with better role display and server assignment indicators
- **SettingsPage** — added SSH Keys Manager section; general UX polish
- **`api-client.ts`** — added SSH keys API methods and LXC template endpoints
- **`websocket.ts`** — connection stability improvements
- **`types/index.ts`** — added `SSHKey`, `LXCTemplate`, `LXCDeployRequest` types

### 🛠️ Developer Experience

- **Dev mode** — new `compose.dev.yml` override for Vite HMR (hot module replacement); use `pve dev` or `docker compose -f compose.yml -f compose.dev.yml up -d frontend`; source files are mounted as volumes so changes apply instantly without rebuilding
- **`.dev-mode` marker** — signals to the `pve` CLI that the frontend is running in dev mode

---

## [v1.4.0] - 2026-04-06

### 🌐 Networks — SDN Management & Node Interfaces

- **Networks page** — new unified page (`/proxmox/networks`) for managing SDN zones, VNets, subnets, and node-level network interfaces; added to sidebar navigation with dedicated icon
- **Edit SDN Zone** — `PUT /api/servers/{server_id}/sdn/zones/{zone}` — update zone properties (mtu, dns, reversedns, ipam, etc.)
- **Edit SDN VNet** — `PUT /api/servers/{server_id}/sdn/vnets/{vnet}` — update VNet alias, VLAN tag, vlanaware, etc.
- **Delete SDN Subnet** — `DELETE /api/servers/{server_id}/sdn/vnets/{vnet}/subnets/{subnet_cidr}` — delete a subnet; optionally delete linked IPAM network (`?delete_ipam_network=true`)
- **Auto-create IPAM network on subnet creation** — `POST .../subnets` now accepts `create_ipam_network: true`; creates a matching `IPAMNetwork` linked to the server and VNet, or returns the existing one
- **Node network interfaces** — full CRUD for node-level interfaces (bridges, bonds, VLANs, ethernet): list, get, create, update, delete via `proxmox_client.py`
- **Apply / Revert node network config** — `PUT` and `DELETE` on `/nodes/{node}/network` to activate or roll back pending changes
- **Node list endpoint** — `GET /api/servers/{server_id}/nodes` — returns nodes for a Proxmox server (used by Networks page selectors)

### 🧹 Code cleanup

- **SDN module imports cleaned up** — removed unused imports (`ssl`, `asyncio`, `httpx`, `websockets`, `func`, `List`, etc.) from `sdn.py`
- **Networks router** — new `networks.py` module under `api/proxmox/` with HTML page route and node API endpoints; registered in `proxmox/__init__.py`

### 🌍 i18n

- **49 new translation keys** (EN + RU) for Networks page: interface types, bridge/bond/VLAN fields, apply/revert config, IPAM integration labels, edit zone/vnet, subnet deletion, and more

---

## [v1.3.1] - 2026-04-05

### 🔍 VM List — Node Filtering & Responsive Toolbar

- **Server filter** — new dropdown to filter the VM list by Proxmox server/cluster; populated dynamically from loaded VMs
- **Node filter** — new dropdown to filter by Proxmox node; automatically narrows to nodes belonging to the selected server
- Both filters are saved in URL params (`?server=...&node=...`) and restored on page reload
- **Toolbar redesigned into 2 rows** — row 1: all filters (type / status / server / node / search with icon + stats); row 2: select-all checkbox, pagination, action buttons
- **Responsive breakpoints** — at ≤900px button labels hide; at ≤768px filters wrap 2-per-row; at ≤480px each filter is full-width; stats counter hidden on mobile
- `populateServerFilter()` and `populateNodeFilter()` helper functions populate dropdowns from loaded VM data
- Snapshots toolbar migrated from legacy `.vm-toolbar-left/.vm-toolbar-right` classes to inline flex, unaffected by toolbar refactor

---

## [v1.3.0] - 2026-03-27

### 🖥️ Console — VNC & Terminal Fixes

- **VNC «Connection closed» fixed** — `RFBClass` (noVNC) now receives the WebSocket URL string directly instead of a pre-opened `WebSocket` object; the `onFirstMessage` hack that broke the RFB handshake before the first frame is fully removed from both `virtual_machines.html` and `instance_detail.html`
- **VNCAuth fixed for QEMU** — `vncproxy` is now called with `"generate-password": 1`; the returned 8-character DES key is passed to noVNC as the VNC password; falls back to `ticket` when `password` is absent (Proxmox 9.x NoAuth mode)
- **LXC `vncproxy` 500 fixed** — LXC `vncproxy` API does not accept `generate-password`; the parameter is omitted for LXC, which uses `ticket` as the VNC password
- **LXC context menu opens xterm.js terminal** — the right-click context menu in the VM list now shows **Terminal** for `lxc` type (calls `openTerminalConsole()`) and **VNC Console** for `qemu` type; previously all types used `openVNCConsole()`
- **Terminal modal added to VM list page** — `#terminalModal` with full xterm.js (FitAddon, WebLinksAddon, Dracula theme) added to `virtual_machines.html`; reuses existing backend endpoints `GET /api/{server_id}/container/{vmid}/terminal` and `WebSocket /proxmox/ws/terminal/{server_id}/{node}/{vmid}`

---

## [v1.2.0] - 2026-03-16

### 🐛 Bug Fix — Disk Resize Lock Conflict

- **Root cause fixed** — `resize.put()` in the Proxmox API is asynchronous and returns a UPID task; the old code did not wait for this task to finish before starting the VM, causing Proxmox to report `can't lock file '/var/lock/qemu-server/lock-xxx.conf' — got timeout` and `command '/usr/bin/qemu-img resize' failed: got timeout`
- **`configure_vm` (VM creation from template)** — now captures the resize UPID and calls `wait_for_task(120 s)` before returning; the VM can only be started after the disk has been fully resized
- **`resize_vm_disk`** — same fix applied; the resize task completes before the function returns
- **`resize_container_disk` (both LXC methods)** — same fix; the restart of the container is now issued only after the resize task is confirmed complete
- **Removed unnecessary post-resize VM restart** — QEMU disk resize operates at the storage layer and does not require a VM reboot; the automatic `restart_vm()` call after manual disk resize has been removed to prevent a second lock conflict

---

## [v1.1.8] - 2026-03-16

### 👤 User → Server Assignment

- **`user_servers` table** (Migration 20) — новая таблица-связка `User ↔ ProxmoxServer`; позволяет напрямую закреплять конкретные серверы за пользователями
- **API `GET /api/users/{id}/servers`** — список серверов, назначенных пользователю
- **API `GET /api/users/{id}/server-assignments`** — расширенный список всех серверов с флагами `assigned` и `compatible` (совместимость по воркспейсам)
- **API `PUT /api/users/{id}/servers`** — установка набора серверов для пользователя; проверяет пересечение воркспейсов — если сервер и пользователь не состоят ни в одном общем воркспейсе, возвращает `409 workspace_conflict`
- **Фильтрация серверов для non-admin** — обычный пользователь видит только серверы, которые ему назначены **и** входят в его воркспейс

### 🖥️ VM / LXC Owner

- **API `GET /api/{server_id}/vm/{vmid}/owner`** — получить текущего владельца VM/LXC и список доступных пользователей
- **API `PUT /api/{server_id}/vm/{vmid}/owner`** — назначить или снять владельца (admin-only); действие логируется в audit

### 🔐 RBAC & Роли

- **Migration 21** — `dashboard:view` принудительно выставлен в `false` для роли `user` (новый формат ключей)
- **Migration 22** — ключ `proxmox.cluster.manage` → `cluster:manage` в роли `admin`; старый dot-формат удаляется, чтобы не сбрасывать весь permission-map
- **`user_count`** в ответе `GET /api/roles` — для каждой роли возвращается количество активных пользователей

### 🚀 Умный редирект после логина

- После успешного входа производится запрос `GET /api/auth/me` — пользователь автоматически перенаправляется на первую страницу, к которой у него есть доступ (`/dashboard` → `/virtual-machines` → `/vms` → `/backups` → `/ipam` → `/logs` → `/settings`)
- Поддержка параметра `?returnUrl=` — возврат на запрошенную страницу после логина

### 🔧 Прочие улучшения

- `GET /api/servers` для не-привилегированного пользователя объединяет фильтры `assigned_servers` и `WorkspaceServer` — пользователь видит только серверы из своего воркспейса, которые ему назначены
- `node_uptime` добавлен в ответ детального API сервера
- Удалена лишняя проверка `PermissionChecker` на GET-роуте страницы `/users` (HTML)

---

## [v1.1.7] - 2026-03-16

### 🌍 i18n — Translation Files Refactored

- **Translations moved to JSON locale files** — all 1 149 translation keys extracted from the Python source into `backend/app/locales/ru.json` and `backend/app/locales/en.json`
- **`i18n.py` reduced from 5 287 → 128 lines** — now a lightweight JSON loader with lazy initialisation; zero changes to the public API (`t()`, `I18nService.get()`, `.get_all()`, `.add_translation()`)
- **Adding a new language requires no code changes** — drop a `xx.json` file into `backend/app/locales/` and it is picked up automatically on next startup
- **`I18nService.reload()`** — new method that reloads all locale files at runtime without a container restart; useful for live translation editing
- **`I18nService.available_languages()`** — returns the list of language codes currently loaded from disk

---

## [v1.1.6] - 2026-03-16

### 🖥️ LXC Terminal — xterm.js Console Fixed

- **Root cause identified and fixed** — Proxmox `termproxy` protocol requires a mandatory auth handshake: the client must send `"USERNAME:VNCTICKET\n"` as the very first WebSocket message; Proxmox responds with `"OK"` before starting the PTY. The backend handler was missing this step entirely, causing Proxmox to wait indefinitely and the browser to show "Disconnected".
- **Auth handshake added** — after connecting to the Proxmox `vncwebsocket` endpoint the backend now sends the auth message, validates the `"OK"` response, and only then starts the bidirectional proxy.
- **Initial terminal data forwarded** — any terminal data arriving in the same `"OK"` frame is immediately forwarded to the browser.
- **Graceful error handling** — auth timeout (>10 s) and explicit rejection close the WebSocket with a descriptive reason code instead of silently hanging.

### 🔧 Fixes

- Fixed `'ProxmoxServer' object has no attribute 'username'` — replaced `server.username` with correct `server.api_user` (with token suffix stripping)
- Fixed `CSRFPreventionToken` being sent in the request body — now sent only as an HTTP header
- Fixed `additional_headers` → `extra_headers` (websockets v12 API rename)
- Added URL-encoding for `vncticket` in the WebSocket URL (`urllib.parse.quote`)
- Added `PVEAuthCookie` header in the WebSocket upgrade request
- Added `subprotocols=["binary"]` required by Proxmox vncwebsocket

---

## [v1.1.5] - 2026-03-15

### 🗂️ Task Drawer — UPID Tracking & Clear Completed

- **UPID-based task tracking** — VM/LXC control methods (`start`, `stop`, `restart`) in `proxmox_client.py` now return the Proxmox task UPID instead of a boolean; each action automatically registers a `ProxmoxTask` entry for real-time Proxmox-side progress polling
- **`DELETE /proxmox/api/all-tasks/completed`** — new API endpoint: removes all `completed` / `failed` / `cancelled` tasks (both `ProxmoxTask` and `TaskQueue`) for the current user in one request
- **Clear button in Task Drawer** — trash icon appears in the drawer header whenever there are finished tasks; clicking it calls the new endpoint and updates the drawer instantly
- **Auto-expire old tasks in Drawer** — tasks older than 24 h are hidden from the Task Drawer on load and every 5 minutes; they remain accessible on the `/tasks` page
- **`openTaskDrawer()` global helper** — bulk VM operations now open the Task Drawer instead of showing a bottom progress toast, providing a unified task-tracking experience
- **Human-readable bulk task descriptions** — `TaskQueue.to_dict()` now maps internal `task_type` keys (`bulk_start`, `bulk_stop`, etc.) to localised Russian descriptions

### 🔧 Fixes

- **`pve` CLI nginx detection** — mode resolution now checks for the nginx config file (`nginx/conf.d/serverpanel.conf`) in addition to the running `serverpanel-nginx` container, fixing prod-mode detection on already-deployed hosts after container restarts

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
