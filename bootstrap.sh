#!/bin/bash
#
# PVEmanager one-command installer.
#
#   curl -fsSL https://get.<domain>/ | bash
#   bash bootstrap.sh
#
# On a regular Debian/Ubuntu host: clones the repo and hands off to deploy.sh.
# On a Proxmox VE host: creates a Debian 12 LXC, installs the panel inside it,
# and registers this PVE host as the panel's first node using a locally
# created API token — no password ever leaves the host.
#
# Configuration (all optional, via env vars):
#   PVEMANAGER_REPO      Git URL to clone           (default: official GitHub repo)
#   PVEMANAGER_VERSION   Git ref/tag to check out    (default: latest tag, else main)
#   PVEMANAGER_DIR       Install directory           (default: /opt/pvemanager)
#
# LXC-only (Proxmox host):
#   PVEMANAGER_LXC_VMID             (default: next free VMID)
#   PVEMANAGER_LXC_HOSTNAME         (default: pvemanager)
#   PVEMANAGER_LXC_STORAGE          rootfs storage             (default: local-lvm)
#   PVEMANAGER_LXC_TEMPLATE_STORAGE storage for the CT template (default: local)
#   PVEMANAGER_LXC_BRIDGE           (default: vmbr0)
#   PVEMANAGER_LXC_CORES            (default: 2)
#   PVEMANAGER_LXC_MEMORY           MB (default: 2048)
#   PVEMANAGER_LXC_SWAP             MB (default: 512)
#   PVEMANAGER_LXC_DISK             GB (default: 16)
#   PVEMANAGER_LXC_UNPRIVILEGED     0 or 1 (default: 1)

set -euo pipefail

log()  { echo -e "\033[0;34m[bootstrap]\033[0m $*"; }
ok()   { echo -e "\033[0;32m[bootstrap]\033[0m $*"; }
err()  { echo -e "\033[0;31m[bootstrap]\033[0m $*" >&2; }

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        err "This installer must be run as root."
        exit 1
    fi
}

# Prefer the latest git tag so an in-flight commit doesn't reach everyone
# installing at that exact moment; fall back to main if no tags exist yet.
resolve_ref() {
    if [ -n "${PVEMANAGER_VERSION:-}" ]; then
        echo "$PVEMANAGER_VERSION"
        return
    fi
    local latest
    latest=$(git ls-remote --tags --sort='-v:refname' "$REPO" 2>/dev/null \
        | head -1 | sed 's#.*refs/tags/##; s/\^{}$//') || true
    echo "${latest:-main}"
}

ensure_host_tools() {
    command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 && return
    log "Installing git/curl..."
    # On a PVE host without a paid subscription, apt's enterprise repo answers
    # 401 and fails the whole update under `set -e` even though every other
    # source succeeded; `apt-get install` right after still fails loudly if
    # the package genuinely couldn't be found.
    apt-get update -y || true
    apt-get install -y --no-install-recommends git curl ca-certificates
}

# ---------------------------------------------------------------------------
# Branch A: plain Debian/Ubuntu host (also runs *inside* the LXC from Branch B)
# ---------------------------------------------------------------------------
install_branch_a() {
    log "Plan: install Docker (if missing), clone ${REPO} @ ${REF} into ${DIR}, run deploy.sh --standalone."

    log "Installing base dependencies..."
    apt-get update -y || true
    apt-get install -y --no-install-recommends git curl ca-certificates openssl jq

    if [ ! -d "$DIR/.git" ]; then
        log "Cloning ${REPO} (${REF}) into ${DIR}..."
        git clone --branch "$REF" --depth 1 "$REPO" "$DIR"
    else
        log "${DIR} already exists — updating to ${REF}..."
        git -C "$DIR" fetch --depth 1 origin "$REF"
        git -C "$DIR" checkout -q "$REF" 2>/dev/null || git -C "$DIR" checkout -q "origin/$REF"
        git -C "$DIR" reset --hard -q "origin/$REF" 2>/dev/null || true
    fi

    # deploy.sh's own dependency check prompts interactively when Docker is
    # missing; installing it here up front means that check always passes
    # and deploy.sh never has to ask anything.
    if ! command -v docker >/dev/null 2>&1; then
        log "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
    fi
    systemctl enable --now docker >/dev/null 2>&1 || service docker start >/dev/null 2>&1 || true

    cd "$DIR"
    bash deploy.sh --standalone
}

