#!/bin/bash
# PVEmanager — сборка собственного зеркала cloud-образов с предустановленным
# qemu-guest-agent (вариант A2).
#
# Что делает:
#   1) скачивает cloud-образы из curated-каталога (см. backend/app/catalog/builtin.py)
#   2) прогоняет каждый через virt-customize: ставит qemu-guest-agent, включает
#      сервис, снимает блокировку guest-exec (RHEL-семейство) и (опц.) обнуляет
#      machine-id
#   3) считает sha256 и пишет sha256sums.txt
#   4) генерирует mirrors.json — готовый список для добавления через
#      POST /api/images/mirrors (или ручного ввода в UI)
#
# Требования (машина для патчинга, НЕ обязательно нода PVE):
#   - Linux с apt/dnf/yum/pacman/zypper — недостающие пакеты (libguestfs, curl, jq,
#     а для arm64 — qemu-user-static) скрипт доставит сам (AUTO_INSTALL=1, по умолч.).
#     Отключить: AUTO_INSTALL=0. Не root — используется sudo.
#   - интернет: и для авто-установки, и потому что virt-customize --install тянет
#     пакет qemu-guest-agent из репозиториев дистрибутива
#   - для arm64 на amd64-хосте нужен qemu-user-static + binfmt (медленно; по умолч. выкл.)
#
# Пример:
#   BASE_URL="https://mirror.lan/pve-images" ./patch-cloud-images.sh
#   INCLUDE_ARM64=1 OUTDIR=/srv/images ./patch-cloud-images.sh
#   ONLY="rocky alma centos fedora" ./patch-cloud-images.sh   # только RHEL-семейство
#
# Установка: скопируйте файл на машину-патчер и запустите. Скрипт самодостаточен.

set -euo pipefail

# ── Настройки (можно переопределить через переменные окружения) ────────────────
OUTDIR="${OUTDIR:-./patched-images}"     # куда складывать готовые образы
INSTALL_PKG="${INSTALL_PKG:-qemu-guest-agent}"
INCLUDE_ARM64="${INCLUDE_ARM64:-0}"      # 1 — патчить и arm64 (нужен qemu-user-static)
RESET_MACHINE_ID="${RESET_MACHINE_ID:-1}" # 1 — обнулить /etc/machine-id (уникальный id у клонов)
UNBLOCK_RPC="${UNBLOCK_RPC:-1}"          # 1 — снять блокировку guest-exec/guest-file-* в qemu-ga
ONLY="${ONLY:-}"                         # фильтр образов по id/os, через пробел или запятую
                                         #   напр. ONLY="rocky alma centos fedora"
                                         #   пусто — собирать весь каталог
FORCE_DOWNLOAD="${FORCE_DOWNLOAD:-0}"    # 1 — перекачать образы даже если уже скачаны
AUTO_INSTALL="${AUTO_INSTALL:-1}"        # 1 — доустановить недостающие зависимости самому
BASE_URL="${BASE_URL:-}"                 # публичный префикс зеркала для url в mirrors.json
                                         #   напр. https://mirror.lan/pve-images
                                         #   пусто — в mirrors.json подставится REPLACE_ME

RAW_DIR="$OUTDIR/raw"                     # pristine-копии (чтобы не перекачивать при перепатче)

# ── Цвета/логи (в стиле pve) ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERR ]${NC}  $*" >&2; }
die()   { err "$*"; exit 1; }
step()  { echo -e "\n${BOLD}▶  $*${NC}"; }

