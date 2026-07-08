# App Store → управляемый плагин: дорожная карта реализации

> Самодостаточный план для выполнения в чистой сессии Claude Code (другой аккаунт).
> Контекст этого документа НЕ предполагает знания предыдущих диалогов. Всё
> необходимое — пути, сигнатуры, команды — приведено ниже.

---

## 0. Контекст проекта и обязательные конвенции

**Проект:** `pvemanager` — веб-панель управления Proxmox VE. Бэкенд — FastAPI
(Python), фронтенд — React + TypeScript + Vite + shadcn/ui, БД — PostgreSQL.
Запуск — Docker Compose (`compose.yml`).

**Модуль App Store** — каталог self-hosted приложений: тянет манифесты из
внешних репозиториев (Runtipi, Umbrel), ставит каждое приложение как отдельный
LXC-контейнер с Docker Compose внутри на ноде Proxmox.

### Обязательные правила (из CLAUDE.md проекта)
1. **graphify-first.** В репо есть граф знаний `graphify-out/`. Перед grep/чтением
   исходников оринтируйся: `graphify query "<вопрос>"`, `graphify explain
   "<концепт>"`, `graphify path "<A>" "<B>"`. После изменения кода — `graphify
   update .` (AST-only, без API).
2. **Язык.** Все ответы, комментарии в коде и коммиты — на русском (стиль уже
   принят в кодовой базе App Store).
3. **Git.** Коммитить в `main`, пушить в оба remote: `origin` И `github`.
   Формат коммитов — как в истории: `feat(appstore): …`, `fix(appstore): …`.
4. **Миграции.** Единый файл `backend/migrations/migrations.py`. Каждая новая
   миграция — отдельная функция `migrate_*(conn)` + регистрация в
   `run_all_migrations` под следующим номером. Использовать хелперы
   `table_exists(conn, t)`, `column_exists(conn, t, c)`,
   `add_column_if_not_exists(conn, t, c, type)`. Миграции идемпотентны и
   оборачиваются в `try/except + conn.rollback()`. Запускаются автоматически при
   старте бэкенда (`main.py:lifespan`).

### Операционные команды (Docker)
Бэкенд и фронтенд — **собранные образы**, не dev-серверы. После изменений:
```bash
# пересобрать + перезапустить бэкенд (применит миграции при старте)
docker compose -f compose.yml up -d --build app
# пересобрать фронтенд
docker compose -f compose.yml up -d --build frontend
# логи бэкенда
docker logs pvemanager-app --tail 50
# psql
docker exec pvemanager-db psql -U pvemanager -d pvemanager -tAc "SELECT ..."
# ручной синк каталога изнутри контейнера
docker exec pvemanager-app python -c "from app.db import SessionLocal; from app.services.appstore_catalog import sync_catalog; db=SessionLocal(); print(sync_catalog(db)); db.close()"
```
Порты: бэкенд `8000`, фронтенд `3001`. Логотипы кэшируются в томе
`appstore_data` → `/app/data/appstore/logos`. Зависимости бэкенда (`loguru`,
`httpx`, `yaml`, `sqlalchemy`) есть только внутри контейнера — локально
`python -m py_compile` для синтакс-проверки, полноценный прогон — в контейнере.

### Проверка фронтенда
```bash
cd frontend && node_modules/.bin/tsc --noEmit -p tsconfig.json   # 0 ошибок = ок
```

---

## 1. Текущее состояние (УЖЕ РЕАЛИЗОВАНО — не переделывать)

Мультиисточниковый каталог с Runtipi + Umbrel уже работает. Ключевые точки:

**Каталог** — `backend/app/services/appstore_catalog.py`:
- `CatalogProvider` (ABC, атрибут `source`, статик-хелперы `_download_tarball`,
  `_read`). Реализации: `RuntipiCatalogProvider` (`source="runtipi"`),
  `UmbrelCatalogProvider` (`source="umbrel"`, префикс app_id `umbrel-`).
- `UmbrelCatalogProvider._map_manifest()` — маппит `umbrel-app.yml` в общий
  формат. `_fetch_gallery_icons()` — качает tarball галереи
  `getumbrel/umbrel-apps-gallery` и берёт `<app-id>/icon.svg`.
- `sync_catalog(db, ref=None, provider=None)` — синкает все активные источники
  (`_enabled_providers()` читает `settings.APPSTORE_SOURCES`), пометка
  «исчезнувших» приложений scoped по `source`.
