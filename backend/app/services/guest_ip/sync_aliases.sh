#!/bin/sh
# Bring the set of extra IPv4 aliases of an interface to the requested one.
#
# Parameters arrive as environment variables (rendered by
# script_engine.render_params, values are never concatenated into commands):
#   IFACE     - guest interface, e.g. eth0
#   ADDRESSES - space separated CIDR list; empty string removes every alias
#   PVEM_ROOT - path prefix; always empty in a guest, set by tests only
#
# The script is idempotent: it synchronises state instead of appending.
# Only addresses listed in its own state file are managed, so anything
# configured inside the guest by hand stays untouched.
#
# Networking is deliberately NOT restarted: the address goes up via
# `ip addr add` right away, and the OS config is edited only so that the
# address survives a reboot. No `netplan apply` / `ifup` / `nmcli con up`:
# they would cut the connection to a running guest.

[ -n "$IFACE" ] || { echo "missing IFACE"; exit 2; }

ROOT="${PVEM_ROOT:-}"

STATE_DIR="$ROOT/var/lib/pvemanager"
STATE="$STATE_DIR/aliases.$IFACE"
mkdir -p "$STATE_DIR" 2>/dev/null || true

PREV=""
[ -f "$STATE" ] && PREV=$(cat "$STATE")

# 1. Remove addresses dropped from the list (ours only, per state file)
for old in $PREV; do
    keep=0
    for new in $ADDRESSES; do
        [ "$old" = "$new" ] && keep=1
    done
    [ "$keep" = "1" ] && continue
    ip addr del "$old" dev "$IFACE" 2>/dev/null || true
done

# 2. Bring up the missing ones
for a in $ADDRESSES; do
    addr=${a%%/*}
    if ip -4 addr show dev "$IFACE" 2>/dev/null | grep -qw "$addr"; then
        continue
    fi
    if ! ip addr add "$a" dev "$IFACE"; then
        echo "failed to add $a on $IFACE"
        exit 1
    fi
done

printf '%s\n' "$ADDRESSES" > "$STATE"

# 3. Persist in the OS config - the first recognised stack wins.
# Branches run in sequence rather than as elif: having a tool installed
# does not mean it manages this interface (NetworkManager inside an LXC
# is the usual case), and then control must fall through to the next one.
persist=none
MARKER="# managed by PVEmanager"

IFACES_FILE="$ROOT/etc/network/interfaces"
IFUP_DIR="$ROOT/etc/network/interfaces.d"
IFUP_FILE="$IFUP_DIR/pvemanager-aliases-$IFACE"
NETPLAN_DIR="$ROOT/etc/netplan"
NETPLAN_FILE="$NETPLAN_DIR/99-pvemanager-aliases.yaml"
SYSCONFIG_DIR="$ROOT/etc/sysconfig/network-scripts"

# --- ifupdown (Debian/Ubuntu) ---
if [ "$persist" = none ] && [ -d "$IFUP_DIR" ] && [ -f "$IFACES_FILE" ] && \
   command -v ifup >/dev/null 2>&1; then
    # Proxmox LXC templates create interfaces.d but never source it from
    # /etc/network/interfaces, so files there are ignored; add the source
    # line (idempotently). The interfaces file itself is left alone:
    # Proxmox rewrites it whenever the NIC is edited.
    if ! grep -qE '^[[:space:]]*(source|source-directory)' "$IFACES_FILE"; then
        echo "source /etc/network/interfaces.d/*" >> "$IFACES_FILE"
    fi
    if [ -z "$ADDRESSES" ]; then
        rm -f "$IFUP_FILE"
    else
        {
            echo "$MARKER - do not edit by hand"
            n=0
            for a in $ADDRESSES; do
                n=$((n + 1))
                echo "auto $IFACE:$n"
                echo "iface $IFACE:$n inet static"
                echo "    address $a"
            done
        } > "$IFUP_FILE"
    fi
    persist=ifupdown
fi

# --- netplan (Ubuntu cloud images) ---
if [ "$persist" = none ] && [ -d "$NETPLAN_DIR" ]; then
    if [ -z "$ADDRESSES" ]; then
        rm -f "$NETPLAN_FILE"
    else
        {
            echo "$MARKER - do not edit by hand"
            echo "network:"
            echo "  version: 2"
            echo "  ethernets:"
            echo "    $IFACE:"
            echo "      addresses:"
            for a in $ADDRESSES; do
                echo "        - $a"
            done
        } > "$NETPLAN_FILE"
        chmod 600 "$NETPLAN_FILE" 2>/dev/null || true
    fi
    persist=netplan
fi

# --- NetworkManager (RHEL-based VMs, modern desktop images) ---
if [ "$persist" = none ] && command -v nmcli >/dev/null 2>&1; then
    # Empty answer means NM does not manage the interface - fall through.
    CON=$(nmcli -g GENERAL.CONNECTION device show "$IFACE" 2>/dev/null)
    if [ -n "$CON" ]; then
        for old in $PREV; do
            nmcli con mod "$CON" -ipv4.addresses "$old" >/dev/null 2>&1 || true
        done
        for a in $ADDRESSES; do
            nmcli con mod "$CON" +ipv4.addresses "$a" >/dev/null 2>&1 || true
        done
        persist=nm
    fi
fi

# --- sysconfig / network-scripts (RHEL, CentOS, Rocky, Alma) ---
# Proxmox configures LXC templates of these distros exactly this way
# (pve-container, Redhat.pm), and NetworkManager is usually absent there.
if [ "$persist" = none ] && [ -d "$SYSCONFIG_DIR" ]; then
    # Drop our previous ifcfg aliases; files without the marker stay.
    for f in "$SYSCONFIG_DIR/ifcfg-$IFACE":*; do
        [ -f "$f" ] || continue
        if head -n 1 "$f" 2>/dev/null | grep -q "$MARKER"; then
            rm -f "$f"
        fi
    done

    n=0
    for a in $ADDRESSES; do
        n=$((n + 1))
        addr=${a%%/*}
        plen=${a##*/}
        {
            echo "$MARKER - do not edit by hand"
            echo "DEVICE=$IFACE:$n"
            echo "NAME=$IFACE:$n"
            echo "ONPARENT=yes"
            echo "ONBOOT=yes"
            echo "BOOTPROTO=none"
            echo "IPADDR=$addr"
            echo "PREFIX=$plen"
        } > "$SYSCONFIG_DIR/ifcfg-$IFACE:$n"
    done
    persist=sysconfig