# ── Каталог образов: id|os|version|name|arch|url ───────────────────────────────
# Синхронизировано с backend/app/catalog/builtin.py (_CLOUD_IMAGES).
IMAGES=(
  "ubuntu-22.04-cloud|ubuntu|22.04|Ubuntu 22.04 LTS (Jammy) Cloud + QGA|amd64|https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"
  "ubuntu-22.04-cloud|ubuntu|22.04|Ubuntu 22.04 LTS (Jammy) Cloud + QGA|arm64|https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-arm64.img"
  "ubuntu-24.04-cloud|ubuntu|24.04|Ubuntu 24.04 LTS (Noble) Cloud + QGA|amd64|https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
  "ubuntu-24.04-cloud|ubuntu|24.04|Ubuntu 24.04 LTS (Noble) Cloud + QGA|arm64|https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-arm64.img"
  "debian-11-cloud|debian|11|Debian 11 (Bullseye) GenericCloud + QGA|amd64|https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-amd64.qcow2"
  "debian-11-cloud|debian|11|Debian 11 (Bullseye) GenericCloud + QGA|arm64|https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-arm64.qcow2"
  "debian-12-cloud|debian|12|Debian 12 (Bookworm) GenericCloud + QGA|amd64|https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2"
  "debian-12-cloud|debian|12|Debian 12 (Bookworm) GenericCloud + QGA|arm64|https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-arm64.qcow2"
  "rocky-9-cloud|rocky|9|Rocky Linux 9 GenericCloud + QGA|amd64|https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2"
  "rocky-9-cloud|rocky|9|Rocky Linux 9 GenericCloud + QGA|arm64|https://download.rockylinux.org/pub/rocky/9/images/aarch64/Rocky-9-GenericCloud.latest.aarch64.qcow2"
  "alma-9-cloud|almalinux|9|AlmaLinux 9 GenericCloud + QGA|amd64|https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2"
  "alma-9-cloud|almalinux|9|AlmaLinux 9 GenericCloud + QGA|arm64|https://repo.almalinux.org/almalinux/9/cloud/aarch64/images/AlmaLinux-9-GenericCloud-latest.aarch64.qcow2"
  "alma-10-cloud|almalinux|10|AlmaLinux 10 GenericCloud + QGA|amd64|https://repo.almalinux.org/almalinux/10/cloud/x86_64/images/AlmaLinux-10-GenericCloud-latest.x86_64.qcow2"
  "alma-10-cloud|almalinux|10|AlmaLinux 10 GenericCloud + QGA|arm64|https://repo.almalinux.org/almalinux/10/cloud/aarch64/images/AlmaLinux-10-GenericCloud-latest.aarch64.qcow2"
  "centos-stream-9-cloud|centos|9-stream|CentOS Stream 9 GenericCloud + QGA|amd64|https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2"
  "centos-stream-9-cloud|centos|9-stream|CentOS Stream 9 GenericCloud + QGA|arm64|https://cloud.centos.org/centos/9-stream/aarch64/images/CentOS-Stream-GenericCloud-9-latest.aarch64.qcow2"
  "debian-13-cloud|debian|13|Debian 13 (Trixie) GenericCloud + QGA|amd64|https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2"
  "debian-13-cloud|debian|13|Debian 13 (Trixie) GenericCloud + QGA|arm64|https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-arm64.qcow2"
  "fedora-41-cloud|fedora|41|Fedora 41 Cloud + QGA|amd64|https://download.fedoraproject.org/pub/fedora/linux/releases/41/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-41-1.4.x86_64.qcow2"
  "fedora-41-cloud|fedora|41|Fedora 41 Cloud + QGA|arm64|https://download.fedoraproject.org/pub/fedora/linux/releases/41/Cloud/aarch64/images/Fedora-Cloud-Base-Generic-41-1.4.aarch64.qcow2"
  "ubuntu-26.04-cloud|ubuntu|26.04|Ubuntu 26.04 LTS (Resolute) Cloud + QGA|amd64|https://cloud-images.ubuntu.com/resolute/current/resolute-server-cloudimg-amd64.img"
  "ubuntu-26.04-cloud|ubuntu|26.04|Ubuntu 26.04 LTS (Resolute) Cloud + QGA|arm64|https://cloud-images.ubuntu.com/resolute/current/resolute-server-cloudimg-arm64.img"
)

# ── Определение пакетного менеджера и sudo ─────────────────────────────────────
detect_pm() {
  for pm in apt-get dnf yum pacman zypper; do
    command -v "$pm" >/dev/null 2>&1 && { echo "$pm"; return 0; }
  done
  return 1
}