- `get_catalog_meta(db)` — возвращает в т.ч. `sources: [...]`.
- `start_catalog_scheduler()` — APScheduler, `IntervalTrigger(hours=24)`,
  **без `next_run_time`** → первый синк только через 24ч (см. Workstream A2).

**Модель** — `backend/app/models/appstore.py`: `CatalogApp.source`
(String(50), default `"runtipi"`, index). Есть в `to_dict()`.

**Миграция** — `migrate_appstore_catalog_source` (Migration 34) в
`backend/migrations/migrations.py`.

**Пайплайн установки** — `backend/app/appstore/pipeline.py`:
- `InstallSpec.source`. `_normalize_compose(compose, host_port, *, source)`
  ветвится: runtipi (`x-runtipi.internal_port`/`is_main`) vs umbrel
  (`_prepare_umbrel`: вырезает `app_proxy`/`tor`, берёт порт из
  `app_proxy.environment.APP_PORT`, чистит `depends_on`). `_platform_env(env,
  ip, source)` — платформенные переменные по источнику.
- `poc_install`, `poc_update(..., source=...)` прокидывают source.

**Движок** — `backend/app/services/appstore_engine.py`: `install` /
`retry_install` / `update` читают `app.source` и прокидывают в пайплайн.

**API** — `backend/app/api/appstore/catalog.py`: `GET /api/appstore/catalog`
принимает `source`; `get_catalog_meta` отдаёт `sources`. Агрегатор —
`backend/app/api/appstore/__init__.py` (router), монтируется в
`backend/app/main.py:449` (`app.include_router(appstore_router.router)`).

**Фронтенд** — `frontend/src/types/appstore.ts` (`source` в `CatalogAppLight`,
`sources?` в `CatalogMeta`); `frontend/src/hooks/use-appstore.ts`
(`useCatalog(q, category, source?)`); `frontend/src/features/appstore/
AppStorePage.tsx` (фильтр источника + бейдж, показываются при `sources.length>1`);
локали `frontend/src/locales/{en,ru}.json` (`appstore.all_sources`,
`appstore.sources.{runtipi,umbrel}`).

**Конфиг** — `backend/app/config.py`: `APPSTORE_SOURCES` (default `"runtipi"`),
`UMBREL_APPSTORE_REPO`, `UMBREL_APPSTORE_REF`, `UMBREL_APPSTORE_GALLERY_REPO`.
Задокументировано в `backend/.env.example`.

**Известные болячки, которые чинят workstream'ы ниже:**
- Синк Umbrel ~7 мин из-за тяжёлого tarball галереи (тянет и скриншоты). → **A1**
- Пустой каталог первые 24ч на свежем деплое. → **A2**
- Золотой LXC-шаблон готовится вручную (`docs/golden-template.md`). → **B**
- App Store зашит в lifespan/роутинг, конфиг только через env. → **C**

---

## Workstream A. Оптимизация каталога и иконок

**Цель:** убрать 7-мин синк и «пустой каталог 24ч». Малый изолированный шаг.
**НЕ коммитить иконки в репо** — решено: раздувание истории бинарниками +
юридика (чужие брендовые логотипы). Оставляем рантайм-загрузку в том
`appstore_data`, но делаем её быстрой.

### A1. Пофайловая параллельная загрузка иконок Umbrel
Сейчас `_fetch_gallery_icons()` качает весь tarball галереи (со скриншотами).
Заменить на параллельную загрузку только `icon.svg` каждого приложения с CDN
GitHub Pages: `https://getumbrel.github.io/umbrel-apps-gallery/<app-id>/icon.svg`.

Файл: `backend/app/services/appstore_catalog.py`, класс `UmbrelCatalogProvider`.

Шаги:
1. Добавить настройку `UMBREL_GALLERY_CDN` в `config.py`, default
   `https://getumbrel.github.io/umbrel-apps-gallery` (+ строка в `.env.example`).
2. Переписать `_fetch_gallery_icons()`:
   - Принимает список `raw_id` (id без префикса) уже распарсенных приложений.
   - Параллельно (пул на ~16 воркеров, `concurrent.futures.ThreadPoolExecutor`
     или `httpx` с ограничением) тянет `GET {CDN}/{raw_id}/icon.svg`.
     404 → у приложения нет иконки, пропустить (не ошибка).
   - Возвращает `dict[raw_id -> bytes]`.
