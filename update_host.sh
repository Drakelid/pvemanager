#!/bin/bash
# PVEmanager — Host-side update watchdog
# Запускается через systemd (pvemanager-update.service) под тем же пользователем,
# который владеет проектом и имеет доступ к Docker.
#
# Алгоритм:
#   1. Каждые 3 секунды проверяет наличие файла .update_trigger в PROJECT_DIR
#   2. При обнаружении: удаляет триггер → git pull → docker compose down →
#      docker compose build --no-cache app → docker compose up -d → пишет лог

set -euo pipefail

# PROJECT_DIR передаётся systemd через EnvironmentFile=/etc/pvemanager-update.env
# Если запущен вручную — использует директорию скрипта как fallback.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"

TRIGGER="$PROJECT_DIR/.update_trigger"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/update_host.log"
POLL_INTERVAL=3   # секунд

# ── helpers ────────────────────────────────────────────────────────────────────

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    mkdir -p "$LOG_DIR"
    echo "$msg" >> "$LOG_FILE"
}

# Определить рабочую команду docker compose
detect_compose_cmd() {
    if docker compose version &>/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose &>/dev/null; then
        echo "docker-compose"
    else
        log "ERROR: docker compose not found"
        exit 1
    fi
}

# ── main loop ──────────────────────────────────────────────────────────────────

log "=== PVEmanager update watchdog started ==="
log "PROJECT_DIR : $PROJECT_DIR"
log "TRIGGER     : $TRIGGER"
log "LOG_FILE    : $LOG_FILE"
log "POLL_INTERVAL: ${POLL_INTERVAL}s"

COMPOSE_CMD=$(detect_compose_cmd)
log "COMPOSE_CMD : $COMPOSE_CMD"

while true; do
    if [ -f "$TRIGGER" ]; then
        log "--- Update trigger detected ---"

        # Немедленно удаляем триггер, чтобы повторные нажатия не накапливались
        rm -f "$TRIGGER"

        cd "$PROJECT_DIR"

        # ── Step 1: git pull ───────────────────────────────────────────────────
        log "[1/4] git pull..."
        BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
        export GIT_TERMINAL_PROMPT=0
        if git pull origin "$BRANCH" >> "$LOG_FILE" 2>&1; then
            log "[1/4] git pull OK (branch: $BRANCH)"
        else
            log "[1/4] git pull failed — trying fetch + reset --hard"
            git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1 || true
            git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1 || {
                log "[1/4] ERROR: git update failed, aborting update"
                continue
            }
            log "[1/4] git reset --hard OK"
        fi

        # ── Step 2: docker compose down ───────────────────────────────────────
        log "[2/4] docker compose down..."
        $COMPOSE_CMD down >> "$LOG_FILE" 2>&1 && log "[2/4] docker compose down OK" \
            || log "[2/4] WARNING: docker compose down returned non-zero (continuing)"

        # ── Step 3: docker compose build --no-cache app ───────────────────────
        log "[3/4] docker compose build --no-cache app..."
        if $COMPOSE_CMD build --no-cache app >> "$LOG_FILE" 2>&1; then
            log "[3/4] build OK"
        else
            log "[3/4] ERROR: build failed — aborting, containers NOT restarted"
            continue
        fi

        # ── Step 4: docker compose up -d ──────────────────────────────────────
        log "[4/4] docker compose up -d..."
        if $COMPOSE_CMD up -d >> "$LOG_FILE" 2>&1; then
            log "[4/4] docker compose up -d OK"
        else
            log "[4/4] ERROR: docker compose up -d failed"
            continue
        fi

        log "=== Update completed successfully ==="
    fi

    sleep "$POLL_INTERVAL"
done
