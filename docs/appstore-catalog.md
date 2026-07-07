# App Store — M1 Catalog Service

Конвертер каталога `runtipi/runtipi-appstore` → таблица `catalog_apps`. Backend-этап
(UI — позже). Наполнение и отдача каталога через API.

## Компоненты
- Модель: `backend/app/models/appstore.py` → `CatalogApp` (таблица `catalog_apps`).
- Миграция: `migrate_appstore_catalog()` в `backend/migrations/migrations.py` (авто на старте).
- Сервис: `backend/app/services/appstore_catalog.py`
  - `CatalogProvider` (ABC) → `RuntipiCatalogProvider` (скачивание tarball, парсинг).
  - `sync_catalog(db, ref?)` — идемпотентный upsert + кэш логотипов.
  - `start_catalog_scheduler()` — авто-синк раз в `CATALOG_SYNC_INTERVAL_HOURS` (APScheduler).
- API: `backend/app/api/appstore/catalog.py` (роутер подключён в `main.py`).
- Права: `app:view`, `app:install`, `app:manage` (`backend/app/rbac/permissions.py`).

## Настройки (env, все с дефолтами)
| Переменная | Дефолт | Назначение |
|---|---|---|
| `RUNTIPI_APPSTORE_REPO` | `runtipi/runtipi-appstore` | источник |
| `RUNTIPI_APPSTORE_REF` | `master` | ветка/tag/commit (рекомендуется фиксировать) |
| `APPSTORE_DATA_DIR` | `/app/data/appstore` | кэш логотипов (volume `appstore_data`) |
| `CATALOG_SYNC_INTERVAL_HOURS` | `24` | периодичность авто-синка |
| `APPSTORE_HOST_ARCH` | `amd64` | арх. нод (пометка неподдерживаемых) |

## API
```
GET  /api/appstore/catalog?q=&category=&available_only=&limit=&offset=   (app:view)
GET  /api/appstore/catalog/meta                                          (app:view)
GET  /api/appstore/catalog/{app_id}                                      (app:view)
GET  /api/appstore/catalog/{app_id}/logo                                 (app:view)
POST /api/appstore/catalog/sync                                          (app:manage)
```

## Verification (DoD M1)
1. Запустить синхронизацию: `POST /api/appstore/catalog/sync` (или дождаться авто-джоба).
   - Ожидаемо: `stats.total ≥ 150` (на текущем репозитории проходит фильтр ~265 приложений).
2. `GET /api/appstore/catalog/meta` → `total`, `last_synced_at`, список категорий.
3. `GET /api/appstore/catalog?q=uptime` → карточки с `logo_url`.
4. `GET /api/appstore/catalog/{app_id}` → `form_fields`, `compose_yaml`, `description_md`.
5. Идемпотентность: повторный `sync` не увеличивает `total` неконтролируемо (`created≈0`, `updated>0`).
6. Устойчивость (F-CAT-5): битый `config.json` одного приложения не роняет синк — `errors++`, остальные проходят.

Оффлайн-валидация парсера на реальном репозитории (stdlib): 271 папка, 270 с
config/compose/logo/описанием, 0 ошибок парсинга, 143 с формами, 5 deprecated
исключены → 265 проходят фильтр.