3. В `fetch()` вызывать после парсинга, передавая набор id. Оставить fallback:
   если CDN недоступен целиком (сеть) — не ронять синк (текущий `try/except`).
4. Убрать зависимость от tarball галереи (`UMBREL_APPSTORE_GALLERY_REPO` можно
   оставить как запасной путь либо удалить — на усмотрение, но упростить).

Критерий приёмки: синк с включённым umbrel завершается за секунды-десятки
секунд; в БД `SELECT count(*) FILTER (WHERE logo_path IS NOT NULL) FROM
catalog_apps WHERE source='umbrel'` ≈ прежнему значению (было 379/379);
`curl -s -o /dev/null -w "%{http_code} %{content_type}\n"
http://localhost:8000/api/appstore/catalog/umbrel-affine/logo` → `200 image/svg+xml`.

### A2. Начальный синк при пустом каталоге
Файл: `backend/app/services/appstore_catalog.py:start_catalog_scheduler`.
Добавить: если `db.query(CatalogApp).count() == 0` — запланировать немедленный
разовый прогон синка (APScheduler `add_job(..., next_run_time=<now>)` через
отдельный one-shot job, либо submit в тот же ThreadPool движка). Не блокировать
старт приложения (синк в фоне). Логировать начало/итог.
Критерий: свежий деплой с `APPSTORE_SOURCES=runtipi` показывает каталог без
ручного нажатия «Обновить каталог».

> Примечание: `next_run_time` требует aware-datetime; в скриптах graphify
> `Date.now()` недоступен, но это рантайм бэкенда — там обычный
> `datetime.now(timezone.utc)` доступен.

---

## Workstream B. Автоматическая подготовка золотого LXC-шаблона

**Цель:** убрать главную ручную преграду онбординга. Сейчас
`APPSTORE_GOLDEN_TEMPLATE` (напр. `local:vztmpl/golden-docker_12_amd64.tar.zst`)
пользователь готовит руками по `docs/golden-template.md`. Сделать admin-действие
«Подготовить золотой шаблон» с прогрессом.

Что такое золотой шаблон: LXC-vztmpl с предустановленным Docker + compose,
включённым nesting/keyctl, из которого клонируются контейнеры приложений.

### B1. Сервис сборки шаблона
Новый файл: `backend/app/appstore/golden_template.py`. Переиспользовать
инфраструктуру из `backend/app/appstore/pipeline.py`:
`_get_proxmox_client`, `_node_ssh`, `_run`, `_pct`, `_resolve_node`, `SSHClient`.

Алгоритм (по SSH root@node, через `pct`):
1. Скачать базовый Debian-шаблон на ноду, если нет:
   `pveam update && pveam download <storage> debian-12-standard_*_amd64.tar.zst`
   (найти доступный образ через `pveam available`).
2. Создать временный LXC из базового шаблона (`create_lxc_container`,
   `features=nesting=1,keyctl=1`, `unprivileged=True`, `start_after_create=True`).
3. Дождаться IP (`_wait_ip`), внутри контейнера установить Docker:
   `pct exec <vmid> -- bash -lc 'apt-get update && apt-get install -y ca-certificates curl && install -m0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && ...docker-ce docker-compose-plugin'`
   (вынести команды в константы; полный список — по официальной инструкции Docker
   для Debian). Включить и остановить docker (`systemctl enable docker`).
4. Очистить контейнер (apt clean, machine-id, логи) для чистого шаблона.
5. Остановить контейнер, сконвертировать в шаблон: либо `vzdump` в
   `vztmpl`-tarball, либо `pct template <vmid>` + экспорт. Итоговый vztmpl
   положить в storage под именем `golden-docker_12_amd64.tar.zst`.
6. Удалить временный контейнер.
7. Вернуть строку шаблона для `APPSTORE_GOLDEN_TEMPLATE`
   (`<storage>:vztmpl/<file>`).

Прогресс — через callback `on_step(step, progress)`, как в `poc_install`.
Идемпотентность: если целевой vztmpl уже есть в storage — не пересоздавать
(если только не передан `force`).