fi

# --- systemd unit: survives Proxmox rewriting the guest network config ---
# Proxmox regenerates the guest network configuration on every container
# start (pve-container writes /etc/network/interfaces, ifcfg or the NM
# keyfile from netN), which wipes any alias we added to the native stack.
# A tiny oneshot unit re-adds the addresses from the state file after boot,
# and /etc/systemd is not touched by Proxmox.
HELPER=$ROOT/usr/local/sbin/pvemanager-aliases
UNIT=$ROOT/etc/systemd/system/pvemanager-aliases.service

if command -v systemctl >/dev/null 2>&1 && [ -d "$ROOT/etc/systemd/system" ]; then
    # Is there anything left to restore on any interface at all
    remaining=$(cat "$STATE_DIR"/aliases.* 2>/dev/null | tr -d '[:space:]')

    if [ -z "$remaining" ]; then
        systemctl disable pvemanager-aliases.service >/dev/null 2>&1 || true
        rm -f "$UNIT" "$HELPER"
        systemctl daemon-reload >/dev/null 2>&1 || true
    else
        mkdir -p "$ROOT/usr/local/sbin" 2>/dev/null || true
        cat > "$HELPER" <<'HELPER_EOF'
#!/bin/sh
# managed by PVEmanager - do not edit by hand
# Re-add the alias addresses recorded by PVEmanager for every interface.
for state in /var/lib/pvemanager/aliases.*; do
    [ -f "$state" ] || continue
    iface=${state##*/aliases.}
    for cidr in $(cat "$state"); do
        addr=${cidr%%/*}
        ip -4 addr show dev "$iface" 2>/dev/null | grep -qw "$addr" && continue
        ip addr add "$cidr" dev "$iface" 2>/dev/null || true
    done
done
HELPER_EOF
        chmod 755 "$HELPER"

        cat > "$UNIT" <<'UNIT_EOF'
# managed by PVEmanager - do not edit by hand
[Unit]
Description=PVEmanager extra IP addresses
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/pvemanager-aliases

[Install]
WantedBy=multi-user.target
UNIT_EOF
        systemctl daemon-reload >/dev/null 2>&1 || true
        systemctl enable pvemanager-aliases.service >/dev/null 2>&1 || true
        persist="${persist}+systemd"
        [ "$persist" = "none+systemd" ] && persist=systemd
    fi
fi

echo "PVEMANAGER_PERSIST=$persist"
echo "PVEMANAGER_OK=1"
