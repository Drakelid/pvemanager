# App Store — M2 App Engine (установка)

Установка приложения из каталога: клон золотого шаблона → `pct push` compose/.env →
`docker compose up -d` → health-check, с журналом шагов, статусами и WS-прогрессом.
Ядро переиспользует пайплайн M0 (`app/appstore/pipeline.py`).

## Компоненты
- Модели: `InstalledApp`, `AppOperation` (`backend/app/models/appstore.py`).
- Миграция: `migrate_appstore_installed()` (таблицы `installed_apps`, `app_operations`).
- Движок: `backend/app/services/appstore_engine.py` — `install`, `retry_install`, `delete_app`,
  `build_env` (платформенные переменные ТЗ 5.3 + форма + генерация `random`-секретов).
- API: `backend/app/api/appstore/apps.py`.
- Прогресс: WebSocket `/ws/tasks`, события `appstore_operation_update` / `appstore_app_deleted`.

## Обязательная настройка
`APPSTORE_GOLDEN_TEMPLATE` — volid золотого vztmpl с предустановленным Docker,
напр. `local:vztmpl/golden-docker_12_amd64.tar.zst` (готовится вручную, M0). Без
него установка отклоняется с понятной ошибкой.

## API
```
POST   /api/appstore/apps/install          (app:install)  → {installed_app_id, operation_id, vmid, secrets}
GET    /api/appstore/apps                   (app:view)
GET    /api/appstore/apps/{id}              (app:view)     → + catalog, update_available
GET    /api/appstore/apps/{id}/operations   (app:view)     → журнал шагов
GET    /api/appstore/apps/{id}/credentials  (app:view)     → секреты формы (показать один раз)
POST   /api/appstore/apps/{id}/retry        (app:manage)   → повтор без пересоздания LXC
DELETE /api/appstore/apps/{id}              (app:manage)   → stop + destroy LXC + удалить запись
```

`install` тело запроса: `app_id, name, server_id, node?, form_answers{}, cores,
memory, disk, storage, bridge, ostemplate?`.

## Поведение (ТЗ 6.1)
- Пайплайн асинхронный (ThreadPoolExecutor), статус и журнал шагов пишутся в БД,
  прогресс транслируется по WS.
- `secrets` (пароли/сгенерированные random) возвращаются один раз в ответе install;
  в БД хранятся зашифрованно (Fernet, `env_encrypted`).
- Сбой любого шага → `installed_apps.status='error'`, `app_operations.status='failed'`
  с текстом ошибки; доступны «Повторить» (`/retry`) и «Удалить» (`DELETE`).
- Идемпотентность повтора: vmid сохраняется в записи; при повторе контейнер не
  пересоздаётся (проверка существования по vmid), пайплайн продолжает с доставки/запуска.
- `pct exec`/`pct push` — через SSH на ноду; значения `.env` очищаются от переводов
  строк, файлы доставляются base64 → `pct push` (без shell-инъекций, S-4).

## Verification (DoD M2 — backend)
Предпосылки: настроен `APPSTORE_GOLDEN_TEMPLATE`, каталог синхронизирован (M1),
SSH-доступ панели к ноде.
1. `POST /api/appstore/apps/install {app_id:"uptime-kuma", name:"uk1", server_id:1}`
   → `202`-подобный ответ с `operation_id`; по WS приходят шаги; статус → `running`.
2. `GET /api/appstore/apps/{id}` → `status:running`, `url:http://IP:port`.
3. Открыть `url` — приложение отвечает.
4. Приложение с формой (напр. `wordpress`): random-пароли БД генерируются,
   `GET /apps/{id}/credentials` их возвращает.
5. Сбой (напр. неверный шаблон) → `status:error`, журнал с текстом; `POST /retry`
   не создаёт второй LXC; `DELETE` сносит контейнер и запись.

UI (сетка, мастер установки, My Apps) — под-этап M2 (готов).

## M3 — Lifecycle + реконсиляция

Добавлено в `appstore_engine.py` / `api/appstore/apps.py`:
```
POST /api/appstore/apps/{id}/action/{start|stop|restart}   (app:manage)
GET  /api/appstore/apps/{id}/logs?tail=200                 (app:view)  — docker compose logs через pct exec
POST /api/appstore/apps/reconcile                          (app:view)  — сверка LXC↔БД
```
- `lifecycle_action` — start/stop/restart LXC через ProxmoxClient, обновление статуса + WS.
- `get_logs` — `pct exec … docker compose logs --tail N` по SSH (ТЗ 6.5, по запросу).
- `reconcile` (ТЗ 6.6) — фон каждые 60с (`start_reconcile_scheduler`) + при открытии «My Apps»:
  пропавший контейнер → `orphaned`; статус синхронизируется с Proxmox (running/stopped).
- UI: кнопки Start/Stop/Restart/Logs/Delete в My Apps, диалог логов, бейдж `orphaned`.

DoD M3: все операции работают, orphan-детект работает.

## M4 — Update + Rollback (снапшоты Proxmox)

```
POST /api/appstore/apps/{id}/update    (app:manage)  body: {form_answers?}
POST /api/appstore/apps/{id}/rollback  (app:manage)
```
- `update` (ТЗ 6.3): снапшот `preupd_<version>_<timestamp>` → `pct push` свежего
  compose из каталога (`poc_update`) → `docker compose pull && up -d` → health-check.
  Успех → новая версия в БД, хранится последний 1 pre-update снапшот (старые удаляются).
  Провал health → статус `update_failed`, доступен откат. `.env` сохраняется, новые
  поля формы дозапрашиваются (`form_answers`). Версия/tipi снапшота фиксируются в
  `installed_apps.snapshot_version/snapshot_tipi_version` (миграция добавляет колонки).
- `rollback` (ТЗ 6.4): stop → `rollback_container_snapshot(start=1)` → start →
  health-check → возврат прежней версии в БД. UI обязательно предупреждает, что
  откат возвращает и ДАННЫЕ приложения на момент снапшота.
- UI: кнопки Update (если `update_available`) и Rollback (если есть `last_snapshot`)
  в My Apps, с подтверждением-предупреждением.

DoD M4: обновление и откат Nextcloud проходят без потери данных (данные — в томах
контейнера, снапшот покрывает весь CT).