### B2. API + фоновый запуск
Новый файл: `backend/app/api/appstore/setup.py` (или расширить `catalog.py`):
- `POST /api/appstore/golden-template` (permission `app:manage`) — принимает
  `server_id`, `node`, `storage`; запускает сборку в ThreadPool
  (как `_engine_executor`), пишет прогресс в `AppOperation`-подобный журнал
  (можно завести `type="golden_template"` в AppOperation или отдельную задачу —
  свериться с моделью `AppOperation` в `models/appstore.py`).
- `GET /api/appstore/golden-template/status` — текущее состояние.
Зарегистрировать router в `backend/app/api/appstore/__init__.py`.

### B3. Frontend
На странице настроек App Store (или в `AppStorePage`, если попадёт под
Workstream C) — кнопка «Подготовить золотой шаблон» с выбором ноды/хранилища и
прогрессом по WebSocket (переиспользовать механику прогресса установки из
`use-appstore.ts` / `MyAppsPage.tsx`). Локали в `en.json`/`ru.json`.

Критерий приёмки: на тестовой ноде из UI одним действием создаётся vztmpl,
после чего установка приложения проходит без ручной подготовки шаблона.
Обновить `docs/golden-template.md`: добавить раздел про автоматический способ,
ручной оставить как fallback.

> Риск: команды установки Docker чувствительны к версии Debian и сети ноды.
> Делать пошаговый вывод и понятные ошибки (`_run` уже бросает `PocError` с
> stdout). Таймауты apt/docker — увеличенные (`_DOCKER_TIMEOUT`).

---

## Workstream C. Каркас плагинов (App Store как управляемый плагин)

**Цель:** превратить App Store из «зашитого» модуля в управляемый плагин
(включение/выключение + конфиг из UI), заложив паттерн для будущих плагинов.
Делать отдельным milestone — затрагивает lifespan, роутинг, модель настроек и
фронтенд. **Не строить полноценный SDK — минимально достаточный каркас.**

### C1. Хранение состояния плагинов (БД)
Существующая `PanelSettings` (`backend/app/models/settings.py`) — это key/value
(`value String(500)`). Для флага хватит, для JSON-конфига 500 символов
рискованно. Решение: новая таблица `plugins`.

Модель (новый класс в `models/settings.py` или `models/misc.py`):
```python
class Plugin(Base):
    __tablename__ = "plugins"
    id = Column(String(50), primary_key=True)      # "appstore"
    name = Column(String(200), nullable=False)     # "Каталог приложений"
    enabled = Column(Boolean, nullable=False, default=True)
    config = Column(JSON, nullable=False, default=dict)  # {sources, golden_template, sync_interval_hours, ...}
    created_at / updated_at
```
Миграция (следующий номер, напр. Migration 35): `migrate_plugins(conn)` —
CREATE TABLE IF NOT EXISTS + сид-строка `appstore` (`enabled=true`,
`config` из текущих env-дефолтов). Идемпотентно.

### C2. Интерфейс плагина
Новый файл: `backend/app/plugins/base.py`:
```python
class PluginSpec:
    id: str
    name: str
    def register_routes(self, app) -> None: ...      # include_router
    def start_schedulers(self) -> None: ...           # APScheduler jobs
    def stop_schedulers(self) -> None: ...
    def settings_schema(self) -> dict: ...            # для авто-формы в UI
```
Реестр: `backend/app/plugins/registry.py` — список инстансов PluginSpec.
App Store оборачиваем в `AppStorePlugin(PluginSpec)`
(`backend/app/plugins/appstore_plugin.py`): в `register_routes` монтирует
существующий `appstore_router.router`; в `start_schedulers` вызывает
`start_catalog_scheduler` + `start_reconcile_scheduler`.

### C3. Интеграция в lifespan/роутинг
Файл: `backend/app/main.py`.
- Заменить прямые вызовы `start_catalog_scheduler` / `start_reconcile_scheduler`
  (строки ~205-219) и `include_router(appstore_router.router)` (строка ~449)
  на проход по реестру плагинов: для каждого `enabled` плагина — `register_routes`
  + `start_schedulers`. Выключенный плагин не монтирует роуты и не стартует джобы.
- Важно: `include_router` вызывается при сборке app (в `create_app`), а
  `enabled` читается из БД → нужен доступ к БД до старта роутинга. Вариант:
  роуты монтировать всегда, но внутри вернуть 403/404, если плагин выключен
  (проще), ЛИБО читать `plugins.enabled` в `create_app` через短-lived сессию
  (чище). Выбрать проще-надёжный: **всегда монтировать router, но добавить
  dependency-guard** `require_plugin_enabled("appstore")` в роуты App Store —
  меньше риска с порядком инициализации. Планировщики — гейтить по `enabled`
  (их можно стартовать/останавливать динамически).

