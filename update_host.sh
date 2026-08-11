#!/bin/bash
# PVEmanager — Host-side update watchdog
# Запускается через systemd (pvemanager-update.service) под тем же пользователем,
# который владеет проектом и имеет доступ к Docker.
#
# Алгоритм:
#   1. Каждые 3 секунды проверяет наличие файла .update_trigger в PROJECT_DIR
#   2. При обнаружении: удаляет триггер → git pull → СНАЧАЛА build (стек ещё
#      работает) → docker compose down → docker compose up -d --wait → пишет лог
#
# Важно: build выполняется ДО down. Если сборка упадёт, старый стек продолжает
# работать, а не остаётся погашенным. up запускается с --wait, чтобы убедиться,
# что контейнеры реально стали healthy (миграции БД накатываются на старте app).

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

        # ── Step 2: build НОВЫХ образов, пока старый стек ещё работает ─────────
        # Собираем ДО down: если сборка упадёт, старый стек остаётся поднятым,
        # а не лежит выключенным.
        # Собираем и app, и frontend — иначе изменения фронта не доезжают.
        #
        # Сборка КЭШИРУЕМАЯ (без --no-cache): Dockerfile'ы устроены так, что
        # тяжёлые слои (apt/pip/npm) кэшируются отдельно от исходников, а
        # COPY кода стоит в конце — поэтому изменения app/frontend всё равно
        # пересобираются, но без повторного apt/pip/npm на каждый деплой.
        # --pull обновляет базовые образы. --no-cache НЕ используем: он молотил
        # сборку с нуля каждый пуш и за пару недель раздул build cache до десятков ГБ.
        # Собираем ПОСЛЕДОВАТЕЛЬНО (по одному сервису), а не разом: параллельная
        # сборка app (компиляция pydantic-core/pynacl) и frontend (vite/npm —
        # главный пожиратель RAM) даёт пиковую нагрузку, которая на хостах без
        # swap уводит машину в OOM/ребут посреди сборки. Один сервис за раз —
        # заметно ниже пик памяти при том же кэшировании слоёв.
        log "[2/4] docker compose build --pull (sequential: app, then frontend)..."
        build_ok=1
        for svc in app frontend; do
            log "[2/4] building $svc..."
            if ! $COMPOSE_CMD build --pull "$svc" >> "$LOG_FILE" 2>&1; then
                log "[2/4] ERROR: build of $svc failed — стек НЕ трогаем, остаётся на старой версии"
                build_ok=0
                break
            fi
        done
        [ "$build_ok" -eq 1 ] || continue
        log "[2/4] build OK"

        # ── Step 3: docker compose down ───────────────────────────────────────
        # Быстрый: образы уже готовы, простой минимален.
        log "[3/4] docker compose down..."
        $COMPOSE_CMD down >> "$LOG_FILE" 2>&1 && log "[3/4] docker compose down OK" \
            || log "[3/4] WARNING: docker compose down returned non-zero (continuing)"

        # ── Step 4: docker compose up -d --wait ───────────────────────────────
        # --wait дожидается healthcheck'ов (app накатывает миграции БД на старте);
        # без него up возвращает успех, даже если контейнер тут же упал.
        log "[4/4] docker compose up -d --wait..."
        if $COMPOSE_CMD up -d --wait --wait-timeout 180 >> "$LOG_FILE" 2>&1; then
            log "[4/4] docker compose up -d OK (контейнеры healthy)"

            # ── Уборка: не даём диску забиться старыми образами и build-кэшем ──
            # Запускается ТОЛЬКО после успешного деплоя (стек уже на новой версии).
            # image prune -f      — удаляет dangling-образы (предыдущие сборки).
            # builder prune until=24h — чистит build cache старше суток, оставляя
            #                       свежие слои для быстрых повторных сборок.
            log "[cleanup] docker image/builder prune..."
            docker image prune -f >> "$LOG_FILE" 2>&1 || true
            docker builder prune -f --filter 'until=24h' >> "$LOG_FILE" 2>&1 || true
            log "[cleanup] done"

            log "=== Update completed successfully ==="
        else
            log "[4/4] ERROR: контейнеры не стали healthy за 180с — состояние стека:"
            $COMPOSE_CMD ps >> "$LOG_FILE" 2>&1 || true
            log "[4/4] Проверьте логи app: '$COMPOSE_CMD logs --tail=100 app' (вероятно ошибка миграции/нового кода)"
            continue
        fi
    fi

    sleep "$POLL_INTERVAL"
done
