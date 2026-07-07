# App Store — M0 Proof of Concept

Изолированный backend-каркас, который вручную проверяет ключевую схему модуля
App Store: **create (из золотого шаблона) → push → exec → health-check** для
одного приложения. Роутеры FastAPI НЕ регистрируются — работающая панель не
затрагивается. Это seed будущего `services/appstore_engine.py`.

Код: `backend/app/appstore/` (`pipeline.py`, `cli.py`, `samples/`).

## Предпосылки

1. **Золотой шаблон LXC** уже подготовлен и лежит как `vztmpl` в storage ноды:
   - Debian 12, unprivileged;
   - предустановлены Docker Engine + Docker Compose plugin, `curl`, `jq`;
   - экспортирован в шаблон (`vzdump` → файл в `…/template/cache/*.tar.zst`),
     видимый как `local:vztmpl/<имя>.tar.zst`.
   - Features `nesting=1,keyctl=1` PoC выставляет сам при создании CT (это
     параметр контейнера, а не свойство шаблона).
2. **SSH-доступ панели к ноде root-ом** (тот же механизм, что использует остальная
   панель — `setup_ssh.sh` / пароль root на сервере). Нужен для `pct exec`/`pct push`.
3. Proxmox-сервер уже добавлен в панель (есть `server_id` в БД).
4. Запуск — в окружении бэкенда (доступ к БД панели и `FERNET_KEY`), например
   внутри backend-контейнера: `docker compose exec app python -m app.appstore.cli ...`.

## Запуск

Установка тестового приложения (по умолчанию — uptime-kuma, одно­сервисное):

```bash
python -m app.appstore.cli install \
    --server-id 1 \
    --ostemplate local:vztmpl/golden-docker_12_amd64.tar.zst \
    --name poc-uptime-kuma \
    --port 3001
```

Опционально: `--node`, `--storage`, `--bridge`, `--cores`, `--memory`, `--disk`,
`--compose-file <path>`, `--env-file <path>`.

Повторяемость — снести контейнер:

```bash
python -m app.appstore.cli teardown --server-id 1 --vmid <VMID>
```

## Что делает пайплайн (`pipeline.poc_install`)

1. `_get_proxmox_client()` → подключение к Proxmox, выбор ноды.
2. `create_lxc_container(ostemplate=<golden>, features="nesting=1,keyctl=1", …)` +
   `wait_for_task` — контейнер из золотого шаблона.
3. `start_container` → ожидание IP (`pct exec … hostname -I`).
4. `mkdir /opt/app /opt/app-data`, создание Docker-сети `tipi_main_network`.
5. Доставка `docker-compose.yml` и `.env` через **base64 → файл на ноде →
   `pct push`** (без shell-инъекций, S-4).
6. `pct exec … docker compose --env-file .env up -d`.
7. Health-check `GET http://<ip>:<port>` (ретраи 5с, любой HTTP-ответ = успех).

Прогресс шагов печатается в лог (в реальном движке станет WS-broadcast'ом).

## Definition of Done (M0)

- Из золотого шаблона поднимается контейнер, и `docker compose up` тестового
  приложения проходит с первой попытки.
- `poc install` завершается статусом `running`, выводит `http://IP:порт`, и
  Uptime Kuma открывается по этому адресу.

## Известные ограничения PoC

- Нет записи в БД (таблицы `installed_apps`/`app_operations` — этап M1+); PoC
  наблюдаем только по логам и через сам Proxmox.
- Health-check IP определяется через `hostname -I` (DHCP). Статический IP из IPAM
  — на следующем этапе (готовый `ipam_service` уже есть).
- Для «тяжёлых»/privileged приложений unprivileged LXC может не подойти — это
  ожидаемо и отражено в рисках ТЗ.