# ---------------------------------------------------------------------------
# Branch B: running directly on a Proxmox VE host
# ---------------------------------------------------------------------------
next_free_vmid() {
    pvesh get /cluster/nextid --output-format json 2>/dev/null | tr -d '"' \
        || pvesh get /cluster/nextid 2>/dev/null | tr -d '"'
}

ensure_template() {
    local storage="$1" tmpl avail
    tmpl=$(pveam list "$storage" 2>/dev/null | awk '{print $1}' | grep 'debian-12-standard' | head -1)
    if [ -n "$tmpl" ]; then
        echo "$tmpl"
        return
    fi
    log "Downloading Debian 12 LXC template into '${storage}'..." >&2
    pveam update >/dev/null 2>&1 || true
    avail=$(pveam available --section system 2>/dev/null | awk '{print $2}' | grep 'debian-12-standard' | sort -V | tail -1)
    if [ -z "$avail" ]; then
        err "No debian-12-standard template found via 'pveam available'. Run 'pveam update' and retry."
        exit 1
    fi
    pveam download "$storage" "$avail" >&2
    echo "${storage}:vztmpl/${avail}"
}

pick_token_name() {
    local base="pvemanager" existing candidate i
    existing=$(pvesh get /access/users/root@pam/token --output-format json 2>/dev/null \
        | grep -oP '"tokenid":"\K[^"]+' || true)
    if ! grep -qx "$base" <<<"$existing"; then
        echo "$base"
        return
    fi
    for i in $(seq 2 50); do
        candidate="${base}-${i}"
        if ! grep -qx "$candidate" <<<"$existing"; then
            echo "$candidate"
            return
        fi
    done
    err "Could not find a free API token name for root@pam"
    exit 1
}

register_this_host() {
    local vmid="$1" ct_ip="$2" base="http://${2}:3001"
    local admin_password jwt host_ip host_name token_name token_secret resp

    admin_password=$(pct exec "$vmid" -- grep '^ADMIN_PASSWORD=' "${DIR}/backend/.env" 2>/dev/null | cut -d= -f2)
    admin_password="${admin_password:-admin123}"

    log "Logging into the freshly deployed panel..."
    jwt=$(curl -fsS -X POST "${base}/api/auth/login" \
            -H 'Content-Type: application/json' \
            -d "{\"username\":\"admin\",\"password\":\"${admin_password}\"}" 2>/dev/null \
        | grep -oP '"access_token":"\K[^"]+' || true)
    if [ -z "$jwt" ]; then
        err "Could not log into the panel to register this node automatically."
        err "Add it manually from the Nodes page once you've logged in."
        return 1
    fi

    host_ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
    [ -z "$host_ip" ] && host_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    host_name=$(hostname -f 2>/dev/null || hostname)

    token_name=$(pick_token_name)
    log "Creating API token '${token_name}' for root@pam on this host..."
    token_secret=$(pvesh create /access/users/root@pam/token/"${token_name}" \
            --privsep 0 --comment "Created by PVEmanager bootstrap" --output-format json 2>/dev/null \
        | grep -oP '"value":"\K[^"]+')
    if [ -z "$token_secret" ]; then
        err "Failed to create an API token on this host."
        return 1
    fi

    log "Registering this host (${host_name} / ${host_ip}) in the panel..."
    resp=$(curl -fsS -X POST "${base}/api/servers" \
        -H "Authorization: Bearer ${jwt}" \
        -H 'Content-Type: application/json' \
        -d "{\"name\":\"${host_name}\",\"hostname\":\"${host_name}\",\"ip_address\":\"${host_ip}\",\"port\":8006,\"api_user\":\"root@pam\",\"api_token_name\":\"${token_name}\",\"api_token_value\":\"${token_secret}\",\"use_password\":false,\"verify_ssl\":false}" \
        2>/dev/null || true)

    if grep -q '"id"' <<<"$resp"; then
        ok "Node registered in the panel."
    else
        err "Registration call did not return the expected response: ${resp}"
        err "The API token '${token_name}' was still created on this host — add the server manually if needed."
    fi
}

