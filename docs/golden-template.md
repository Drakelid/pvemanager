# Золотой шаблон LXC для App Store

> **Есть автоматизация:** App Store → «Золотой шаблон» в UI (или `POST /api/appstore/golden-template`)
> прогоняет ровно эти шаги за вас на выбранном сервере/ноде (`backend/app/appstore/golden_template.py`).
> Результат сохраняется **отдельно по каждому Proxmox-серверу** (`server_id`) — vztmpl физически
> лежит на storage конкретного сервера и не виден на других, поэтому сборка на одном сервере не
> заменяет и не ломает шаблон, настроенный для другого. Ручная процедура ниже нужна только для
> отладки/кастомизации шага, которого нет в автоматизации.

Разовая ручная подготовка (ТЗ 4). Из этого шаблона App Engine клонирует контейнеры
для приложений. Результат — файл `vztmpl` в storage ноды, на который указывает
переменная `APPSTORE_GOLDEN_TEMPLATE` (напр. `local:vztmpl/golden-docker_12_amd64.tar.zst`) —
это лишь дефолт-фоллбэк для серверов, для которых ещё не собран свой шаблон.

## Требования к шаблону (ТЗ 4.1)
- Debian 12 (bookworm), **unprivileged**.
- Features `nesting=1,keyctl=1` (App Engine выставляет их при создании CT, но полезно проверить).
- Предустановлено: Docker Engine (stable), Docker Compose plugin, `curl`, `jq`.
- Docker-сеть `tipi_main_network` (создаётся при первом старте контейнера движком, но
  можно создать заранее — compose-файлы Runtipi ссылаются на неё как external).
- Каталоги `/opt/app-data` (APP_DATA_DIR) и `/opt/app` (compose + .env).
- logrotate для Docker json-file логов (max-size=10m, max-file=3).

## Пошагово

1. Создать временный unprivileged CT из стандартного шаблона Debian 12 на ноде.

   > ⚠️ Не хардкодьте версию шаблона. Точное имя (напр. `debian-12-standard_12.12-1_amd64.tar.zst`)
   > меняется со временем — всегда берите его из вывода `pveam available`, иначе `pveam download`
   > упадёт с `no such template`, а `pct create` — с `volume ... does not exist`.

   ```bash
   pveam update
   # 1a. Узнать актуальное имя шаблона (версия ниже — только пример):
   pveam available --section system | grep debian-12-standard
   # -> system  debian-12-standard_12.12-1_amd64.tar.zst   (используйте это имя далее)

   # 1b. Скачать именно это имя в storage local:
   TMPL=debian-12-standard_12.12-1_amd64.tar.zst   # подставьте имя из вывода 1a
   pveam download local "$TMPL"

   # 1c. Убедиться, что файл реально появился в vztmpl:
   pvesm list local --content vztmpl

   # 1d. Создать CT, указав ТО ЖЕ имя, что скачали:
   pct create 9000 "local:vztmpl/$TMPL" \
       --hostname golden-docker --unprivileged 1 \
       --features nesting=1,keyctl=1 \
       --cores 2 --memory 2048 --swap 512 \
       --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp
   pct start 9000
   ```

2. Внутри контейнера установить Docker и утилиты:
   ```bash
   pct exec 9000 -- bash -lc '
     apt-get update &&
     apt-get install -y ca-certificates curl jq gnupg &&
     install -m 0755 -d /etc/apt/keyrings &&
     curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc &&
     chmod a+r /etc/apt/keyrings/docker.asc &&
     echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list &&
     apt-get update &&
     apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin &&
     systemctl enable docker
   '
   ```

3. Подготовить каталоги, сеть и logrotate:
   ```bash
   pct exec 9000 -- bash -lc '
     mkdir -p /opt/app /opt/app-data &&
     docker network inspect tipi_main_network >/dev/null 2>&1 || docker network create tipi_main_network &&
     cat >/etc/docker/daemon.json <<EOF
   { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
   EOF
     systemctl restart docker
   '
   ```

4. Проверка (Definition of Done, ТЗ 4.2): тестовый nginx поднимается с первой попытки:
   ```bash
   pct exec 9000 -- bash -lc '
     mkdir -p /opt/app && cd /opt/app &&
     printf "services:\n  web:\n    image: nginx:alpine\n    ports:\n      - \"80:80\"\n" > docker-compose.yml &&
     docker compose up -d && sleep 3 && curl -sf http://localhost:80 >/dev/null && echo OK
   '
   pct exec 9000 -- bash -lc 'cd /opt/app && docker compose down'
   ```

5. Очистить временное состояние и превратить в шаблон:
   ```bash
   pct exec 9000 -- bash -lc 'apt-get clean && rm -rf /var/lib/apt/lists/* /opt/app/docker-compose.yml'
   pct stop 9000
   # Экспорт в vztmpl-шаблон через vzdump:
   vzdump 9000 --dumpdir /var/lib/vz/template/cache --mode stop --compress zstd
   ```
   Полученный файл появится как `local:vztmpl/vzdump-lxc-9000-*.tar.zst`. Переименуйте по вкусу,
   напр. `golden-docker_12_amd64.tar.zst`, и удалите временный CT 9000.

   > Примечание: если в вашей версии Proxmox `vzdump` кладёт архив в `dump/`, скопируйте
   > его в `template/cache/`, чтобы он был виден как `vztmpl` при создании контейнеров.

6. Указать движку шаблон:
   ```
   APPSTORE_GOLDEN_TEMPLATE=local:vztmpl/golden-docker_12_amd64.tar.zst
   ```
   (env бэкенда; см. docs/appstore-engine.md).

## Пересоздание
Шаблон готовится заново по этому же списку при обновлении Docker/Debian. arm64 —
аналогично, из arm64-шаблона Debian на ARM-ноде (см. `APPSTORE_HOST_ARCH=arm64`).