# Имя пакета virt-customize для конкретного PM
guestfs_pkg() {
  case "$1" in
    apt-get) echo "libguestfs-tools" ;;
    dnf|yum) echo "guestfs-tools" ;;   # старые RHEL: libguestfs-tools-c
    pacman)  echo "libguestfs" ;;
    zypper)  echo "guestfs-tools" ;;
  esac
}

# Установить пакеты: pm_install <pm> <pkg...>
pm_install() {
  local pm="$1"; shift
  case "$pm" in
    apt-get) $SUDO apt-get update -qq && $SUDO apt-get install -y "$@" ;;
    dnf)     $SUDO dnf install -y "$@" ;;
    yum)     $SUDO yum install -y "$@" ;;
    pacman)  $SUDO pacman -Sy --noconfirm "$@" ;;
    zypper)  $SUDO zypper --non-interactive install "$@" ;;
  esac
}

# Подходит ли образ под фильтр ONLY (совпадение подстроки с id или os)
match_only() {
  local id="$1" os="$2" pat
  if [ -z "$ONLY" ]; then
    return 0
  fi
  for pat in $(echo "$ONLY" | tr ',' ' '); do
    case "$id" in *"$pat"*) return 0 ;; esac
    case "$os" in *"$pat"*) return 0 ;; esac
  done
  return 1
}

# ── Preflight ──────────────────────────────────────────────────────────────────
step "Проверка окружения"

# sudo, если не root
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo";
  else warn "Не root и нет sudo — авто-установка пакетов может не сработать."; fi
fi

