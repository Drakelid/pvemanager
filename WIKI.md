# 📖 PVEmanager - Documentation

> Complete guide for installation, configuration and usage of PVEmanager v1.1.0

---

## 📑 Table of Contents

1. [Quick Start](#-quick-start)
2. [Installation and Deployment](#-installation-and-deployment)
3. [Main Features](#-main-features)
4. [Notification System](#-notification-system)
5. [VM and Container Management](#-vm-and-container-management)
6. [Bulk Operations](#-bulk-operations)
7. [OS Templates](#-os-templates)
8. [Proxmox Clusters](#-proxmox-clusters)
9. [Snapshots](#-snapshots)
10. [Backups](#-backups)
11. [IPAM](#-ipam)
12. [Remote Command Execution](#-remote-command-execution)
13. [Monitoring](#-monitoring)
14. [Security (RBAC v2)](#-security)
15. [Localization](#-localization)
16. [Settings](#-settings)
17. [API Reference](#-api-reference)
18. [Deployment Guide](#-deployment-guide)
19. [Private Repo Updates](#-private-repo-updates)
20. [Troubleshooting](#-troubleshooting)
21. [FAQ](#-faq)

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
open http://localhost:8000
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
- Port: 8000
- Without NGINX
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
- `POST /api/servers` — add server
- `PUT /api/servers/{id}` — update server
- `DELETE /api/servers/{id}` — delete server
- `POST /api/servers/{id}/test` — test connection

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

### Misc

- `POST /api/sync-vms` — force immediate VM sync from all Proxmox servers



### Dashboard

- Overall server statistics
- VM/LXC container count
- Resource usage graphs
- Quick access to recent events

### Proxmox Servers

- Add multiple servers
- API Token or password authentication
- Automatic API token creation
- Server status monitoring

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

### Monitoring

- Real-time CPU, RAM, Disk, Network metrics
- Historical graphs (hour, day, week, month)
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

### VM Actions

| Action | Description | Hotkey |
|--------|-------------|--------|
| Start | Start VM | - |
| Stop | Stop (ACPI shutdown) | - |
| Restart | Reboot | - |
| Force Stop | Force stop | - |
| Delete | Delete VM | - |

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

### VNC Console

1. Open VM details
2. Click **Console** button
3. Console opens in new tab
4. Fullscreen mode supported

### Configuration Changes

```
CPU: 1-32 cores
RAM: 512MB - 128GB
Disk: Increase size (decrease not possible)
```

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

### Task Queue

When you initiate a bulk operation:

1. **Task is created** and added to the queue
2. **Background processing** starts automatically
3. **Progress is tracked** (completed/failed items)
4. **Results are saved** for each item

### Viewing Task Status

Currently, tasks can be viewed via API:

```bash
# Get your recent tasks
curl -X GET "http://localhost:8000/api/tasks" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

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

## 🔗 Proxmox Clusters

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
- **Disk**: Used/Total + I/O
- **Network**: In/Out traffic

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

The new RBAC v2 system uses atomic permissions with `resource:action` format.

#### Permission Format

```
resource:action[:scope]
```

Examples:
- `vm:view` — View virtual machines
- `server:create` — Add new Proxmox servers
- `log:export` — Export audit logs
- `role:manage` — Full role management

#### Available Resources

| Resource | Description |
|----------|-------------|
| `dashboard` | Dashboard access |
| `server` | Proxmox servers |
| `vm` | Virtual machines |
| `lxc` | LXC containers |
| `template` | OS templates |
| `storage` | Storage pools |
| `backup` | Backups |
| `ipam` | IP address management |
| `user` | User management |
| `role` | Role management |
| `log` | Audit logs |
| `setting` | Panel settings |
| `notification` | Notifications |

#### Available Actions

| Action | Description |
|--------|-------------|
| `view` | Read access |
| `create` | Create new resources |
| `update` | Modify existing resources |
| `delete` | Remove resources |
| `start` | Start VM/container |
| `stop` | Stop VM/container |
| `restart` | Restart VM/container |
| `console` | Access console |
| `migrate` | Migrate between nodes |
| `manage` | Full management (implies view, update, etc.) |
| `export` | Export data (logs) |
| `execute` | Execute commands |

#### Default Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to all features |
| `moderator` | VM management, view logs, no settings |
| `user` | VPS-style access — only own instances |
| `demo` | Read-only access |

### VPS-Style User Isolation

Users with `user` role have VPS-style access — they can only see and manage instances assigned to them.

#### How It Works

1. **Instance Ownership**: Each VM/LXC can have an `owner_id` pointing to a user
2. **Automatic Assignment**: When a user creates a VM, they automatically become the owner
3. **Access Control**: All operations (view, start, stop, console, snapshots) check ownership

#### User Role Permissions

```
vms:view:own      — View only own instances
vms:start:own     — Start own instances
vms:stop:own      — Stop own instances
vms:restart:own   — Restart own instances
vms:console:own   — Access console of own instances
vms:snapshots:own — Manage snapshots of own instances
```

#### Admin Assignment

Admins can assign instances to users:
1. Open instance details
2. Click "Assign Owner"
3. Select user from dropdown
4. Save changes

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

# List VNets
GET /api/servers/{server_id}/sdn/vnets

# Create VNet
POST /api/servers/{server_id}/sdn/vnets
{
  "vnet": "vnet1",
  "zone": "myzone",
  "alias": "Production Network"
}

# Create subnet
POST /api/servers/{server_id}/sdn/vnets/{vnet}/subnets
{
  "subnet": "10.0.0.0/24",
  "gateway": "10.0.0.1",
  "snat": true
}

# Apply changes (required after modifications)
POST /api/servers/{server_id}/sdn/apply
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

## 🌍 Localization

### Supported Languages

- 🇷🇺 Russian
- 🇺🇸 English (default)
- 🇺🇿 Uzbek (partial)

### Switching Language

1. **Settings** → **Panel Settings**
2. Select language
3. Save
4. Page will reload

### Adding New Language

1. Open `backend/app/i18n.py`
2. Add translation for each key:

```python
"key_name": {
    "ru": "Russian text",
    "en": "English text",
    "uz": "O'zbek matni"  # New language
}
```

---

## ⚙️ Settings

### User Profile

- Full name
- Email (for notifications)
- Password change
- **SSH Public Key** — stored in user profile and automatically injected into VM/LXC during cloud-init deployment

### Panel Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| Refresh interval | Data refresh frequency | 30 sec |
| Log retention | How many days to keep logs | 30 days |
| Language | Interface language | English |

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

### Notification Settings

- In-App: Always enabled
- Email: Requires SMTP setup
- Telegram: Requires Bot Token

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

### Swagger Documentation

Available at: `http://localhost:8000/docs`

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

### VNC Issues

#### "VNC connection failed"

- Check that VM is running
- Check that VNC is enabled in Proxmox
- Try restarting VM

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

*Last updated: March 2026*
*Version: 1.1.0*