### C4. Конфиг из env → БД (с env как дефолт)
- `settings.APPSTORE_SOURCES` и пр. становятся **дефолтами**; фактическое
  значение читается из `plugins.config` (`appstore`). Точки чтения:
  `_enabled_providers()`, `get_catalog_meta()`, `start_catalog_scheduler`
  (интервал), `install()` (golden_template).
- Ввести хелпер `get_plugin_config(db, "appstore") -> dict` с fallback на env.

### C5. API управления плагинами
Новый роутер `backend/app/api/plugins.py`:
- `GET /api/plugins` — список (id, name, enabled, config, schema).
- `PATCH /api/plugins/{id}` — вкл/выкл + правка config (permission `settings:manage`
  или существующий admin-guard — свериться с `auth.PermissionChecker`).
  При включении/выключении — динамически стартовать/останавливать планировщики.
Зарегистрировать в `main.py`.

### C6. Frontend
- Раздел «Плагины» в настройках (`frontend/src/features/settings/…` — найти
  существующую страницу настроек через `graphify query "settings page frontend"`).
  Список плагинов с тумблером enabled и формой конфига (источники каталога,
  золотой шаблон, интервал синка), генерируемой по `settings_schema`.
- Пункт меню/страницы App Store (`router.tsx`, sidebar) — скрывать, если плагин
  выключен (читать `GET /api/plugins`).
- Локали.

Критерий приёмки: App Store можно выключить из UI → пропадают его пункты меню,
API отвечает 403/404, планировщики останавливаются; включить обратно →
восстанавливается. Конфиг (источники и т.д.) правится из UI без правки `.env` и
рестарта. Второй гипотетический плагин добавляется реализацией `PluginSpec` +
строкой в реестре, без правок lifespan.

---

## 3. Порядок выполнения и оценка

| # | Workstream | Изолированность | Ценность | Реком. порядок |
|---|-----------|-----------------|----------|----------------|
| A1 | Иконки параллельно с CDN | высокая | средняя (боль синка) | 1 |
| A2 | Стартовый синк | высокая | средняя | 1 (вместе с A1) |
| B | Скрипт золотого шаблона | средняя | высокая (онбординг) | 2 |
| C | Каркас плагинов | низкая (широкий охват) | высокая (стратегия) | 3 (отдельный milestone, желательно через режим планирования) |

Рекомендация: A → B → C. A и B — самостоятельные PR-ы. C — крупный, стоит
сначала уточнить детали (где именно страница настроек, как устроен guard
планировщиков) отдельным планом.

## 4. Общие критерии готовности каждого PR
1. `python -m py_compile` затронутых `.py` (локально) + прогон в контейнере.
2. `tsc --noEmit` фронтенда — 0 ошибок.
3. Функциональная проверка в реальном контейнере (rebuild → действие → проверка
   в БД/через curl/в UI). Не полагаться только на юнит-логику.
4. Идемпотентные миграции с правильным следующим номером.
5. `graphify update .` после изменений кода.
6. Коммит на русском в `main`, пуш в `origin` и `github`.
7. Обновить `.env.example` при новых настройках и `docs/` при изменении
   пользовательских сценариев.

## 5. Полезные якоря (файлы)
- Каталог/провайдеры: `backend/app/services/appstore_catalog.py`
- Пайплайн установки: `backend/app/appstore/pipeline.py`
- Движок жизненного цикла: `backend/app/services/appstore_engine.py`
- Модели: `backend/app/models/appstore.py`, `backend/app/models/settings.py`
- API App Store: `backend/app/api/appstore/{__init__,catalog,apps}.py`
- Точка сборки app + lifespan: `backend/app/main.py`
- Миграции: `backend/migrations/migrations.py`
- Конфиг: `backend/app/config.py`, `backend/.env.example`
- Фронтенд App Store: `frontend/src/features/appstore/*`,
  `frontend/src/hooks/use-appstore.ts`, `frontend/src/types/appstore.ts`,
  `frontend/src/router.tsx`, `frontend/src/locales/{en,ru}.json`
- Docker: `compose.yml`; доки: `docs/golden-template.md`