# Собираем список недостающих пакетов и ставим одним махом
if [ "$AUTO_INSTALL" = "1" ]; then
  PM="$(detect_pm || true)"
  if [ -z "$PM" ]; then
    warn "Не распознал пакетный менеджер — пропускаю авто-установку."
  else
    declare -a NEED_PKGS=()
    command -v virt-customize >/dev/null 2>&1 || NEED_PKGS+=("$(guestfs_pkg "$PM")")
    command -v curl          >/dev/null 2>&1 || NEED_PKGS+=("curl")
    command -v jq            >/dev/null 2>&1 || NEED_PKGS+=("jq")
    if [ "$INCLUDE_ARM64" = "1" ] && [ "$(uname -m)" != "aarch64" ] \
       && [ ! -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
      NEED_PKGS+=("qemu-user-static")
    fi
    if [ "${#NEED_PKGS[@]}" -gt 0 ]; then
      info "Доустанавливаю через $PM: ${NEED_PKGS[*]}"
      if ! pm_install "$PM" "${NEED_PKGS[@]}"; then
        warn "Авто-установка завершилась с ошибкой — проверю зависимости вручную ниже."
      fi
    else
      ok "Все зависимости уже на месте."
    fi
  fi
fi

# Жёсткие проверки (после возможной авто-установки)
command -v virt-customize >/dev/null 2>&1 || die "virt-customize не найден. Установите пакет libguestfs-tools / guestfs-tools (или запустите с AUTO_INSTALL=1 под sudo)."
command -v curl          >/dev/null 2>&1 || die "curl не найден."
command -v sha256sum     >/dev/null 2>&1 || die "sha256sum не найден (обычно в coreutils)."
HAVE_JQ=1; command -v jq >/dev/null 2>&1 || { HAVE_JQ=0; warn "jq не найден — mirrors.json соберу без него (без экранирования спецсимволов в именах)."; }
ok "virt-customize: $(virt-customize --version 2>/dev/null | head -1)"

if [ "$INCLUDE_ARM64" = "1" ] && [ "$(uname -m)" != "aarch64" ] \
   && [ ! -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
  warn "INCLUDE_ARM64=1, но binfmt для aarch64 не зарегистрирован — патч arm64 может упасть."
  warn "Проверьте, что установлен qemu-user-static и зарегистрированы binfmt-обработчики."
fi

mkdir -p "$RAW_DIR"

# ── Снятие блокировки RPC у guest agent ───────────────────────────────────────
# Rocky / AlmaLinux / CentOS Stream / Fedora ставят qemu-guest-agent с
# урезанным набором RPC — в /etc/sysconfig/qemu-ga, откуда systemd-юнит берёт
# аргументы командной строки агента. Разметка файла менялась трижды:
#   FILTER_RPC_ARGS="--allow-rpcs=..." — актуальные пакеты (RHEL 9/10, Fedora):
#                                        allow-list, где guest-exec просто нет
#   BLOCK_RPCS=...                     — qemu-ga 8.1+, block-list
#   BLACKLIST_RPC=...                  — qemu-ga < 8.1, block-list
# Пустое значение любой из них = агент без ограничений, как в Debian/Ubuntu,
# где фильтра нет вовсе. Без этого панель не может выполнить скрипт в ВМ,
# навесить дополнительный IP и расширить ФС после ресайза диска: агент
# отвечает "The command guest-exec has been disabled for this instance".
# Закомментированные строки не трогаем, в Debian/Ubuntu файла нет вообще.
QGA_UNBLOCK_CMD='f=/etc/sysconfig/qemu-ga; if [ -f "$f" ]; then sed -i -e "s/^[[:space:]]*FILTER_RPC_ARGS=.*/FILTER_RPC_ARGS=/" -e "s/^[[:space:]]*BLACKLIST_RPC=.*/BLACKLIST_RPC=/" -e "s/^[[:space:]]*BLOCK_RPCS=.*/BLOCK_RPCS=/" "$f"; echo "qemu-ga RPC unblocked:" $(grep -E "^(FILTER_RPC_ARGS|BLACKLIST_RPC|BLOCK_RPCS)=" "$f"); else echo "qemu-ga: no /etc/sysconfig/qemu-ga, nothing to unblock"; fi'

# ── Обход каталога ─────────────────────────────────────────────────────────────
SUMS_FILE="$OUTDIR/sha256sums.txt"
: > "$SUMS_FILE"
declare -a MIRROR_ROWS=()   # строки для mirrors.json: os|version|arch|name|file|sha
FAILED=0; DONE=0; SKIPPED=0; FILTERED=0

for row in "${IMAGES[@]}"; do
  IFS='|' read -r id os version name arch url <<< "$row"

  if [ "$arch" = "arm64" ] && [ "$INCLUDE_ARM64" != "1" ]; then
    SKIPPED=$((SKIPPED+1)); continue
  fi

  if ! match_only "$id" "$os"; then
    FILTERED=$((FILTERED+1)); continue
  fi

  file="$(basename "$url")"
  raw="$RAW_DIR/$file"
  out="$OUTDIR/$file"

  step "$name  [$arch]"

  # 1) скачивание в raw/ (pristine)
  if [ ! -f "$raw" ] || [ "$FORCE_DOWNLOAD" = "1" ]; then
    info "Скачиваю: $url"
    if ! curl -fL --retry 3 --retry-delay 3 -o "$raw.part" "$url"; then
      err "Не удалось скачать $url — пропускаю."
      rm -f "$raw.part"; FAILED=$((FAILED+1)); continue
    fi
    mv -f "$raw.part" "$raw"
  else
    info "Уже скачан: $raw (FORCE_DOWNLOAD=1 чтобы перекачать)"
  fi

  # 2) свежая копия raw -> out (патч всегда на чистом образе, без двойной установки)
  cp -f "$raw" "$out"

  # 3) патч
  info "virt-customize: ставлю $INSTALL_PKG"
  VC_ARGS=(-a "$out" --install "$INSTALL_PKG"
           --run-command "systemctl enable ${INSTALL_PKG}.service")
  # if, а не `[ ... ] && ...`: при set -e ложное условие в конце AND-списка
  # завершает скрипт.
  if [ "$UNBLOCK_RPC" = "1" ]; then
    VC_ARGS+=(--run-command "$QGA_UNBLOCK_CMD")
  fi
  if [ "$RESET_MACHINE_ID" = "1" ]; then
    VC_ARGS+=(--run-command "truncate -s 0 /etc/machine-id")
  fi
  if ! LIBGUESTFS_BACKEND="${LIBGUESTFS_BACKEND:-direct}" virt-customize "${VC_ARGS[@]}"; then
    err "virt-customize не смог обработать $out — пропускаю."
    rm -f "$out"; FAILED=$((FAILED+1)); continue
  fi

  # 4) контрольная сумма
  sha="$(sha256sum "$out" | awk '{print $1}')"
  echo "$sha  $file" >> "$SUMS_FILE"
  MIRROR_ROWS+=("$os|$version|$arch|$name|$file|$sha")
  ok "Готово: $file  (sha256 ${sha:0:12}…)"
  DONE=$((DONE+1))
done

# ── mirrors.json ───────────────────────────────────────────────────────────────
step "Генерация mirrors.json"
MIRRORS_FILE="$OUTDIR/mirrors.json"
# Тот же set -e: с заданным BASE_URL ложное условие оборвало бы скрипт
# ровно перед генерацией mirrors.json.
url_prefix="${BASE_URL%/}"
if [ -z "$url_prefix" ]; then
  url_prefix="REPLACE_ME"
fi

{
  echo "["
  first=1
  for m in "${MIRROR_ROWS[@]}"; do
    IFS='|' read -r os version arch name file sha <<< "$m"
    [ $first -eq 1 ] && first=0 || echo ","
    if [ "$HAVE_JQ" = "1" ]; then
      jq -cn --arg name "$name" --arg os "$os" --arg version "$version" \
             --arg arch "$arch" --arg url "$url_prefix/$file" --arg sum "$sha" \
        '{name:$name, kind:"qcow2", os:$os, version:$version, arch:$arch,
          url:$url, checksum:$sum, checksum_algorithm:"sha256",
          description:"qemu-guest-agent preinstalled", enabled:true}' | tr -d '\n'
    else
      printf '  {"name":"%s","kind":"qcow2","os":"%s","version":"%s","arch":"%s","url":"%s","checksum":"%s","checksum_algorithm":"sha256","description":"qemu-guest-agent preinstalled","enabled":true}' \
        "$name" "$os" "$version" "$arch" "$url_prefix/$file" "$sha"
    fi
  done
  echo ""
  echo "]"
} > "$MIRRORS_FILE"

# ── Итог ───────────────────────────────────────────────────────────────────────
step "Итог"
ok    "Готово образов: $DONE"
if [ "$SKIPPED" -gt 0 ]; then
  info "Пропущено arm64: $SKIPPED (INCLUDE_ARM64=1 чтобы включить)"
fi
if [ "$FILTERED" -gt 0 ]; then
  info "Отфильтровано по ONLY=\"$ONLY\": $FILTERED"
fi
if [ "$FAILED" -gt 0 ]; then
  warn "С ошибками: $FAILED"
fi
echo
info "Готовые образы:   $OUTDIR/"
info "Контрольные суммы: $SUMS_FILE"
info "Зеркала (JSON):    $MIRRORS_FILE"
echo
echo "Дальше:"
echo "  1) Выложите содержимое $OUTDIR/ на HTTP(S)-хостинг, доступный НОДАМ Proxmox."
if [ -z "$BASE_URL" ]; then
  echo "     Затем замените REPLACE_ME в mirrors.json на публичный URL (или перезапустите с BASE_URL=...)."
fi
echo "  2) Добавьте зеркала одним из способов:"
echo "     • UI: раздел образов → добавить зеркало (нужно право template:manage)"
echo "     • API: curl -X POST https://<панель>/api/images/mirrors \\"
echo "              -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \\"
echo "              -d @<(jq -c '.[]' $MIRRORS_FILE)   # по одному объекту на запрос"
echo "  3) Создавайте шаблон из вашего зеркала — qemu-guest-agent уже внутри."

[ "$FAILED" -gt 0 ] && exit 1 || exit 0
