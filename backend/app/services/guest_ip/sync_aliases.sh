#!/bin/sh
# Привести набор дополнительных IPv4-адресов (alias) интерфейса к заданному.
#
# Параметры приходят переменными окружения (их подставляет
# script_engine.render_params, значения не конкатенируются в команды):
#   IFACE     — интерфейс гостя, напр. eth0
#   ADDRESSES — список CIDR через пробел; пустая строка = снять все алиасы
#   PVEM_ROOT — префикс путей; в госте всегда пуст, задаётся только тестами
#
# Скрипт идемпотентен: он синхронизирует состояние, а не «добавляет».
# Под управлением находятся только адреса из своего state-файла — адреса,
# настроенные в госте вручную, не трогаются.
#
# Сеть намеренно НЕ перезапускается: адрес поднимается через `ip addr add`
# здесь и сейчас, а конфиг ОС правится только ради переживания ребута.
# Никаких `netplan apply` / `ifup` / `nmcli con up` — они рвут связь с
# работающим гостем.

[ -n "$IFACE" ] || { echo "missing IFACE"; exit 2; }

ROOT="${PVEM_ROOT:-}"

STATE_DIR="$ROOT/var/lib/pvemanager"
STATE="$STATE_DIR/aliases.$IFACE"
mkdir -p "$STATE_DIR" 2>/dev/null || true

PREV=""
[ -f "$STATE" ] && PREV=$(cat "$STATE")

# 1. Снять адреса, ушедшие из списка (только наши, из state-файла)
for old in $PREV; do
    keep=0
    for new in $ADDRESSES; do
        [ "$old" = "$new" ] && keep=1
    done
    [ "$keep" = "1" ] && continue
    ip addr del "$old" dev "$IFACE" 2>/dev/null || true
done

# 2. Поднять недостающие
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

# 3. Закрепить в конфиге ОС — первый распознанный стек выигрывает.
# Ветки идут последовательно, а не через elif: наличие инструмента ещё не
# значит, что он управляет этим интерфейсом (типичный случай — NetworkManager
# в LXC), и тогда управление должно уходить дальше по списку.
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
    # Шаблоны LXC от Proxmox создают interfaces.d, но не подключают его из
    # /etc/network/interfaces — без source-строки файлы оттуда не читаются,
    # поэтому добавляем её (идемпотентно). Список интерфейсов не трогаем:
    # его перезаписывает Proxmox при правке NIC.
    if ! grep -qE '^[[:space:]]*(source|source-directory)' "$IFACES_FILE"; then
        echo "source /etc/network/interfaces.d/*" >> "$IFACES_FILE"
    fi
    if [ -z "$ADDRESSES" ]; then
        rm -f "$IFUP_FILE"
    else
        {
            echo "$MARKER — не редактировать вручную"
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

# --- netplan (Ubuntu cloud-образы) ---
if [ "$persist" = none ] && [ -d "$NETPLAN_DIR" ]; then
    if [ -z "$ADDRESSES" ]; then
        rm -f "$NETPLAN_FILE"
    else
        {
            echo "$MARKER — не редактировать вручную"
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

# --- NetworkManager (RHEL-based VM, современные десктопные образы) ---
if [ "$persist" = none ] && command -v nmcli >/dev/null 2>&1; then
    # Пустой ответ = интерфейсом NM не управляет; тогда идём дальше.
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
# Шаблоны LXC этих дистрибутивов Proxmox настраивает именно так
# (pve-container, модуль Redhat.pm), а NetworkManager в них обычно не стоит.
if [ "$persist" = none ] && [ -d "$SYSCONFIG_DIR" ]; then
    # Сносим прежние свои ifcfg-алиасы; чужие файлы без маркера не трогаем.
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
            echo "$MARKER — не редактировать вручную"
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

echo "PVEMANAGER_PERSIST=$persist"
echo "PVEMANAGER_OK=1"
