# 📖 PVEmanager - Documentation

> Complete guide for installation, configuration and usage of PVEmanager v1.13.0

---

## 📑 Table of Contents

1. [Quick Start](#-quick-start)
2. [Installation and Deployment](#-installation-and-deployment)
3. [Main Features](#-main-features)
4. [Notification System](#-notification-system)
5. [VM and Container Management](#-vm-and-container-management)
6. [Bulk Operations](#-bulk-operations)
7. [OS Templates](#-os-templates)
8. [Images — Cloud Image Catalog](#-images--cloud-image-catalog)
9. [LXC CT Template Deployment](#-lxc-ct-template-deployment)
10. [App Store](#-app-store)
11. [Proxmox Clusters](#-proxmox-clusters)
12. [Snapshots](#-snapshots)
13. [Backups](#-backups)
14. [IPAM](#-ipam)
15. [Remote Command Execution](#-remote-command-execution)
16. [Monitoring](#-monitoring)
17. [Security (RBAC v2)](#-security)
18. [Localization](#-localization)
19. [Settings](#-settings)
20. [SSH Keys Management](#-ssh-keys-management)
21. [Networks (SDN & Node Interfaces)](#node-network-interfaces)
22. [pve CLI Tool](#-pve-cli-tool)
23. [API Reference](#-api-reference)
24. [Workspaces](#-workspaces)
25. [User → Server Assignment](#-user--server-assignment)
26. [VM / LXC Ownership](#-vm--lxc-ownership)
27. [Quotas](#-quotas)
28. [Logs & Audit](#-logs--audit)
29. [Deployment Guide](#-installation-and-deployment)
30. [Troubleshooting](#-troubleshooting)
31. [FAQ](#-faq)

---

## 🚀 Quick Start

### Requirements

- Docker and Docker Compose
- 2GB RAM minimum
- Proxmox VE server with API access

### Start in 1 minute

```bash
# Clone repository
git clone https://github.com/your-repo/pvemanager.git
cd pvemanager

# Copy and configure environment variables
cp .env.example .env
cp backend/.env.example backend/.env

# Start
docker compose up -d

# Open in browser
open http://localhost:3001
```

**Default credentials:**
- Login: `admin`
- Password: `admin123`

> ⚠️ Make sure to change password after first login!

---

## 📦 Installation and Deployment

### Deployment Options

#### 1. Standalone (Development)

```bash
docker compose up -d
```
- UI port: 3001 (frontend), API port: 8000 (backend)
- Without NGINX reverse proxy
- Suitable for local development

#### 2. With NGINX (HTTP)

```bash
./deploy.sh
# Select option 2
```

#### 3. With NGINX + SSL (Production)

```bash
./deploy.sh
# Select option 3
# Specify domain and email for Let's Encrypt
```

#### 4. One-command bootstrap (`bootstrap.sh`)

A single script that installs the panel on either a plain Debian/Ubuntu host or directly on a Proxmox VE host — it detects which by checking for `/etc/pve`:

```bash
git clone https://git.tzim.uz/markmorado/pvemanager.git
cd pvemanager
bash bootstrap.sh
```

- **Plain Debian/Ubuntu host** — installs Docker and `git`/`curl`/`openssl`/`jq` if missing, clones the repo into `PVEMANAGER_DIR` (default `/opt/pvemanager`) and hands off to `deploy.sh --standalone`.
- **Proxmox VE host** — creates a Debian 12 LXC (DHCP on `vmbr0`, `nesting=1,keyctl=1` for Docker inside), installs the panel inside it via the same flow, then — once the panel answers `GET /health` — creates a `root@pam!pvemanager` API token locally on the PVE host (`pvesh create ... --privsep 0`) and registers that host as the panel's first node. **No Proxmox password is ever transmitted** to or through the panel.
- Configuration is via environment variables (`PVEMANAGER_REPO`, `PVEMANAGER_VERSION`, `PVEMANAGER_DIR`, and `PVEMANAGER_LXC_*` for the container's vmid/storage/bridge/resources) — see the header of `bootstrap.sh` for the full list and defaults.
- Tolerates `apt-get update` failures from an unsubscribed PVE host's enterprise repo instead of aborting before `git`/`curl` are installed.

### Environment Variables

#### Main (`.env`)

```bash
# Database
POSTGRES_PASSWORD=your_secure_password

# Timezone
TZ=Your/Timezone

# Disable update checks (for private repos without token)
DISABLE_UPDATE_CHECK=false

# GitHub token for private repository access (optional)
GITHUB_TOKEN=
```

#### Backend (`backend/.env`)

```bash
# Secret key (generate unique! minimum 32 characters)
SECRET_KEY=your-very-long-secret-key-change-me

# Default admin password — MUST be changed before first deployment!
ADMIN_PASSWORD=admin123

# Fernet encryption key for sensitive DB fields (Proxmox/cloud-init passwords).
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# WARNING: Keep this key safe — losing it means losing access to encrypted passwords.
# If not set, passwords are stored as plaintext (insecure).
FERNET_KEY=

# JWT token lifetime (minutes). Default: 480 (8 hours)
ACCESS_TOKEN_EXPIRE_MINUTES=480

# CORS origins (comma-separated). Use actual domain(s) in production.
CORS_ORIGINS=*
```

#### Email and Telegram Notifications

SMTP and Telegram bot settings are now managed via web interface:

1. Go to **Settings → Notifications**
2. In "Notification Channels Configuration" section fill:
   - **SMTP** - your mail server details
   - **Telegram** - bot token from @BotFather
3. Click **Test** button to verify settings

---

## 📚 API Reference

This section summarizes key API endpoints. All require JWT authentication.

### Authentication

- `POST /api/auth/login` — returns `access_token`

### System Updates

- `GET /settings/api/version` — current version
- `GET /settings/api/updates/repository` — get git repository URL
- `PUT /settings/api/updates/repository` — set git repository URL
- `GET /settings/api/updates/check` — check for updates
- `POST /settings/api/updates/perform` — start update

### Proxmox Servers

- `GET /api/servers` — list servers
- `POST /api/servers` — add server (`auto_create_token` provisions an API token from a login/password)
- `PUT /api/servers/{id}` — update server
- `DELETE /api/servers/{id}` — delete server
- `POST /api/servers/{id}/test` — test connection
- `POST /api/servers/{id}/provision-token` — migrate a password-auth server to an auto-provisioned API token

### Virtual Machines

- `GET /api/servers/{id}/resources` — list VMs
- `POST /api/servers/{id}/vm/{vmid}/start?node={node}` — start VM
- `POST /api/servers/{id}/vm/{vmid}/stop?node={node}` — stop VM
- `POST /api/servers/{id}/vm/{vmid}/restart?node={node}` — restart VM
- `GET /api/servers/{id}/vm/{vmid}/status?node={node}` — VM status

### Containers

- `GET /api/servers/{id}/resources` — list containers
- `POST /api/servers/{id}/container/{vmid}/start?node={node}` — start container
- `POST /api/servers/{id}/container/{vmid}/stop?node={node}` — stop container
- `POST /api/servers/{id}/container/{vmid}/restart?node={node}` — restart container
- `GET /api/servers/{id}/container/{vmid}/status?node={node}` — container status

### OS Templates

- `GET /templates/api/groups` — list template groups
- `POST /templates/api/groups` — create template group
- `GET /templates/api/templates` — list templates
- `POST /templates/api/templates` — create template
- `DELETE /templates/api/templates/{id}` — delete template

### IPAM

- `GET /ipam/api/networks` — list networks
- `POST /ipam/api/networks` — create network
- `DELETE /ipam/api/networks/{id}` — delete network
- `GET /ipam/api/allocations` — list IP allocations
- `POST /ipam/api/allocations` — create IP allocation
- `DELETE /ipam/api/allocations/{id}` — release IP

### Notifications

- `GET /api/notifications` — list notifications
- `PATCH /api/notifications/{id}/read` — mark as read
- `DELETE /api/notifications/{id}` — delete notification

### Users & Roles

- `GET /api/users` — list users (admin)
- `POST /api/users` — create user (admin)
- `PUT /api/users/{id}` — update user (admin)
- `DELETE /api/users/{id}` — delete user (admin)
- `GET /api/roles` — list roles (admin)
- `POST /api/roles` — create role (admin)
- `PUT /api/roles/{id}` — update role (admin)
- `DELETE /api/roles/{id}` — delete role (admin)

### Quotas

- `GET /api/users/{id}/quota` — get a user's quota plus current usage (requires `quota:view`)
- `PUT /api/users/{id}/quota` — set a user's quota; `null` per metric = unlimited (requires `quota:manage`)
- `GET /api/quota` — get the current user's own quota and usage (self-service)

### Settings

- `GET /settings/api/panel` — get panel settings
- `PUT /settings/api/panel` — update panel settings
- `GET /settings/api/security` — get security settings
- `PUT /settings/api/security` — update security settings
- `GET /settings/api/notifications` — get notification settings
- `PUT /settings/api/notifications` — update notification settings

### Backups & Storages

- `GET /api/backups/storages/{server_id}` — list storages
- `POST /api/backups/storages/{server_id}` — add storage
- `PUT /api/backups/storages/{server_id}/{storage_id}` — update storage
- `DELETE /api/backups/storages/{server_id}/{storage_id}` — delete storage
- `GET /api/backups/list/{server_id}?node=&storage=` — list backup files
- `DELETE /api/backups/{server_id}/backup` — delete backup file
- `POST /api/backups/create` — create VM/LXC backup (vzdump)
- `POST /api/backups/restore` — restore VM/LXC from backup
- `GET /api/backups/task/{server_id}/{node}/{upid}` — get task status/log
- `GET /api/backups/jobs` — list scheduled backup jobs
- `POST /api/backups/jobs` — create scheduled backup job
- `PUT /api/backups/jobs/{id}` — update scheduled backup job
- `DELETE /api/backups/jobs/{id}` — delete scheduled backup job

### High Availability (HA)

- `GET /api/{server_id}/ha/status` — get HA status for all VMs
- `GET /api/{server_id}/ha/{vm_type}/{vmid}` — get HA status for a VM
- `POST /api/{server_id}/ha/{vm_type}/{vmid}/add` — add VM to HA
- `DELETE /api/{server_id}/ha/{vm_type}/{vmid}/remove` — remove VM from HA

### SDN (Software Defined Networking)

- `GET /api/servers/{server_id}/sdn/status` — check SDN availability
- `GET /api/servers/{server_id}/sdn/zones` — list zones
- `POST /api/servers/{server_id}/sdn/zones` — create zone
- `PUT /api/servers/{server_id}/sdn/zones/{zone}` — update zone
- `GET /api/servers/{server_id}/sdn/vnets` — list VNets
- `POST /api/servers/{server_id}/sdn/vnets` — create VNet
- `PUT /api/servers/{server_id}/sdn/vnets/{vnet}` — update VNet
- `POST /api/servers/{server_id}/sdn/vnets/{vnet}/subnets` — create subnet (supports `create_ipam_network`)
- `DELETE /api/servers/{server_id}/sdn/vnets/{vnet}/subnets/{cidr}` — delete subnet
- `POST /api/servers/{server_id}/sdn/apply` — apply pending SDN changes

### Node Networks

- `GET /api/servers/{server_id}/nodes` — list nodes for a server

### Misc

- `POST /api/sync-vms` — force immediate VM sync from all Proxmox servers
- `DELETE /proxmox/api/all-tasks/completed` — delete all completed/failed/cancelled tasks for the current user (both ProxmoxTask and TaskQueue)

---

## 🏠 Main Features

### Dashboard

- **5 stat cards** — Nodes, VMs, Containers, Clusters, Alerts (real-time)
- **Resource cards** — CPU, RAM, Storage with mini sparkline charts
- **Status chip** in header — `All systems operational` / warnings / critical alerts
- **Live clock** in header
- Cluster count computed automatically from database
- Alerts count from AuditLog (errors + criticals in last 24 h)
- Recent audit events (last 5) on the dashboard
- **Cluster Selector** in sidebar — shows active cluster or standalone name
- **Version badge** in header

### Proxmox Servers

- Add multiple servers
- API Token or password authentication
- Automatic API token creation, with in-place migration for existing password-auth servers
- Server status monitoring, distinguishing an unreachable node from rejected/stale credentials
- Per-node storage availability

### VM and LXC Management

- View all virtual machines
- Start / Stop / Restart / Shutdown
- Configuration changes (CPU, RAM, Disk)
- VNC console in browser
- Remote command execution

### Bulk Operations

- Mass start/stop/restart/delete VMs and containers
- Task queue system with progress tracking
- Background processing

### OS Templates

- Quick VM deployment from templates
- Cross-node template deployment for clusters
- Template groups and icons
- VM reinstall from template

### Snapshots

- Create, delete, rollback VM/LXC snapshots
- Snapshot operation queue system
- Snapshot archival on VM deletion

### Backups

- Manual backup creation (vzdump) for VMs and containers
- Backup listing and deletion by storage/node
- Restore VM/LXC from backup with optional new VMID
- **Scheduled backup jobs** with cron expressions
- Backup retention policies (keep_last, keep_daily, keep_weekly, keep_monthly)
- Storage pool management (add, edit, delete)
- Task progress tracking via UPID

### High Availability (HA)

- View HA status for all VMs on a server
- Add/remove VMs from Proxmox HA groups
- Per-VM HA status and group information

### IPAM (IP Address Management)

- Network and subnet management
- **Server and node binding** — networks are linked to a specific Proxmox server and node to prevent cross-server IP assignment
- **Manual server + network selection** modal when linking IP to a VM/LXC
- Dynamic server and node selectors in network creation forms
- Automatic IP allocation
- IP reservation and release
- Allocation history

### Notifications

- Real-time alerts about VM events
- Email notifications via SMTP
- Telegram notifications via Bot API
- In-App notifications with bell icon

### Security

- RBAC v2 with atomic permissions (`resource:action`)
- VPS-style user isolation (users see only their instances)
- IP blocking (automatic and manual)
- Session management
- Login protection (lockout, rate limiting)
- Audit logs

### Quotas

Per-user resource limits enforced when deploying VMs/LXC:

- **Limited metrics** — number of instances, total vCPU (cores), total RAM (MB) and total disk (GB), summed across the user's non-deleted, non-template instances
- **Unlimited by default** — a user with no quota row, or a metric left blank (`NULL`), is unrestricted for that metric; admins are never blocked
- **Enforcement** — deploying an instance that would exceed any limit is rejected with **HTTP 429** and a bilingual message showing the projected value vs. the limit
- **Admin management** — set limits per user on the **Users** page (quota dialog with live usage bars); requires the `quota:manage` permission (`quota:view` to read)
- **Self-service** — each user can see their own limits and current usage on the **Settings** page, and the remaining quota is shown as a hint in the Create Instance wizard
- Current usage is derived from the `vm_instances` cache (`owner_id`), where RAM is stored in MB and disk in GB

### Monitoring

- Real-time CPU, RAM, Disk, Network metrics
- Historical graphs (hour, day, week, month) for both instances and nodes (node **Graphs** tab: CPU, IO delay, memory, load average, network, swap, root filesystem)
- Resource alert thresholds

---

## 🔔 Notification System

### Overview

Notification system provides:
- **Real-time alerts** about VM events
- **Email notifications** via SMTP
- **Telegram notifications** via Bot API
- **In-App notifications** with bell icon

### Notification Types

| Type | Description | Example |
|------|-------------|---------|
| `vm_status` | VM state changes | VM started/stopped |
| `resource_alert` | Resource alerts | CPU > 80%, RAM > 85% |
| `system` | System events | Connection errors |

### Severity Levels

| Level | Color | Description |
|-------|-------|-------------|
| `critical` | 🔴 Red | Critical issues |
| `warning` | 🟠 Orange | Warnings |
| `info` | 🔵 Blue | Informational |
| `success` | 🟢 Green | Successful operations |

### Email Setup

1. Go to **Settings** → **Notifications**
2. In "Notification Channels Configuration" fill SMTP data:
   - **SMTP server** - mail server address
   - **Port** - 465 for SSL, 587 for STARTTLS  
   - **User** - your email
   - **Password** - app password
   - **Sender email** - sender address
3. In "Notification Settings" check **Email notifications**
4. Click **Test** to verify

**Supported SMTP servers:**

| Server | Host | Port | TLS |
|--------|------|------|-----|
| Yandex | smtp.yandex.ru | 465 | SSL |
| Gmail | smtp.gmail.com | 587 | STARTTLS |
| Mail.ru | smtp.mail.ru | 465 | SSL |

> ⚠️ For Yandex and Gmail use "App Password", not main password!

### Telegram Setup

1. Create bot via [@BotFather](https://t.me/BotFather)
2. In **Settings → Notifications** enter bot token
3. Send `/start` to your bot
4. Get Chat ID via [@userinfobot](https://t.me/userinfobot)
5. In "Notification Settings" enable Telegram and enter Chat ID
6. Click **Verify** to confirm

### Notification Settings

| Parameter | Description |
|-----------|-------------|
| Enabled | Activate channel |
| Critical only | Send only critical level |
| Quiet hours | Period without notifications (e.g., 23:00 - 07:00) |

### Background Monitoring

Automatically tracks:
- **VM Status** every 30 seconds
- **Resources** every 60 seconds
- **Thresholds**: CPU > 80%, RAM > 85%, Disk > 90%

---

## 🖥️ VM and Container Management

### Command palette (Ctrl+K)

Press **Ctrl+K** (⌘K on macOS) anywhere in the app to open the **command palette** — a searchable list of every navigation destination. Start typing to filter, then <kbd>Enter</kbd> to jump. The palette and the sidebar are driven by the same unified navigation registry, so they always stay in sync.

### VM Actions

The per-instance row menu (⋯) exposes **Options**, **Migrate**, **Change resources**, **Create backup** and **Delete** alongside the power actions below. The menu stays open across live list refreshes.

| Action | Description | Hotkey |
|--------|-------------|--------|
| Start | Start VM | - |
| Stop | Stop (ACPI shutdown) | - |
| Restart | Reboot | - |
| Force Stop | Force stop | - |
| Delete | Delete VM | - |

> **Instance tabs:** for **VMs**, *Compute resources*, *CPU options*, *Disk management* and *Disk resize* live on the **Hardware** tab; **LXC** containers (which have no Hardware tab) keep those cards on the **Settings** tab.

### Bulk Operations

Select multiple VMs/containers and perform mass actions:

1. Check the checkbox next to each VM you want to select
2. Use "Select All" to select all visible VMs
3. Click action button in the bulk actions bar:
   - **Start All** — Start all selected
   - **Stop All** — Stop all selected
   - **Restart All** — Restart all selected
   - **Delete All** — Delete all selected (with confirmation)

See [Bulk Operations](#-bulk-operations) for more details.

### Console (VNC / Terminal)

- **QEMU VMs** — VNC console via noVNC (in-browser graphical display).
  1. Open VM details → click **Console**, or right-click VM in the list → **VNC Console**
  2. Full keyboard and mouse passthrough; fullscreen supported
- **LXC Containers** — interactive shell via xterm.js terminal.
  1. Open container details → click **Terminal**, or right-click container in the VM list → **Terminal**
  2. Full PTY: tab completion, colours, Unicode, terminal resize on window resize
  3. Uses the Proxmox `termproxy` WebSocket protocol (auth handshake + keepalive pings every 2 min)

### Configuration Changes

```
CPU: 1-32 cores
RAM: 512MB - 128GB
Disk: Increase size (decrease not possible)
```

> **Note (v1.2.0+):** Disk resize is fully asynchronous. The panel waits for the Proxmox resize task to complete before starting the VM, preventing `lock file timeout` errors that occurred when the VM was started immediately after a resize request.

### High Availability (HA)

Requires a Proxmox cluster with HA manager configured.

1. Open VM or container details
2. Go to **HA** tab
3. Click **Add to HA** and choose HA group (optional)
4. To remove — click **Remove from HA**

> Panel operations currently reflect HA status but do not replace Proxmox HA manager configuration.

---

## ⚡ Bulk Operations

### Overview

Bulk operations allow you to perform the same action on multiple VMs or containers at once. This is useful when you need to start, stop, or restart many virtual machines simultaneously.

### Supported Actions

| Action | Description | Confirmation Required |
|--------|-------------|----------------------|
| Bulk Start | Start all selected VMs/containers | No |
| Bulk Stop | Stop all selected (ACPI shutdown) | No |
| Bulk Restart | Restart all selected | No |
| Bulk Shutdown | Graceful shutdown | No |
| Bulk Delete | Delete all selected | Yes (double confirm) |

### How to Use

1. **Navigate to Virtual Machines page**
2. **Select VMs** using checkboxes:
   - Click individual checkboxes
   - Or use "Select All" to select all visible VMs
3. **Bulk Actions Bar** appears at the bottom when VMs are selected
4. **Click desired action** button
5. **Confirm** if prompted (for delete operations)

### Task Drawer

When you initiate a bulk operation the **Task Drawer** opens automatically in the sidebar. It shows real-time progress for each task:

- **Running** tasks show a spinner and current progress (`completed / total`)
- **Completed** tasks are shown in green; **Failed** in red
- Tasks older than **24 hours** are automatically hidden from the drawer (they remain accessible on the `/tasks` page)
- Use the **trash icon** (🗑) in the drawer header to remove all finished/failed/cancelled tasks in one click

### Proxmox UPID Tracking

Starting from v1.1.5, individual VM/LXC control actions (start / stop / restart) are linked to the real Proxmox task UPID. The UPID is registered as a `ProxmoxTask` entry and polled in real time, so the Task Drawer reflects the actual Proxmox-side task state.

### Limitations

- Only one bulk task runs at a time
- Tasks are processed sequentially
- Maximum items per task: unlimited (but consider server load)
- Tasks cannot be paused (only cancelled if pending)

---

## 📋 OS Templates

### Concept

OS Templates allow quick VM deployment from preconfigured templates.

### Creating Template Group

1. **OS Templates** → **Groups** → **Add Group**
2. Enter name (e.g., "Linux Servers")
3. Add description

### Adding Template

1. **OS Templates** → **Templates** → **Add Template**
2. Or: **Scan** → select from Proxmox

### Deploying VM

1. Select template
2. Specify:
   - VM name
   - **Target Node** (for clusters - select where to deploy)
   - CPU/RAM/Disk
   - IP address (or auto from IPAM)
   - SSH key (optional)
3. Click **Deploy**

### Cross-Node Template Deployment (Clusters)

When using Proxmox clusters, templates can be deployed to any cluster node:

#### How it works

1. **Create template on any node** - Template is initially created on one cluster node
2. **Select target node** - When deploying VM, choose any online cluster node
3. **Automatic replication** - If template doesn't exist on target node:
   - System clones template to target node
   - Converts clone to template
   - Tracks replicated templates in database
4. **Subsequent deployments** - Use already replicated template (fast)

#### Requirements

- Proxmox cluster (nodes must be in same cluster)
- Shared storage recommended (but not required)
- Template must be accessible from source node

#### Example

```
Cluster: pve1, pve2, pve3
Template: Ubuntu-22.04 on pve1

Deploy to pve1: Uses original template (fast)
Deploy to pve2: Replicates template → deploys (first time slower)
Deploy to pve3: Replicates template → deploys (first time slower)

Next deploy to pve2: Uses replicated template (fast)
```

### Reinstalling VM

1. Open VM details
2. Click **Reinstall**
3. Select template
4. VMID preserved

---

## 📥 Images — Cloud Image Catalog

### Overview

The **Images** module allows you to browse, download, and manage OS images from cloud repositories. Images can be downloaded directly to Proxmox storage and optionally converted to VM templates automatically.

### Features

- **Browse cloud images** — discover OS images from the default Proxmox repository and custom mirrors
- **Download images** — download `.qcow2` images to any Proxmox storage with progress tracking
- **Auto-convert to template** — optional automatic conversion of downloaded images to Proxmox VM templates
- **Architecture-aware filtering** — images are filtered by node platform (x86-64, aarch64); default architecture matches the selected node
- **Custom mirrors** — administrators can add, edit, and manage custom mirror sources for image discovery
- **ISO downloads** — fetch install ISOs by URL, from a saved mirror (`kind=iso`), or straight from the ISO step of the create-instance wizard. The bundled catalog stays `.qcow2`-only on purpose — install ISOs have no stable "latest" URL, so hardcoded links would rot on every point release
- **Local file upload** — upload an ISO or LXC template (`vztmpl`) from your own machine straight to node storage, for images that aren't published anywhere the panel can reach

### Accessing Images

1. Go to **Infrastructure** → **Images** (sidebar)
2. Select a Proxmox server and node
3. Browse available images filtered by architecture

### Downloading an Image

1. Click **Download** next to the desired image
2. Select target storage
3. Optionally enable **Convert to Template** (creates a VM template on completion)
4. Click **Download** — progress is tracked in real-time
5. Once complete, the image is available in storage for VM deployment

### Uploading a Local File

1. Go to **Infrastructure** → **Images** and pick **Upload**
2. Select an ISO or `vztmpl` file and the target storage
3. The panel streams the file to the node in the background; progress is tracked the same way as a URL download
4. Once complete, the file is available in storage for VM/CT deployment

### Installing an OS from an ISO

The create-instance wizard offers a **blank VM** kind for ISO-based installs: it provisions an empty disk with the chosen ISO mounted on `ide2` and set first in the boot order, so the VM boots straight into the installer over the built-in noVNC console. Selecting a Windows guest automatically presets OVMF firmware, a SATA disk and an e1000 NIC, since the installer has no virtio drivers loaded yet.

### Ejecting and Mounting an ISO

From a VM's detail page, the ISO dialog shows every ISO already on the node's storage — including ones that predate the node joining the panel — and the image currently mounted, if any:

- **Mount** — pick an ISO from storage; optionally check **"boot from this ISO"** to put the CD-ROM drive first in the boot order.
- **Eject** (renamed from "Detach") — remove the mounted ISO; optionally check **"boot from disk"** to put the primary disk first in the boot order.

Either action that changes boot order applies it via a **hybrid reboot**: a graceful ACPI shutdown with a `forceStop` fallback, then start. This avoids the guest-ping timeout that a plain restart hits on a freshly installed OS with no QEMU Guest Agent running yet.

### Custom Mirrors (Admin Only)

Administrators can configure custom image repositories:

1. Go to **Settings** → **Images** → **Custom Mirrors**
2. Click **Add Mirror**
3. Enter mirror URL (must be a valid Proxmox repository)
4. Save — mirror appears in the image browser immediately

**Mirror URL Format:**

A valid mirror must serve Proxmox's standard repository structure with an `index.json` file containing image metadata.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/images` | List available images |
| `GET` | `/api/images/node-arch/{server_id}/{node}` | Get architecture for a node |
| `POST` | `/api/images/download` | Start image download (returns task UPID) |
| `GET` | `/api/images/mirrors` | List configured custom mirrors (admin) |
| `POST` | `/api/images/mirrors` | Add custom mirror (admin) |
| `PUT` | `/api/images/mirrors/{id}` | Update mirror (admin) |
| `DELETE` | `/api/images/mirrors/{id}` | Delete mirror (admin) |

### Image Download Task Tracking

Image downloads are tracked as Proxmox tasks (UPID). Use the standard task endpoint to monitor progress:

```bash
GET /api/backups/task/{server_id}/{node}/{upid}
```



## � LXC CT Template Deployment

### Overview

Starting from v1.5.0, LXC containers can be created directly from Proxmox CT template files (`.tar.zst`, `.tar.gz`) without needing a pre-configured OS Template entry. This is the standard way to deploy Debian, Ubuntu, Alpine, and other distros from the Proxmox download list.

### Browsing Available CT Templates

CT templates are fetched directly from the Proxmox server storage:

1. Go to **Instances** → **Create Instance**
2. Select the target Proxmox server
3. Choose type **LXC Container**
4. The wizard fetches available `.tar.zst` / `.tar.gz` files from all storages on the selected server

### Deploying an LXC Container

1. **Server** step — select Proxmox server
2. **Type** step — select **LXC Container**
3. **Template** step — select a CT template from the list
4. **Config** step — fill in:
   - Container name (hostname)
   - CPU cores, RAM (MB), Swap (MB), Disk (GB)
   - Storage, network bridge
   - IP address / gateway (manual or from IPAM)
   - Root password and/or SSH keys
   - Owner (admin only)
   - Start after create / On-boot options
5. **Confirm** step — review and click **Deploy**

Deployment runs asynchronously; progress is tracked in the Task Drawer.

### SSH Keys in LXC Deployment

- Select one or more keys from the personal SSH key library (see [SSH Keys Management](#-ssh-keys-management))
- Admins deploying on behalf of another user can pick from that user's key library
- Keys are injected into the container's `authorized_keys` during provisioning

### Reinstalling an LXC Container (CT template)

Containers created from CT templates support reinstall:

1. Open the container's action menu → **Reinstall**
2. Optionally select a different CT template
3. The following are preserved automatically:
   - Root password
   - SSH keys
   - IP address and gateway
4. The old container is destroyed and a new one is created with the same VMID

> **Note:** `nesting=1` is enabled by default on all new LXC containers for systemd 255+ (cgroup v2) compatibility.

---

## 🛒 App Store

Catalog of self-hosted applications with one-click install. Each app runs in its own **unprivileged LXC** container with **Docker Compose** (1 app = 1 LXC). The catalog is **multi-source**: [`runtipi/runtipi-appstore`](https://github.com/runtipi/runtipi-appstore) (~265 apps) and, optionally, [`getumbrel/umbrel-apps`](https://github.com/getumbrel/umbrel-apps) (~380 apps). Sources are selected via `APPSTORE_SOURCES`; Umbrel app ids are namespaced (`umbrel-<id>`) to avoid collisions.

### Prerequisites

- A **golden LXC template** (Debian 12 + Docker + Compose) per Proxmox server. Build it from **App Store → золотой шаблон** (`POST /api/appstore/golden-template`, picks server/node/storage) — this automates the manual procedure in [docs/golden-template.md](docs/golden-template.md). Template and rootfs storage are picked from dropdowns populated with the selected server/node's actual storages (filtered by `vztmpl`/`rootdir` content), defaulting to `local`/`local-lvm` when available. The resulting vztmpl volid is stored **per `server_id`** (a template built on server A lives on A's storage only and is never used to install on server B); `APPSTORE_GOLDEN_TEMPLATE` is just the last-resort fallback for servers that never got their own build.
- **SSH access** from the panel to the Proxmox node (used for `pct exec` / `pct push`).
- `FERNET_KEY` set (encrypts app secrets at rest).

### Environment settings

| Variable | Default | Purpose |
|---|---|---|
| `APPSTORE_GOLDEN_TEMPLATE` | — | golden vztmpl volid fallback, used only if a server has no per-server template saved |
| `APPSTORE_NAMESERVER` | `1.1.1.1 8.8.8.8` | DNS explicitly set on App Store LXCs (and the golden-template build CT) — without it, the container inherits the node's resolver, which can be unreachable from the LXC's network (e.g. a Tailscale-only DNS on the host) and break image pulls |
| `APPSTORE_SOURCES` | `runtipi` | active catalog sources, comma-separated (`runtipi`, `umbrel`) |
| `RUNTIPI_APPSTORE_REPO` | `runtipi/runtipi-appstore` | Runtipi catalog source |
| `RUNTIPI_APPSTORE_REF` | `master` | branch/tag/commit (pin recommended) |
| `UMBREL_APPSTORE_REPO` | `getumbrel/umbrel-apps` | Umbrel catalog source (used when `umbrel` is enabled) |
| `UMBREL_APPSTORE_REF` | `master` | Umbrel branch/tag/commit |
| `UMBREL_APPSTORE_GALLERY_CDN` | `https://getumbrel.github.io/umbrel-apps-gallery` | Umbrel icons CDN (`<app-id>/icon.svg`, fetched per-file in parallel) |
| `APPSTORE_DATA_DIR` | `/app/data/appstore` | logo cache (mounted volume) |
| `CATALOG_SYNC_INTERVAL_HOURS` | `24` | auto catalog sync interval |
| `APPSTORE_HOST_ARCH` | `amd64` | target node arch (marks unsupported apps) |

### Catalog

- **App Store** screen: card grid with search and category filters; **Refresh catalog** button + last-sync timestamp. When more than one source is enabled, a **source filter** and a per-card **source badge** (Runtipi / Umbrel) appear.
- Automatic sync every 24 h; a broken app entry is skipped without failing the whole sync. Each source syncs independently and the *disappeared → unavailable* pass is scoped per source.
- Umbrel apps: metadata comes from `umbrel-app.yml`, icons from the gallery repo; on install the Umbrel `app_proxy`/`tor` runtime services are stripped and the container port (`app_proxy → APP_PORT`) is published on the LXC host.
- App page: description, version, source link, install disclaimer, and a compose preview.

### Install

Pipeline (each step is journaled and streamed over WebSocket):

1. Clone the golden LXC template (default 2 vCPU / 2048 MB / 8 GB, DHCP or advanced overrides).
2. Start and wait for IP.
3. `pct push` `docker-compose.yml` + `.env` (form answers + generated `random` secrets) + any bundled `data_files`.
4. `docker compose up -d`.
5. HTTP health-check.
6. Show the app URL and one-time credentials.

A failed step sets status `error` with a step log; **Retry** does not recreate the LXC (idempotent by VMID) and reuses the original install parameters (saved in `installed_apps.install_params`), **Delete** removes the container and the record.

**Reliability notes:**
- Files bundled with a catalog app (`data_files`) are delivered to the container before `docker compose up`; Umbrel `APP_PASSWORD` / `default_credentials` are honored.
- Bind-mount host directories (`volumes:` in the app's compose, both `${APP_DATA_DIR}/...` and relative paths) are pre-created with permissive ownership before `up` — otherwise Docker auto-creates them as root and non-root container users (e.g. mariadb's `mysql`) get `Permission denied`.
- The VMID search skips already-occupied records — `nextid` does not reserve the number, so a retry could otherwise grab another container.
- `pct create` retries a few times on a transient config-lock error (common right after deleting the same VMID, while the node is still wiping the old disk).
- **Delete** now waits for Proxmox to actually confirm the destroy task finished (up to 30 min, covers slow disk wipes) before marking the app removed — otherwise a VMID could be reused while still busy on the node.
- `.env` values containing `#` are quoted (the dotenv parser would otherwise trim them as an inline comment); a port chosen explicitly in the wizard (including `80`) is published as-is.

### Minimized operations tray

Long-running App Store operations — an app **install** and a **golden-template build** — can be minimized instead of keeping the dialog open:

- Minimized operations live in a **global store** (persisted to `localStorage`) and are rendered as a **tray** in the app layout, so a chip **survives page navigation and a full tab reload**. The tray polls each operation's progress itself (REST, every 3 s), independently of the dialog.
- **Clicking a chip** returns to the operation's page and reopens the dialog — an install resumes in the wizard, a template build reopens the golden-template dialog with the server preselected.
- **Minimize** adds the operation to the tray and closes the dialog; the chip's ✕ only removes the chip (the operation keeps running on the server). Chips for operations that no longer exist (a `404` after reload) are cleared automatically.

### My Apps

Manage installed apps: **Start / Stop / Restart / Logs / Delete**, live status, and a clickable `IP:port`.

- **Reconciliation** runs every 60 s and on screen open: an LXC removed outside PVEmanager is flagged `orphaned`.
- **Update**: takes a pre-update Proxmox snapshot → `docker compose pull && up -d` → health-check; keeps only the last pre-update snapshot.
- **Rollback**: restores the snapshot (⚠️ also reverts app **data** to the snapshot moment) and reverts the version in the database.

### Permissions

`app:view` (catalog + My Apps), `app:install` (install), `app:manage` (sync, lifecycle, update, rollback, delete). Admins bypass all checks.

### REST API

```
GET    /api/appstore/catalog                      # list (q, category, source)
GET    /api/appstore/catalog/{app_id}             # detail
GET    /api/appstore/catalog/{app_id}/logo        # logo (public)
POST   /api/appstore/catalog/sync                 # manual sync (admin)
POST   /api/appstore/apps/install                 # install
GET    /api/appstore/apps                          # installed list
POST   /api/appstore/apps/{id}/action/{start|stop|restart}
GET    /api/appstore/apps/{id}/logs
POST   /api/appstore/apps/{id}/update
POST   /api/appstore/apps/{id}/rollback
POST   /api/appstore/apps/reconcile
DELETE /api/appstore/apps/{id}
POST   /api/appstore/golden-template                    # build golden vztmpl for a server
GET    /api/appstore/golden-template/status?server_id=…  # per-server template + last build op
```

---

## �🔗 Proxmox Clusters

### Overview

PVEmanager fully supports Proxmox clusters, enabling management of multiple nodes as a single entity.

### Adding a Cluster

1. Go to **Proxmox VE** → **Add Server**
2. Enter **any node's** IP address (e.g., pve1)
3. Panel automatically discovers all cluster nodes
4. All nodes appear in node selectors

### Cluster Benefits

| Feature | Standalone | Cluster |
|---------|------------|---------|
| Node count | 1 | Multiple |
| Cross-node templates | ❌ | ✅ |
| Target node selection | ❌ | ✅ |
| Automatic failover | ❌ | ✅ (Proxmox HA) |

### Creating a Proxmox Cluster

If your nodes aren't clustered yet:

```bash
# On first node (pve1)
pvecm create my-cluster

# On other nodes (pve2, pve3, etc.)
pvecm add 10.10.10.11  # IP of pve1
```

### Cross-Node Template Deployment

See [OS Templates - Cross-Node Template Deployment](#cross-node-template-deployment-clusters)

### Importing an Existing Cluster

If nodes were already joined into a cluster outside the panel (via `pvecm` or the Proxmox web UI), add each node to the panel as a regular standalone server first, then use **Cluster** → **Import**:

1. Pick any one of the already-added nodes — the panel reads `cluster/config/join` from it to detect the real cluster name and node list
2. Matching panel servers (by IP or hostname) are pre-selected; nodes not yet added to the panel are listed but can't be linked until you add them as servers
3. Confirm — the panel only links the matching server records to the cluster group in its own database; no `pvecm` command is run and the real cluster is not touched

This is the DB-only counterpart to **Create cluster**/**Join node**, which perform the actual `pvecm create`/`pvecm add` operations — use Import only when the nodes are already clustered for real.

---

## 📸 Snapshots

### Overview

Snapshots allow you to save and restore the state of VMs and containers at any point in time.

### Creating a Snapshot

1. Open VM or container details
2. Go to the **Snapshots** tab
3. Click **Create Snapshot**
4. Enter a name and description
5. Optionally include RAM state (QEMU VMs only)

### Managing Snapshots

| Action | Description |
|--------|-------------|
| Create | Save current VM state |
| Rollback | Restore to a previous snapshot state |
| Delete | Remove an existing snapshot |

> ⚠️ Rolling back will discard all changes made after the snapshot was created!

### Snapshot Queue

Snapshot operations are processed through the task queue system. Progress is tracked and results are saved for each item.

### API Endpoints

```bash
# List snapshots
GET /api/{server_id}/vm/{vmid}/snapshots?node={node}

# Create snapshot
POST /api/{server_id}/vm/{vmid}/snapshots?node={node}

# Delete snapshot
DELETE /api/{server_id}/vm/{vmid}/snapshots/{snapname}?node={node}

# Rollback to snapshot
POST /api/{server_id}/vm/{vmid}/snapshots/{snapname}/rollback?node={node}
```

> For LXC containers use `/container/` instead of `/vm/` in the endpoints above.

---

## 💾 Backups

### Overview

PVEmanager provides a full backup management interface powered by Proxmox `vzdump`. You can create, browse, restore and delete backups, as well as configure automated scheduled jobs.

### Storage Management

Before creating backups, make sure the target storage is configured in Proxmox.

| Action | Description |
|--------|-------------|
| List storages | View all storages on a server |
| Add storage | Add a new storage pool (directory, NFS, CIFS, etc.) |
| Edit storage | Modify storage configuration |
| Delete storage | Remove storage from Proxmox |

### Creating a Backup

1. Navigate to **Backups** page
2. Select **Server** and **Node**
3. Choose **Storage** where the backup will be saved
4. Select **VM/Container** (by VMID)
5. Configure options:
   - **Mode**: `snapshot` (default), `suspend`, or `stop`
   - **Compress**: `zstd` (default), `lzo`, `gzip`, `none`
6. Click **Create Backup**
7. A UPID is returned — use it to track task progress

### Backup Modes

| Mode | Description | Downtime |
|------|-------------|----------|
| `snapshot` | Live snapshot (requires QEMU agent or LVM) | None |
| `suspend` | Suspend VM during backup | Brief |
| `stop` | Stop VM, backup, start again | Full stop |

### Listing & Deleting Backups

- Browse existing backups by server, node and storage
- Filter by VMID
- Delete individual backup files

### Restore

1. Select a backup file from the list
2. Click **Restore**
3. Specify:
   - **Target storage** for restoration
   - **New VMID** (optional, keep original or assign new)
   - **Start after restore** (optional)
4. Restoration runs as a Proxmox task (UPID returned for tracking)

> ⚠️ Restoring to an existing VMID will overwrite it!

### Scheduled Backup Jobs

Automate recurring backups using cron-style scheduling.

#### Creating a Backup Job

```
Server: select Proxmox server
Node: target node
VMIDs: comma-separated list (e.g., 100,101,102)
Storage: backup destination
Mode: snapshot / suspend / stop
Compress: zstd / lzo / gzip / none
Cron: standard 5-field cron expression
Enabled: on/off toggle
```

#### Cron Expression Examples

| Expression | Meaning |
|------------|---------|
| `0 2 * * *` | Every day at 02:00 |
| `0 3 * * 0` | Every Sunday at 03:00 |
| `0 1 * * 1-5` | Weekdays at 01:00 |
| `30 4 1 * *` | First day of each month at 04:30 |

#### Retention Policies

Configure how many backups to keep automatically:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `keep_last` | Keep N most recent backups | 3 |
| `keep_daily` | Keep one per day for N days | 7 |
| `keep_weekly` | Keep one per week for N weeks | 4 |
| `keep_monthly` | Keep one per month for N months | 6 |

#### Managing Jobs

- **List jobs** — All backup jobs (admins see all; users see own)
- **Enable/disable** — Toggle job without deleting it
- **Edit** — Change schedule, retention, storage
- **Delete** — Remove job and its APScheduler entry

### Task Tracking

Every backup operation (create / restore / delete) returns a Proxmox UPID. Use it to poll task status and logs:

```bash
# Get task status
GET /api/backups/task/{server_id}/{node}/{upid}
```

---

## 🌐 IPAM

### Networks

Create networks to organize IP space:

```
Name: Production Network
CIDR: 192.168.1.0/24
VLAN: 100
Gateway: 192.168.1.1
DNS: 8.8.8.8, 8.8.4.4
Proxmox Server: select server
Proxmox Node: select node (prevents cross-server IP assignment)
```

### IP Pools

Pools define ranges for automatic allocation:

```
Pool: Web Servers
Start: 192.168.1.10
End: 192.168.1.50
```

### IP Status

| Status | Description |
|--------|-------------|
| 🟢 Available | Free |
| 🔵 Allocated | Assigned to VM |
| 🟠 Reserved | Reserved |

---

## 💻 Remote Command Execution

### Requirements

- **QEMU Guest Agent** installed and running in VM
- VM must be running

### Installing Guest Agent

**Debian/Ubuntu:**
```bash
apt install qemu-guest-agent
systemctl enable --now qemu-guest-agent
```

**CentOS/RHEL/AlmaLinux:**
```bash
yum install qemu-guest-agent
systemctl enable --now qemu-guest-agent
```

**Windows:**
Download [virtio-win drivers](https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/)

### Usage

1. Open VM details
2. Go to **Commands** tab
3. Enter command or select from quick commands
4. Click **Execute**

### Quick Commands

| Command | Description |
|---------|-------------|
| `df -h` | Disk usage |
| `free -h` | Memory usage |
| `uptime` | Uptime |
| `ps aux` | Process list |
| `systemctl status` | Service status |

### Limitations

- Timeout: 30 seconds
- Interactive commands not supported
- Requires Guest Agent

---

## 📊 Monitoring

### Real-time Metrics

- **CPU**: Total load + per core
- **RAM**: Used/Total
- **Disk**: Used/Total + I/O (per-disk cards on Overview tab)
- **Network**: In/Out traffic (rates in bytes/sec)
- **Disk IOPS**: Read/write rates per disk via QEMU guest agent (`get_vm_fsinfo`)
- **Network I/O rates**: Live bytes/sec computed from cumulative counters in `metrics_broadcaster`

#### Data Granularity

| Source | Granularity | Used for |
|--------|-------------|---------|
| `cluster/resources` (pvestatd) | 10 s | Node and storage overview |
| `status/current` | 1 s | Running VM real-time metrics |

All running VMs are polled via `status/current` at a 1 s cadence with bounded concurrency. Results are broadcast via WebSocket.

#### Where Metrics Appear

| Location | Data shown |
|----------|-----------|
| Instance → Overview tab | Per-disk fill cards, Network I/O card, Disk I/O-rate card |
| Instances list | Net I/O and Disk I/O columns; Disk% for LXC |
| Dashboard top-loaded list | CPU, RAM, Disk, Net metrics overlay |

### Graph Periods

- Hour
- Day
- Week
- Month

### Alerts

Threshold values for notifications:

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | 80% | 90% |
| RAM | 85% | 95% |
| Disk | 90% | 95% |

---

## 🔒 Security

### Overview

PVEmanager includes comprehensive security features to protect your infrastructure.

### RBAC v2 — Role-Based Access Control

> **This is the section to read if RBAC feels confusing.** It explains the whole
> model end-to-end: what a permission *is*, how a request is actually checked,
> what every built-in role can do, and — crucially — how "each user sees only
> their own VMs" is a **separate** mechanism from RBAC and is easy to
> misconfigure. Backend source of truth: `backend/app/rbac/permissions.py`
> (catalogue of permissions), `backend/app/rbac/engine.py` (the check logic),
> `backend/app/rbac/migration.py` (default roles).

#### The mental model in one paragraph

A **user** has exactly one **role**. A role is just a named JSON map of
**permissions** → `true`/`false` (e.g. `{"vm:view": true, "vm:delete": false}`).
Every protected API endpoint declares the permission it needs (e.g. "you need
`vm:create`"). On each request the **Permission Engine** looks at the caller's
role map and answers yes/no. There are no per-resource ACLs and no permission
"scopes" in practice — a permission is either granted to the role or it is not.
The one apparent exception, "users only see their own instances", is **not** a
permission at all — it is a separate ownership filter described at the bottom of
this section.

#### Permission format

Every permission is an atomic string:

```
resource:action
```

- **`resource`** — *what* you are acting on (`vm`, `backup`, `user`, …).
- **`action`** — *what you do* to it (`view`, `create`, `delete`, …).

Examples: `vm:view` (see VMs), `server:create` (add a Proxmox server),
`log:export` (download audit logs), `role:manage` (full role administration).

> **About `:scope`.** The permission dataclass technically supports a third
> `:scope` segment, but **no built-in permission uses it** — every real
> permission is global (`resource:action`). Ignore scope when designing roles;
> tenant isolation is handled by ownership, not by a `:own` scope. (Older
> versions of this wiki documented fictional `vms:view:own` codes — those never
> existed in the code and have been removed.)

#### How a permission check actually works (the engine)

When an endpoint asks "does this user have `X:Y`?", `PermissionEngine.has_permission`
evaluates these rules **in order** and returns `true` on the first match:

1. **Admin bypass.** If the user is an administrator (`is_admin`, or role name
   `admin`), the answer is always **yes** — admins implicitly hold every
   permission and are never blocked.
2. **Direct grant.** The exact code is present and `true` in the role map
   (`vm:create` is in the role → yes).
3. **Wildcard grant.** The role holds `resource:*` (e.g. `vm:*` grants *every*
   `vm:` action). Wildcards are not used by the built-in roles but you may add
   them to custom roles.
4. **`manage` implies common actions.** If the role holds `resource:manage`, the
   engine also grants these actions on that resource: **`view`, `list`, `update`,
   `start`, `stop`, `restart`**. So `vm:manage` alone lets a user view/edit/power
   VMs without listing those actions separately. ⚠️ Note `manage` does **not**
   imply `create` or `delete` — grant those explicitly.

If none match, access is denied with **HTTP 403 `Permission denied: X:Y`**.

> **Enforcement points.** Endpoints gate access via the `PermissionChecker`
> FastAPI dependency (`Depends(PermissionChecker("vm:create"))`) or an inline
> `require_permission(user, "vm:create")` call. The frontend independently hides
> sidebar items the user lacks permission for (see the UI-mapping table below),
> but the backend check is the real security boundary.

#### `requires` — permission dependencies

Many permissions declare prerequisites (the `requires` field in
`permissions.py`). These express logical dependencies — e.g. `vm:create`
`requires` `vm:view` + `template:view`; `vm:execute` `requires` `vm:console`.

> **Important:** `requires` is **documentation / UI guidance**, not runtime
> enforcement — the engine does not auto-grant prerequisites. When you build a
> custom role, tick the prerequisites yourself, otherwise the feature may be
> half-broken (e.g. a user who can `vm:create` but lacks `vm:view` cannot see the
> VM they just created).

#### Full permission catalogue

Grouped by resource. "Implied by `manage`" means the engine grants it for free
when the role holds `<resource>:manage` (rule 4 above).

**Dashboard**

| Permission | Unlocks |
|---|---|
| `dashboard:view` | Access the Dashboard page and overview stats |

**Proxmox Servers & Cluster** (`server`, `cluster`)

| Permission | Unlocks |
|---|---|
| `server:view` | See the server/node list and status |
| `server:create` | Add a new Proxmox server |
| `server:update` | Edit server connection settings |
| `server:delete` | Remove a Proxmox server |
| `server:manage` | Full server management incl. cluster ops (requires `server:view`) |
| `cluster:manage` | Create clusters, join/eject nodes (requires `server:view`) |

**Virtual Machines** (`vm`)

| Permission | Unlocks |
|---|---|
| `vm:view` | See VMs (subject to ownership filter — see below) |
| `vm:create` | Create VMs (requires `vm:view`, `template:view`) |
| `vm:update` | Change VM config (CPU/RAM/disk) |
| `vm:delete` | Delete VMs |
| `vm:start` / `vm:stop` / `vm:restart` | Power actions |
| `vm:console` | noVNC / xterm.js console |
| `vm:migrate` | Migrate between nodes of the same cluster |
| `vm:remote_migrate` | Migrate to a *different* registered cluster (requires `vm:migrate`) |
| `vm:execute` | Run commands via QEMU guest agent (requires `vm:console`) |
| `vm:manage` | Full VM management **and the global "see all instances" flag** (see isolation section) |

**LXC Containers** (`lxc`) — same shape as VM: `view`, `create`, `update`,
`delete`, `start`, `stop`, `restart`, `console`, `migrate`, `remote_migrate`.
(There is no separate `lxc:manage`; container listing/power is governed by the
`lxc:*` actions and the same ownership filter as VMs.)

**Templates & Images** (`template`)

| Permission | Unlocks |
|---|---|
| `template:view` | Browse OS templates |
| `template:create` / `template:update` / `template:delete` | Manage template entries |
| `template:manage` | Full template management incl. the **Images** (cloud-image download) page |

**Storage** (`storage`): `storage:view`, `storage:manage`.
**Backups** (`backup`): `backup:view`, `backup:create`, `backup:restore`, `backup:delete`, `backup:manage` (storages + scheduled jobs).
**IPAM** (`ipam`): `ipam:view`, `ipam:manage`.
**Networking** (`network`): `network:view`, `network:manage` (node interfaces + SDN zones/vnets/subnets).
**Firewall** (`firewall`): `firewall:view`, `firewall:manage` (datacenter/node/VM rules, groups, IP sets).
**Node administration** (`node`): `node:view`, `node:manage` (systemd services, APT), `node:upgrade` (apt dist-upgrade), `node:power` (reboot/shutdown the physical node).
**Resource pools** (`pool`): `pool:view`, `pool:manage`.
**PVE access** (`access`): `access:view`, `access:manage` (Proxmox auth realms & API tokens).
**App Store** (`app`): `app:view` (catalog + My Apps), `app:install`, `app:manage` (sync, update, rollback, delete).
**Scripts** (`script`): `script:view`, `script:execute`, `script:manage` (edit scripts & git sources).

**Users, Quotas & Roles** (`user`, `quota`, `role`)

| Permission | Unlocks |
|---|---|
| `user:view` | See the user list |
| `user:create` / `user:update` / `user:delete` | Manage user accounts |
| `user:manage` | Full user admin, incl. managing **other** users' SSH keys |
| `quota:view` / `quota:manage` | Read / set per-user resource quotas (requires `user:view`) |
| `role:view` | See roles & their permissions |
| `role:create` / `role:update` / `role:delete` | Manage roles |
| `role:manage` | Full role administration incl. assigning roles (requires `role:view`, `user:view`) |

**Logs** (`log`): `log:view`, `log:export`, `log:delete`.
**Settings** (`setting`): `setting:view`, `setting:update` (panel settings), `setting:manage` (security & advanced settings). These cover **panel-wide** configuration only — a user's own account (profile, password, 2FA, SSH keys, notification preferences) lives at `/profile`, is self-scoped, and needs no permission.
**Notifications** (`notification`): `notification:view`, `notification:manage`.

> **Delegated role editing.** A non-admin with `role:manage` can only grant
> permissions they **themselves already hold** (`can_assign_permission` /
> `validate_role_permissions`). This prevents privilege escalation — you cannot
> hand out access you don't have. Admins are exempt and can grant anything.

#### Which permission unlocks which sidebar page

The frontend (`frontend/src/lib/nav-items.ts`) hides a menu entry unless the
user is an admin or holds the listed permission. Items with **no** permission
are **admin-only**. The same permission also guards the route itself
(`RequirePermission` in `frontend/src/components/shared/route-guards.tsx`), so
a hidden page cannot be reached by typing its URL — denied users are redirected
to the first page they can open.

| Sidebar item | Required permission |
|---|---|
| Dashboard | `dashboard:view` |
| Instances | `vm:view` |
| Nodes | `server:view` |
| Cluster | `cluster:manage` |
| Templates | `template:view` |
| Images | `template:manage` |
| Backups | `backup:view` |
| Tasks | `vm:view` |
| App Store / My Apps | `app:view` |
| Scripts | `script:view` |
| IPAM | `ipam:view` |
| Networks | `server:manage` |
| Users | `user:view` |
| Workspaces | *(admin-only)* |
| Logs | `log:view` |
| Settings (panel-wide) | `setting:view` |
| Profile (user menu, not the sidebar) | *(none — any logged-in user)* |

#### Default (built-in) roles

Four roles are seeded/updated on every startup by
`ensure_default_roles_new_format`. They are `is_system` roles. The seeding logic
**only adds missing permission keys** — it never overwrites keys an admin has
already toggled in the UI — so your customisations to these roles survive
upgrades. New permissions introduced by a version bump are also **backfilled**
onto custom roles that already hold the matching umbrella permission
(`backfill_granular_permissions`), so a custom role built on `server:manage`
automatically gains new `node:*` / `network:*` keys instead of silently losing
access.

| Role | Intended use | What it can do |
|------|--------------|----------------|
| **admin** | Platform administrator | Everything. Holds every permission *and* the `is_admin` bypass — sees all servers, all instances (regardless of owner), all users, settings, security. |
| **moderator** | Operator without admin rights | View dashboard/servers; **create + power + console** VMs and LXC; view templates/storage/firewall/network/node/pool/backups/IPAM/users/logs; create backups; export logs; manage notifications. **No** delete, no settings changes, no user/role management. Note: without `vm:manage` a moderator is still subject to the ownership filter (see below). |
| **user** | Standard tenant (VPS-style) | View + **start/stop/restart/console** their **own** VMs and LXC; view templates/storage/firewall/network/node/pool/IPAM; manage own notifications. Their own profile, SSH keys and quota live at `/profile` and need no permission, so this role deliberately has **no** `setting:view` (that would hand out the panel-wide settings page). **No** create/delete by default, **no** dashboard. Scoped to owned instances because it lacks `vm:manage`. |
| **demo** | Read-only showcase | View-only across dashboard, servers, VMs, LXC, templates, storage, firewall, network, node, pool, IPAM. No power actions, no writes. |

> The exact JSON for each role lives in `NEW_DEFAULT_ROLES` in
> `backend/app/rbac/migration.py` — consult it if you need the byte-for-byte
> permission set.

#### Managing roles in the UI

1. Open **Users** (needs `role:view`; editing needs `role:manage` or admin).
2. Switch to the **Roles** tab → **New Role** or edit an existing one.
3. Permissions are presented grouped by category (Virtual Machines, Backups,
   User Management, …). Tick the checkboxes you want.
4. Remember to also tick the **prerequisites** (`requires`) — the engine does not
   auto-enable them.
5. Assign the role to a user on the user's edit dialog.

`is_system` roles (admin/moderator/user/demo) cannot be deleted, but their
permission sets can be tuned (your changes are preserved across upgrades).

#### Legacy permission format

Older releases used a dot format (`vms.view`, `proxmox.manage`). These are
mapped to the new colon format via `LEGACY_PERMISSION_MAP` and converted
**once** in the database at startup, so no runtime translation is needed. You may
still type a legacy code into a custom role — it is resolved transparently — but
new roles should use the `resource:action` form.

---

### User Isolation — "each user sees only their own instances"

This is the feature most often confused with RBAC. **It is not a permission.**
It is a separate ownership filter layered *on top of* the `vm:*`/`lxc:*`
permissions. Understanding the split is the key to configuring tenants correctly.

#### The rule

| Caller | Sees / controls |
|---|---|
| Admin, or role named `admin` | **All** instances |
| Any role holding **`vm:manage`** | **All** instances |
| Everyone else (incl. stock `user` role) | **Only** instances they **own** (`owner_id == user.id`) |

The decision is made by `can_view_all_instances` in
`backend/app/api/proxmox/_helpers.py`. Note carefully: the "see everything" key
is **`vm:manage`**, **not** `vm:view`. The stock `user` role deliberately carries
`vm:view` only so the Instances page works at all — `vm:view` on its own never
reveals other tenants' VMs.

> ⚠️ **The single most common misconfiguration:** granting `vm:manage` to the
> `user` role (or a custom "tenant" role) to "let them manage their VMs". That
> flips on the global view and every user suddenly sees **every** VM in the
> panel. For tenants, grant the granular actions (`vm:update`, `vm:delete`,
> `vm:start`, …) instead of `vm:manage`. Reserve `vm:manage` for
> operators/admins who are *supposed* to see everything.

#### How ownership is enforced everywhere

Ownership is checked not just on the instance list but on every surface a
non-privileged user can reach:

- **Instance list & single-instance actions** — `check_vm_access` / `require_vm_access`
  verify `owner_id` before any view/power/console/snapshot/backup/delete op.
- **Live resource endpoints** — the dashboard (`/api/resources/all`) and the
  node/server page (`/api/{server_id}/resources`) call `get_owned_vmids` and
  filter the live Proxmox listing down to owned VMIDs, so a user with only
  `server:view` cannot enumerate other owners' VMs through the node page.

#### Assigning an owner

1. **Automatic** — when a user deploys a VM/LXC they become its `owner_id`.
2. **Manual (admin)** — open the instance → **Owner** button → pick a user →
   Save. See [VM / LXC Ownership](#-vm--lxc-ownership) for the REST API.

Instances synced from Proxmox before ownership existed have `owner_id = NULL`
(visible to privileged users only). Bulk-assign them with:

```bash
docker compose exec app python assign_instances_owner.py
```

#### RBAC vs Workspaces vs Server-assignment vs Ownership

These four mechanisms compose — a non-admin must pass **all** applicable filters:

| Layer | Question it answers | Configured in |
|---|---|---|
| **RBAC role** | *What actions* may this user perform at all? | Users → Roles |
| **Workspaces** | *Which servers* is this user allowed to see? | [Workspaces](#-workspaces) |
| **Server assignment** | *Which specific servers* within those workspaces? | [User → Server Assignment](#-user--server-assignment) |
| **Ownership** | *Which individual VMs/LXC* (unless `vm:manage`/admin)? | [VM / LXC Ownership](#-vm--lxc-ownership) |

### Snapshots

Snapshots allow you to save and restore the state of VMs and containers.

#### VM Snapshots

```bash
# List snapshots
GET /api/{server_id}/vm/{vmid}/snapshots?node={node}

# Create snapshot
POST /api/{server_id}/vm/{vmid}/snapshots?node={node}
{
  "snapname": "before-update",
  "description": "Before system update",
  "vmstate": false  # Include RAM state (optional)
}

# Delete snapshot
DELETE /api/{server_id}/vm/{vmid}/snapshots/{snapname}?node={node}

# Rollback to snapshot
POST /api/{server_id}/vm/{vmid}/snapshots/{snapname}/rollback?node={node}&start=false
```

#### Container Snapshots

Same endpoints, but use `/container/` instead of `/vm/`.

### SDN (Software Defined Networking)

Manage Proxmox SDN zones and virtual networks.

#### Check SDN Availability

```bash
GET /api/servers/{server_id}/sdn/status
```

Returns:
```json
{
  "server_id": 1,
  "sdn_available": true,
  "pending_changes": false
}
```

#### Zone Types

| Type | Description |
|------|-------------|
| `simple` | Basic isolated network |
| `vlan` | VLAN-based separation |
| `vxlan` | VXLAN overlay network |
| `evpn` | EVPN/VXLAN with BGP |

#### SDN API Endpoints

```bash
# List zones
GET /api/servers/{server_id}/sdn/zones

# Create zone
POST /api/servers/{server_id}/sdn/zones
{
  "zone": "myzone",
  "type": "simple"
}

# Update zone
PUT /api/servers/{server_id}/sdn/zones/{zone}
{
  "mtu": 1500,
  "dns": "8.8.8.8"
}

# List VNets
GET /api/servers/{server_id}/sdn/vnets

# Create VNet
POST /api/servers/{server_id}/sdn/vnets
{
  "vnet": "vnet1",
  "zone": "myzone",
  "alias": "Production Network"
}

# Update VNet
PUT /api/servers/{server_id}/sdn/vnets/{vnet}
{
  "alias": "Updated Alias",
  "tag": 100
}

# Create subnet (with optional IPAM auto-create)
POST /api/servers/{server_id}/sdn/vnets/{vnet}/subnets
{
  "subnet": "10.0.0.0/24",
  "gateway": "10.0.0.1",
  "snat": true,
  "create_ipam_network": true
}

# Delete subnet (optionally delete linked IPAM network)
DELETE /api/servers/{server_id}/sdn/vnets/{vnet}/subnets/{subnet_cidr}?delete_ipam_network=true

# Apply changes (required after modifications)
POST /api/servers/{server_id}/sdn/apply
```

### Node Network Interfaces

Manage network interfaces (bridges, bonds, VLANs) directly on Proxmox nodes.

#### Accessing the Networks Page

1. Open **Networks** from the sidebar (requires `server:manage` permission; SDN/interface writes need `network:manage`)
2. Select a **Server** from the dropdown
3. The page shows two tabs: **SDN** and **Node Interfaces**

#### Node Interface Management

| Action | Description |
|--------|-------------|
| List interfaces | View all interfaces on a selected node |
| Create interface | Create bridge, bond, VLAN, or alias |
| Edit interface | Modify IP, netmask, gateway, ports, etc. |
| Delete interface | Remove interface configuration |
| Apply config | Activate pending changes |
| Revert config | Roll back to running configuration |

> ⚠️ Always **Apply** changes after creating or editing interfaces. Changes are staged until applied.

#### Node Network API Endpoints

```bash
# List nodes for a server
GET /api/servers/{server_id}/nodes

# List interfaces on a node
GET /proxmox/api/servers/{server_id}/nodes/{node}/networks

# Get interface details
GET /proxmox/api/servers/{server_id}/nodes/{node}/networks/{iface}

# Create interface
POST /proxmox/api/servers/{server_id}/nodes/{node}/networks
{
  "iface": "vmbr1",
  "type": "bridge",
  "address": "10.0.0.1",
  "netmask": "255.255.255.0",
  "bridge_ports": "ens4",
  "autostart": true
}

# Update interface
PUT /proxmox/api/servers/{server_id}/nodes/{node}/networks/{iface}
{
  "address": "10.0.0.2"
}

# Delete interface
DELETE /proxmox/api/servers/{server_id}/nodes/{node}/networks/{iface}

# Apply pending network config
PUT /proxmox/api/servers/{server_id}/nodes/{node}/networks/apply

# Revert pending changes
DELETE /proxmox/api/servers/{server_id}/nodes/{node}/networks/revert
```

#### Legacy Compatibility

Old permission format (`vms.view`, `proxmox.manage`) is still supported and automatically converted to new format.

### IP Blocking

Automatic and manual IP blocking protects against brute-force attacks.

#### Automatic Blocking

When a user fails to login multiple times from the same IP:
1. After threshold (default: 10) failed attempts
2. IP is blocked for configured duration (default: 60 minutes)
3. Block can be temporary or permanent

#### Manual Blocking

Administrators can manually block IPs:
- Block with reason
- Set duration or make permanent
- View blocked IP list
- Unblock as needed

### Session Management

Track and control active user sessions.

| Feature | Description |
|---------|-------------|
| Active Sessions | View all currently logged in users |
| Device Info | Browser and device detection |
| IP Tracking | Session IP address logging |
| Single Session | Option to allow only one session per user |
| Force Logout | Terminate any session |

### Login Protection

| Setting | Default | Description |
|---------|---------|-------------|
| Max Login Attempts | 5 | Attempts before account lockout |
| Lockout Duration | 30 min | How long account stays locked |
| IP Block Threshold | 10 | Failed attempts before IP block |
| IP Block Duration | 60 min | How long IP stays blocked |

### Security Settings

Access via **Settings → Security**:

| Setting | Default | Description |
|---------|---------|-------------|
| Session Timeout | 60 min | Auto-logout after inactivity |
| Single Session | Off | Allow only one session per user |
| Password Min Length | 8 | Minimum password characters |
| Require Uppercase | Yes | Password must have uppercase |
| Require Lowercase | Yes | Password must have lowercase |
| Require Numbers | Yes | Password must have digits |
| Require Special | No | Password must have special chars |
| Password Expiry | 0 (never) | Days until password expires |
| API Rate Limit | 60/min | API requests per minute |

### Best Practices

1. **Change default passwords** immediately after installation
2. **Enable SSL/HTTPS** in production
3. **Use strong passwords** with complexity requirements
4. **Monitor login attempts** for suspicious activity
5. **Configure firewall** to limit access to panel
6. **Regular updates** to get security patches

---

## � Logs & Audit

### Overview

The **Logs** page (`/logs` in the sidebar) gives admins a full searchable view of the panel's `audit_logs` table. It complements the Dashboard activity feed with deeper filtering, pagination, and aggregated 24-hour stats.

### Page Layout

1. **Stat cards (24h window)** — total events, errors count, failed logins, current page row count
2. **Filters** — free-text search (matches message and username) and a level dropdown populated from `GET /logs/api/levels`
3. **Logs table** — timestamp, level badge, category, username, message
4. **Pagination** — driven by the API (`page`, `limit`)

### Log Levels

| Level | Color | Description |
|-------|-------|-------------|
| `INFO` | 🔵 Blue | Informational events |
| `SUCCESS` | 🟢 Green | Successful operations |
| `WARNING` | 🟡 Yellow | Non-critical warnings |
| `ERROR` | 🔴 Red | Failures |
| `CRITICAL` | 🟣 Purple | Critical security / system events |

### API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/logs/api/logs` | List audit log entries (paginated) |
| `GET` | `/logs/api/stats` | Aggregated stats (24h by default) |
| `GET` | `/logs/api/levels` | Distinct levels for the filter dropdown |
| `GET` | `/logs/api/categories` | Distinct categories |

#### Query Parameters for `GET /logs/api/logs`

| Name | Type | Description |
|------|------|-------------|
| `search` | string | Free-text search over message/username |
| `level` | string | Filter by level (`INFO`, `ERROR`, …) |
| `category` | string | Filter by category |
| `username` | string | Filter by username |
| `page` | int | Page number (1-based) |
| `limit` | int | Page size (default 50) |
| `date_from` | ISO date | Inclusive lower bound |
| `date_to` | ISO date | Inclusive upper bound |

#### Response Shape

```json
{
  "logs": [
    {
      "id": 1234,
      "timestamp": "2026-06-04T10:21:33Z",
      "level": "INFO",
      "category": "vm",
      "username": "admin",
      "message": "VM 100 started on node pve1"
    }
  ],
  "total": 532,
  "page": 1,
  "limit": 50,
  "pages": 11
}
```

### Access Control

The Logs page is gated by the `log:view` permission in RBAC v2. The default `admin` role has it; `moderator` has read-only access; `user` and `demo` roles do not see the page.

### Retention

Log retention is controlled via **Settings → Panel → Log Retention Days** (added in v1.5.2). Entries older than the configured number of days are pruned automatically. Default is 30 days.

---

## �🔑 SSH Keys Management

### Overview

Every user has a personal SSH key library. Keys stored in the library can be selected when deploying VMs or LXC containers, eliminating the need to paste the public key manually each time.

### Managing SSH Keys

1. Go to **Settings** → **SSH Keys**
2. Click **Add Key**
3. Fill in:
   - **Name** — a human-readable label (e.g., `Work laptop`)
   - **Public Key** — paste the full public key (`ssh-rsa ...`, `ssh-ed25519 ...`, etc.)
   - **Private Key** *(optional)* — stored encrypted in the database
   - **Comment** *(optional)* — free-form note
4. Click **Save**

The SHA-256 fingerprint is computed and displayed automatically.

### Using Keys When Deploying

- In the **Create Instance Wizard**, the **Config** step shows a key selector
- Regular users see their own keys
- Admins selecting an owner see the owner's keys in addition to their own

### Admin Key Management

Admins (users with `user:manage` permission) can view and manage SSH keys for any user:

```
GET  /api/ssh-keys/user/{user_id}   — list keys for a specific user
```

### API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ssh-keys` | List own SSH keys |
| `POST` | `/api/ssh-keys` | Add a new key |
| `PUT` | `/api/ssh-keys/{id}` | Update a key |
| `DELETE` | `/api/ssh-keys/{id}` | Delete a key |
| `GET` | `/api/ssh-keys/user/{user_id}` | List keys for any user (admin) |

---

## 🌍 Localization

### Supported Languages

- 🇷🇺 Russian
- 🇺🇸 English (default)
- 🇺🇿 Uzbek (partial)

### Switching Language

Since v1.5.2, language is a **per-user** preference stored in the database.

1. **Settings** → **Profile**
2. Select language in the **Language** dropdown
3. Click **Save** — the interface switches immediately without a page reload

### Adding New Language

Translations are stored as flat JSON files in `backend/app/locales/`.
To add a new language, simply create a new file — no code changes required:

```bash
# Create a new locale file for Uzbek
cp backend/app/locales/en.json backend/app/locales/uz.json
# Then translate the values in uz.json
```

The file name becomes the language code (`uz.json` → `"uz"`). The panel picks
it up automatically on next startup (or call `I18nService.reload()` at runtime).

> **Structure:** each file is a flat `{"key": "translated string"}` JSON object.
> Keys must match the existing keys in `ru.json` / `en.json`.

---

## ⚙️ Settings

### User Profile

- Full name
- Email (for notifications)
- Password change
- **Language** — per-user UI language (stored in DB column `users.language`); applies immediately on save via `i18n.changeLanguage()`; each account keeps its own preference
- **SSH Public Key** — stored in user profile and automatically injected into VM/LXC during cloud-init deployment

### Panel Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| Refresh interval | Data refresh frequency | 30 sec |
| Log retention | How many days to keep logs | 30 days |
| Panel name | Display name (read-only in UI, can be overridden in DB) | `PANEL_NAME` env |

> **Note:** The language setting was moved from the Panel tab to the Profile tab in v1.5.2 — each user now controls their own language independently.

### System Updates & Repository Selection

The panel supports automatic updates from a Git repository. You can choose which repository to use:

**Available Options:**
1. **git.tzim.uz/markmorado/pvemanager** (Default) — Primary repository
2. **github.com/markmorado/pvemanager** — Mirror repository
3. **Custom Repository** — Your own fork or mirror

**How to Change Repository:**

1. Go to **Settings** → **System Updates**
2. In "Git Repository" dropdown, select your preferred repository
3. For custom repository:
   - Select "Custom Repository..." from dropdown
   - Enter full URL (e.g., `https://git.example.com/user/repo`)
   - Click Save

The repository setting affects:
- Update checks (version comparison)
- Changelog retrieval
- Panel update process

> **Note:** Make sure the selected repository contains valid `VERSION` and `CHANGELOG.md` files.

### How the Update Process Works

Starting from v1.1.1, updates are executed by a **host-side watchdog** (`pvemanager-update.service`) instead of inside the container. This solves the fundamental problem where `docker compose down` would kill the in-container script before the rebuild could complete.

```
[UI: "Update Panel"] → perform_update() → writes .update_trigger
                                                   ↓ (poll every 3 sec)
                                [pvemanager-update.service on HOST]
                                detects trigger → removes it → runs:
                                  git pull
                                  docker compose down
                                  docker compose build --no-cache app
                                  docker compose up -d
```

**Logs:** `./logs/update_host.log` (visible from the panel)

### Installing the Update Watchdog

The watchdog must be installed once on the host machine. It is automatically set up when you run `deploy.sh`, or you can install/reinstall it separately:

```bash
# Install or reinstall (requires root for systemd)
sudo ./deploy.sh --watchdog

# Verify it is running
systemctl status pvemanager-update

# Watch live update log
tail -f logs/update_host.log
```

**Requirements:**
- systemd on the host
- The user who runs `deploy.sh --watchdog` (or `$SUDO_USER`) must be in the `docker` group (root is always allowed)
- The `compose.yml` volume `.:/project:rw` must be present (it is by default)

> **Note for non-root users:** If you run `./deploy.sh --watchdog` without sudo, it generates ready-to-use files in `./systemd/` and prints the exact `sudo` commands needed to install them.

### Notification Settings

- In-App: Always enabled
- Email: Requires SMTP setup
- Telegram: Requires Bot Token

---

## 🛠️ pve CLI Tool

Starting from v1.1.2, PVEmanager ships with a `pve` shell script — a handy CLI shortcut for common management tasks.

### Installation

```bash
# Requires root (copies script to /usr/local/bin/pve and patches project path)
sudo ./deploy.sh --install-cli
```

After installation the `pve` command is available system-wide.

### Usage

```bash
pve help           # Show all available commands
pve logs           # Tail live app logs
pve restart        # Restart all containers
pve update         # Trigger panel update (via watchdog)
pve exec <cmd>     # Execute command inside app container
pve status         # Show docker compose status
pve dev            # Start frontend in dev mode (Vite HMR)
pve dev stop       # Stop dev mode, switch back to production frontend
```

### How It Works

- `deploy.sh --install-cli` reads the `pve` file from the project root
- Replaces the placeholder `PVE_DIR` with the actual project path
- Writes the result to `/usr/local/bin/pve` and makes it executable
- Re-run `sudo ./deploy.sh --install-cli` after moving the project directory

> **Note:** The `pve` binary reflects the project directory at install time. If you relocate the project, reinstall the CLI.

---

## 🔌 API Reference

### Authentication

```bash
# Get token
POST /api/auth/login
Content-Type: application/json

{
    "username": "admin",
    "password": "admin123"
}

# Response
{
    "access_token": "eyJ...",
    "token_type": "bearer"
}
```

### Using Token

```bash
curl -H "Authorization: Bearer eyJ..." \
     http://localhost:8000/api/notifications
```

### Main Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List Proxmox servers |
| GET | `/api/servers/{id}` | Get specific server |
| POST | `/api/servers` | Add new server |
| PUT | `/api/servers/{id}` | Update server |
| DELETE | `/api/servers/{id}` | Delete server |
| POST | `/api/servers/{id}/test` | Test server connection |
| GET | `/api/servers/{id}/resources` | VMs and containers on server |
| POST | `/api/servers/{id}/vm/{vmid}/{action}` | Control VM (start/stop/restart) |
| POST | `/api/servers/{id}/container/{vmid}/{action}` | Control Container (start/stop/restart) |
| GET | `/api/servers/{id}/vm/{vmid}/status` | Get VM status |
| GET | `/api/servers/{id}/container/{vmid}/status` | Get Container status |
| GET | `/ipam/api/networks` | List IPAM networks |
| POST | `/ipam/api/networks` | Create IPAM network |
| GET | `/ipam/api/allocations` | List IP allocations |
| POST | `/ipam/api/allocations` | Create IP allocation |
| GET | `/templates/api/groups` | List template groups |
| GET | `/templates/api/templates` | List OS templates |
| POST | `/templates/api/templates` | Create OS template |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/{id}/read` | Mark notification as read |
| DELETE | `/api/notifications/{id}` | Delete notification |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users` | Create user (admin only) |
| GET | `/settings/api/panel` | Get panel settings |
| PUT | `/settings/api/panel` | Update panel settings |
| GET | `/logs/api/logs` | Get audit logs |
| GET | `/logs/api/stats` | Get log statistics |
| GET | `/api/backups/storages/{server_id}` | List Proxmox storages |
| POST | `/api/backups/create` | Create VM/LXC backup |
| POST | `/api/backups/restore` | Restore VM/LXC from backup |
| GET | `/api/backups/list/{server_id}` | List backup files |
| DELETE | `/api/backups/{server_id}/backup` | Delete backup file |
| GET | `/api/backups/jobs` | List scheduled backup jobs |
| POST | `/api/backups/jobs` | Create scheduled backup job |
| GET | `/api/{server_id}/ha/status` | HA status for all VMs |
| POST | `/api/{server_id}/ha/{vm_type}/{vmid}/add` | Add VM to HA group |
| DELETE | `/api/{server_id}/ha/{vm_type}/{vmid}/remove` | Remove VM from HA |
| POST | `/api/sync-vms` | Force VM sync from Proxmox |
| GET | `/api/servers/{id}/nodes` | List nodes for a server |
| PUT | `/api/servers/{id}/sdn/zones/{zone}` | Update SDN zone |
| PUT | `/api/servers/{id}/sdn/vnets/{vnet}` | Update SDN VNet |
| DELETE | `/api/servers/{id}/sdn/vnets/{vnet}/subnets/{cidr}` | Delete SDN subnet |

### Swagger Documentation

Available at: `http://localhost:8000/docs`

---

## �️ Workspaces

Workspaces are named groups of Proxmox servers with scoped user access. They allow administrators to partition the infrastructure and grant users access to only their servers.

### Key Concepts

| Concept | Description |
|---|---|
| **Workspace** | Named group with optional color and description |
| **Default Workspace** | Created automatically; all servers belong to it by default |
| **Server assignment** | One server can belong to multiple workspaces |
| **User assignment** | Users see only workspaces they are assigned to |

### Managing Workspaces (Admin)

1. Open **Settings → Workspaces** (sidebar menu item) or navigate to `/workspaces`
2. Click **New Workspace** to create a workspace
3. Assign servers from the **Servers** tab inside the workspace detail
4. Assign users from the **Users** tab

### Switching Workspaces (Sidebar)

- The active workspace is shown in the sidebar below the logo
- Click the workspace name to open the switcher
- Select a workspace — all VM/server lists are immediately filtered
- Select **All Workspaces** (admin only) to remove the filter

### API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/workspaces` | List workspaces (filtered for non-admins) |
| `POST` | `/api/workspaces` | Create workspace (admin) |
| `GET` | `/api/workspaces/{id}` | Get workspace detail with servers/users |
| `PUT` | `/api/workspaces/{id}` | Update workspace (admin) |
| `DELETE` | `/api/workspaces/{id}` | Delete workspace (admin) |
| `POST` | `/api/workspaces/{id}/servers` | Add server to workspace |
| `DELETE` | `/api/workspaces/{id}/servers/{server_id}` | Remove server from workspace |
| `POST` | `/api/workspaces/{id}/users` | Add user to workspace |
| `DELETE` | `/api/workspaces/{id}/users/{user_id}` | Remove user from workspace |

Pass the `X-Active-Workspace: {id}` header in API requests to filter responses by workspace.

---

## 👤 User → Server Assignment

Server assignment allows admins to directly link specific Proxmox servers to individual users. In combination with Workspaces it gives fine-grained control: a user only sees servers that are **both** in their workspace **and** explicitly assigned to them.

### How it works

1. User belongs to one or more **Workspaces**
2. Admin assigns specific **servers** to the user (from servers that share at least one workspace with the user)
3. The user sees only the intersection: workspace-servers ∩ assigned-servers

### Managing assignments (UI)

1. Open **Users** page
2. Click **Edit** for a user
3. In the **Servers** tab — check/uncheck servers; incompatible servers (different workspace) are highlighted
4. Save — assignments are applied immediately

### REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users/{id}/servers` | Assigned servers for a user |
| `GET` | `/api/users/{id}/server-assignments` | All servers with `assigned` and `compatible` flags |
| `PUT` | `/api/users/{id}/servers` | Set servers (replaces current list); body: `{"server_ids": [1,2]}` |

Returns `409 workspace_conflict` if any server shares no workspace with the user.

---

## 🖥️ VM / LXC Ownership

Any VM or LXC container can have an **owner** — a regular user responsible for that instance. The owner is displayed in the VM list.

### Isolation

Ownership is enforced everywhere a non-privileged user sees instances, not just the instance list. The live-resource endpoints — `/api/resources/all` (dashboard) and `/api/{server_id}/resources` (node/server page) — filter VMs/LXC by owner (matching each `vmid` against the `vm_instances` cache), so a user with only `proxmox.view` cannot see other owners' instances through the node page. **Admins** and roles with **`vm:manage`** are exempt and see everything.

**Owner is set automatically on create** (`vm_create`/`ct_create`), including when an admin creates an instance on behalf of another user — the deploy flow injects that owner's SSH key (merged with any pasted/library keys) rather than the creator's.

Instances synced from Proxmox before ownership existed, or created before the fix above, have `owner_id = NULL`. A one-time migration backfills these automatically from `deploy_tasks` and `audit_logs` (`vm_create`/`ct_create`/`lxc_create` entries), but only when every applicable piece of evidence names the same existing user — ambiguous cases (e.g. a reused VMID) are deliberately left ownerless. To assign an owner to whatever is left, run the helper script shipped in the backend image:

```bash
docker compose exec app python assign_instances_owner.py
```

### Assigning an owner (Admin)

Open the VM detail page → **Owner** button → select user → Save.

### REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/{server_id}/vm/{vmid}/owner` | Current owner + list of users |
| `PUT` | `/api/{server_id}/vm/{vmid}/owner` | Set or clear owner (`{"user_id": null}` to clear) |

---

## 🎯 Quotas

Per-user resource quotas cap how much a user can provision. Four metrics are limited, each summed across the user's **non-deleted, non-template** instances:

| Metric | Unit | Quota field |
|---|---|---|
| Instances | count | `max_instances` |
| vCPU | cores | `max_cores` |
| RAM | MB | `max_memory_mb` |
| Disk | GB | `max_disk_gb` |

- **Unlimited by default** — a user with no quota row, or any metric left blank (`NULL`), is unrestricted for that metric. Admins and unconfigured users are never blocked.
- **Enforcement** — deploying a VM/LXC that would push any metric over its limit is rejected with **HTTP 429** and a bilingual message (`Превышена квота … / Quota exceeded …`) showing the projected value vs. the limit.
- **Usage source** — current usage is computed from the `vm_instances` cache (`owner_id`), where RAM is stored in MB and disk in GB (no conversion needed).

### Two levels of client-side blocking

The backend's 429 is the only real enforcement, but the UI now warns before a user reaches it, using the same `exhaustedMetrics()` logic (`features/instances/quota.ts`) in both places so the two can't disagree:

- **No headroom at all** (used ≥ limit on any metric) — the **Create Instance** entry point itself is disabled, with a tooltip naming exactly which limits are full. No configuration would fit, so the wizard does not open.
- **Headroom left, but the chosen configuration would exceed it** — the wizard opens normally; from the configuration step onward, the metric that would be exceeded is named and **Next**/**Deploy** are disabled until the request is reduced.

Neither block applies to **admins** — their own quota says nothing about an instance they're creating on behalf of someone else, and the figures shown to them are informational only.

### Managing quotas (Admin)

**Users** page → quota dialog. Live usage bars show current consumption against each limit. Leave a field empty for *unlimited*. Requires the `quota:manage` permission (`quota:view` to read).

### Self-service

Each user sees their own limits and current usage on the **Profile** page. The **Create Instance** wizard shows the remaining quota as a hint on the configuration step.

### REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users/{id}/quota` | A user's limits + current usage (requires `quota:view`) |
| `PUT` | `/api/users/{id}/quota` | Set a user's limits; `null` per metric = unlimited (requires `quota:manage`) |
| `GET` | `/api/quota` | Current user's own limits + usage (self-service) |

---

## 🔧 Troubleshooting

### Startup Issues

#### Container won't start

```bash
# Check logs
docker compose logs app

# Check status
docker compose ps
```

#### Database connection error

```bash
# Check if DB is running
docker compose logs db

# Restart
docker compose restart db
docker compose restart app
```

### Proxmox Issues

#### "Connection refused"

- Check server IP address
- Check that port 8006 is open
- Check firewall on Proxmox

#### "Authentication failed"

- Check login/password
- Use format `user@pam` or `user@pve`
- Try creating API Token

### Notification Issues

#### Email not sending

1. Check SMTP settings in `backend/.env`
2. For port 465 SSL is required
3. For port 587 STARTTLS is required
4. Check "App Password" for Yandex/Gmail

```bash
# Check variables in container
docker compose exec app env | grep SMTP
```

#### Telegram not working

1. Check bot token
2. Send `/start` to bot
3. Check Chat ID
4. Make sure bot is not blocked

#### "Test" button freezes

- Check logs: `docker compose logs app --tail 50`
- SMTP server may be unreachable
- Timeout is 10 seconds

### VNC / Terminal Issues

#### "VNC connection failed" (QEMU)

- Check that the VM is running
- Ensure VNC is enabled in the Proxmox node settings
- Try restarting the VM
- Verify the Proxmox API user has `VM.Console` privilege

#### "Connection closed" immediately on VNC open

- This was a known bug fixed in v1.3.0 (noVNC received a pre-opened WebSocket instead of URL)
- Upgrade to v1.3.0 or later

#### Terminal not connecting (LXC)

- Check that the container is **running** (not stopped or paused)
- Verify the Proxmox API user has `VM.Console` privilege on the node
- Check logs: `docker compose logs app --tail 50`

### Command Issues

#### "Guest Agent not running"

```bash
# In VM run:
systemctl status qemu-guest-agent
systemctl start qemu-guest-agent
```

#### Command hangs

- Timeout is 30 seconds
- Don't use interactive commands
- Check that VM responds

### Performance Issues

#### High memory usage

```bash
# Restart containers
docker compose restart

# Clean logs
docker system prune -f
```

#### Slow page loading

- Increase refresh interval in settings
- Check network to Proxmox server

### Account Issues

#### Admin forgot password

If the admin forgot their password, you can reset it using the command line:

**Option 1: Reset to default password**

```bash
# Run inside the app container
docker compose exec app python -c "
from app.db import get_db
from app.models import User
from app.auth import get_password_hash

db = next(get_db())
admin = db.query(User).filter(User.username == 'admin').first()
if admin:
    admin.hashed_password = get_password_hash('admin123')
    db.commit()
    print('Admin password reset to: admin123')
else:
    print('Admin user not found')
db.close()
"
```

**Option 2: Set a custom password**

```bash
# Replace YOUR_NEW_PASSWORD with your desired password
docker compose exec app python -c "
from app.db import get_db
from app.models import User
from app.auth import get_password_hash

db = next(get_db())
admin = db.query(User).filter(User.username == 'admin').first()
if admin:
    admin.hashed_password = get_password_hash('YOUR_NEW_PASSWORD')
    db.commit()
    print('Admin password has been reset')
else:
    print('Admin user not found')
db.close()
"
```

**Option 3: Reset any user's password**

```bash
# Replace USERNAME with the target username
docker compose exec app python -c "
from app.db import get_db
from app.models import User
from app.auth import get_password_hash

db = next(get_db())
user = db.query(User).filter(User.username == 'USERNAME').first()
if user:
    user.hashed_password = get_password_hash('newpassword123')
    db.commit()
    print('Password reset for user: USERNAME')
else:
    print('User not found')
db.close()
"
```

> ⚠️ **Security note:** After resetting the password, log in immediately and change it to a secure password through the web interface.

---

## ❓ FAQ

### General Questions

**Q: Can I use without Proxmox?**
A: No, the panel is specifically designed for Proxmox management.

**Q: How many servers can I add?**
A: Unlimited.

**Q: Is Proxmox cluster supported?**
A: Yes, add any cluster node.

### Security

**Q: Are passwords stored in plain text?**
A: No, bcrypt hashing is used.

**Q: How to change SECRET_KEY?**
A: Change in `.env` and restart. All sessions will be invalidated.

### Notifications

**Q: Why emails are not arriving?**
A: Check SMTP settings, especially port and TLS.

**Q: Can I disable notifications?**
A: Yes, in notification settings.

**Q: How to set quiet hours?**
A: In notification settings specify period (e.g., 23:00 - 07:00).

### Integrations

**Q: Is there an API for integration?**
A: Yes, REST API with documentation at `/docs`.

**Q: Can I add webhooks?**
A: Not yet, but planned for future versions.

---

## 📞 Support

- **GitHub Issues**: [Create issue](https://github.com/your-repo/server-panel/issues)
- **Documentation**: This file (WIKI.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)

---

*Last updated: July 24, 2026*
*Version: 1.13.0*