install_branch_b() {
    local vmid hostname storage tmpl_storage bridge cores memory swap disk unpriv template
    local tmp_clone ct_ip i admin_password

    vmid="${PVEMANAGER_LXC_VMID:-$(next_free_vmid)}"
    hostname="${PVEMANAGER_LXC_HOSTNAME:-pvemanager}"
    storage="${PVEMANAGER_LXC_STORAGE:-local-lvm}"
    tmpl_storage="${PVEMANAGER_LXC_TEMPLATE_STORAGE:-local}"
    bridge="${PVEMANAGER_LXC_BRIDGE:-vmbr0}"
    cores="${PVEMANAGER_LXC_CORES:-2}"
    memory="${PVEMANAGER_LXC_MEMORY:-2048}"
    swap="${PVEMANAGER_LXC_SWAP:-512}"
    disk="${PVEMANAGER_LXC_DISK:-16}"
    unpriv="${PVEMANAGER_LXC_UNPRIVILEGED:-1}"

    log "Plan: create LXC #${vmid} ('${hostname}') on '${storage}' (${cores} vCPU, ${memory}MB RAM, ${disk}GB disk,"
    log "  DHCP on ${bridge}), install PVEmanager inside it, and register this host as its first node."

    if pct status "$vmid" &>/dev/null; then
        err "Container #${vmid} already exists. Set PVEMANAGER_LXC_VMID to a free id, or remove it first."
        exit 1
    fi

    template=$(ensure_template "$tmpl_storage")

    tmp_clone=$(mktemp -d)
    trap 'rm -rf "$tmp_clone"' EXIT
    log "Fetching the installer from ${REPO} (${REF})..."
    git clone --branch "$REF" --depth 1 "$REPO" "$tmp_clone" >/dev/null 2>&1 \
        || { err "Could not clone ${REPO}"; exit 1; }

    log "Creating container #${vmid}..."
    pct create "$vmid" "$template" \
        --hostname "$hostname" \
        --cores "$cores" \
        --memory "$memory" \
        --swap "$swap" \
        --rootfs "${storage}:${disk}" \
        --net0 "name=eth0,bridge=${bridge},ip=dhcp" \
        --unprivileged "$unpriv" \
        --features "nesting=1,keyctl=1" \
        --onboot 1

    log "Starting container..."
    pct start "$vmid"

    log "Waiting for the container to get an IP address..."
    ct_ip=""
    for i in $(seq 1 30); do
        ct_ip=$(pct exec "$vmid" -- sh -c "ip -4 -o addr show eth0 2>/dev/null | awk '{print \$4}' | cut -d/ -f1" 2>/dev/null || true)
        [ -n "$ct_ip" ] && break
        sleep 2
    done
    if [ -z "$ct_ip" ]; then
        err "Container did not get an IP address from DHCP within 60s."
        exit 1
    fi
    ok "Container #${vmid} is up at ${ct_ip}"

    log "Installing PVEmanager inside the container (this takes a few minutes)..."
    pct push "$vmid" "${tmp_clone}/bootstrap.sh" /root/bootstrap.sh
    pct exec "$vmid" -- env \
        PVEMANAGER_REPO="$REPO" PVEMANAGER_VERSION="$REF" PVEMANAGER_DIR="$DIR" \
        bash /root/bootstrap.sh

    log "Waiting for the panel API to come up..."
    for i in $(seq 1 30); do
        curl -fsS "http://${ct_ip}:3001/health" >/dev/null 2>&1 && break
        sleep 2
    done
    if ! curl -fsS "http://${ct_ip}:3001/health" >/dev/null 2>&1; then
        err "Panel did not come up at http://${ct_ip}:3001 — check 'pct exec ${vmid} -- docker compose -f ${DIR}/compose.yml logs'."
        exit 1
    fi

    register_this_host "$vmid" "$ct_ip" || true

    admin_password=$(pct exec "$vmid" -- grep '^ADMIN_PASSWORD=' "${DIR}/backend/.env" 2>/dev/null | cut -d= -f2)

    echo ""
    echo "=========================================="
    ok "PVEmanager is up: http://${ct_ip}:3001"
    echo "=========================================="
    echo "   Login:    admin"
    echo "   Password: ${admin_password:-admin123}"
    echo ""
    echo "This host has been registered in the panel via a dedicated API token — no password was stored for it."
}

# ---------------------------------------------------------------------------

REPO="${PVEMANAGER_REPO:-https://github.com/markmorado/pvemanager.git}"
DIR="${PVEMANAGER_DIR:-/opt/pvemanager}"

require_root
ensure_host_tools
REF="$(resolve_ref)"

if [ -d /etc/pve ]; then
    log "Detected a Proxmox VE host."
    install_branch_b
else
    log "Detected a regular Debian/Ubuntu host."
    install_branch_a
fi
