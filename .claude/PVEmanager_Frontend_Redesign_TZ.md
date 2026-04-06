# ТЕХНИЧЕСКОЕ ЗАДАНИЕ
## Редизайн фронтенда PVEmanager

*Переход на компонентную архитектуру в стиле облачных провайдеров*

| | |
|---|---|
| **Проект** | PVEmanager |
| **Версия ТЗ** | 1.0 |
| **Дата** | 07.04.2026 |
| **Автор** | DevOps / CTO |
| **Статус** | Черновик |

> Eskiz (AS35682) / Innasoft Digital Service LLC

---

# 1. Введение

## 1.1 О проекте

PVEmanager — self-hosted веб-панель для управления несколькими серверами Proxmox VE. Полный жизненный цикл VM/LXC, RBAC, VNC/xterm.js-консоль, IPAM, SDN, мониторинг в реальном времени, уведомления (Email, Telegram), аудит-лог.

## 1.2 Текущий стек

| Компонент | Технология | Проблема |
|---|---|---|
| Бэкенд | Python 3.12, FastAPI, SQLAlchemy | Остаётся без изменений |
| Шаблоны | Jinja2 (20 файлов, 26 159 строк) | Монолитные файлы до 4 700 строк |
| JavaScript | Vanilla JS (inline в HTML) | 1 500+ ручных DOM-манипуляций |
| CSS-фреймворк | Bootstrap 5 + theme.css (3 487 строк) | Большая часть переопределена кастомным CSS |
| Графики | Chart.js | Ограниченная интерактивность |
| Консоль | noVNC, xterm.js | Остаётся |
| БД | PostgreSQL 16 | Остаётся |

## 1.3 Цели редизайна

1. Перевести фронтенд на компонентную SPA-архитектуру (React + TypeScript)
2. Достичь визуального качества уровня DigitalOcean / Hetzner Cloud / Vultr
3. Улучшить поддерживаемость: от 26K строк Jinja2 к реиспользуемым компонентам
4. Сохранить 100% функциональности текущего фронтенда
5. Унифицировать стек с Eskiz Panel (React + FastAPI)

## 1.4 Эталонные интерфейсы

Дизайн должен соответствовать UX-паттернам следующих панелей облачных провайдеров:

- **DigitalOcean Cloud Console** — чистый layout, группировка навигации, проектная структура
- **Hetzner Cloud** — минимализм, табы на детальной странице, тёмная тема
- **Vultr** — inline-метрики, компактные карточки серверов
- **ConvoyPanel** — open-source Proxmox-панель на React, референс по компонентной архитектуре

---

# 2. Целевой технологический стек

| Слой | Технология | Назначение |
|---|---|---|
| Фреймворк | React 19 + TypeScript | SPA, компонентная архитектура |
| Сборка | Vite 6 | HMR, быстрая сборка |
| UI-компоненты | shadcn/ui (Radix UI) | Акcессибилити, контроль над кодом |
| CSS | Tailwind CSS 4 | Утилитарный CSS, dark/light темы |
| Роутинг | React Router 7 / TanStack Router | Клиентская маршрутизация |
| Состояние | Zustand | Легковесный state management |
| Запросы | TanStack Query (React Query) | Кэш, рефетч, оптимистические обновления |
| Таблицы | TanStack Table | Сортировка, фильтрация, пагинация, выделение |
| Графики | Recharts / Tremor | Метрики, area-графики, sparkline |
| Иконки | Lucide React | Единый стиль, 1 400+ иконок |
| WebSocket | Нативный WebSocket API | Метрики реального времени, задачи |
| VNC | noVNC (ES module) | Консоль VM |
| Терминал | xterm.js + xterm-addon-fit | Консоль LXC |
| i18n | react-i18next | Русский / English |

---

# 3. Архитектура

## 3.1 Структура проекта

```
frontend/
├── src/
│   ├── components/         # Общие UI-компоненты (Button, Modal, Table, …)
│   ├── components/ui/      # shadcn/ui примитивы
│   ├── features/           # Функциональные модули
│   │   ├── dashboard/      # Дашборд
│   │   ├── instances/      # VM + LXC список и детали
│   │   ├── nodes/          # Узлы Proxmox
│   │   ├── ipam/           # IP-менеджмент
│   │   ├── templates/      # OS-шаблоны
│   │   ├── backups/        # Бэкапы
│   │   ├── console/        # noVNC + xterm.js (отдельная вкладка браузера)
│   │   ├── settings/       # Настройки
│   │   ├── users/          # Пользователи и RBAC
│   │   └── logs/           # Аудит-лог
│   ├── hooks/              # useAuth, useWebSocket, useMetrics, …
│   ├── lib/                # API-клиент, утилиты, константы
│   ├── layouts/            # AppLayout, AuthLayout
│   ├── stores/             # Zustand-сторы
│   ├── locales/            # ru.json, en.json
│   └── types/              # TypeScript-типы (VM, Node, User, …)
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## 3.2 API-слой

FastAPI остаётся без изменений. Удаляются только Jinja2-роуты (эндпоинты с `TemplateResponse`). JSON API-эндпоинты сохраняются как есть. WebSocket-эндпоинты (`/ws/tasks`, `/ws/metrics`) сохраняются.

## 3.3 Аутентификация

Текущая схема JWT + session token сохраняется. React-клиент хранит токен в localStorage (как сейчас), проактивный refresh за 2 минуты до истечения. Protected routes через React Router guard.

---

# 4. Дизайн-система

## 4.1 Цветовая палитра

Тёмная тема по умолчанию, светлая по переключению. Flat-цвета без градиентов на кнопках и карточках.

| Токен | Dark | Light | Назначение |
|---|---|---|---|
| `surface-0` | `#09090B` | `#FFFFFF` | Фон приложения |
| `surface-1` | `#111113` | `#FAFAFA` | Карточки, сайдбар |
| `surface-2` | `#1A1A1F` | `#F4F4F5` | Hover, выделение строк |
| `border` | `#222228` | `#E4E4E7` | Границы |
| `text-primary` | `#F0F0F3` | `#09090B` | Основной текст |
| `text-secondary` | `#A0A0AB` | `#71717A` | Вторичный текст |
| `blue` (primary) | `#3B82F6` | `#2563EB` | Акцент, CTA, ссылки |
| `green` | `#22C55E` | `#16A34A` | Статус online/running |
| `red` | `#EF4444` | `#DC2626` | Статус offline, ошибки, danger |
| `amber` | `#F59E0B` | `#D97706` | Предупреждения, средняя нагрузка |

## 4.2 Типографика

Основной шрифт: **DM Sans** (Google Fonts). Моноширинный: **JetBrains Mono** (для IP-адресов, ID, консоли).

| Элемент | Размер | Вес |
|---|---|---|
| Заголовок страницы | 22px | 650 (semibold) |
| Заголовок секции | 13–14px | 600 |
| Основной текст | 13px | 450 |
| Метки (labels) | 11px | 600, uppercase, letter-spacing 0.06em |
| Стат-цифры | 28px | 700, tabular-nums |
| Моно (IP, ID) | 12px | JetBrains Mono 400 |

## 4.3 Компоненты

Все компоненты из shadcn/ui с кастомизацией под дизайн-систему:

| Компонент | Источник | Кастомизация |
|---|---|---|
| Button | shadcn/ui | Flat-стиль, без градиентов, border-radius 7px |
| Dialog / Modal | shadcn/ui (Radix) | Заменяет 65 модалок Bootstrap |
| DropdownMenu | shadcn/ui (Radix) | Контекстные меню VM (три точки) |
| Select / Combobox | shadcn/ui | Фильтры по нодам, статусам |
| Tabs | shadcn/ui (Radix) | All / VM / LXC, детальная страница VM |
| Tooltip | shadcn/ui (Radix) | Подсказки на иконках |
| Toast | sonner | Уведомления о действиях |
| StatusDot | Кастом | Индикатор online/running/stopped |
| MetricRing | Кастом (SVG) | Кольцевой индикатор CPU на нодах |
| Sparkline | Кастом (SVG) | Мини-графики в карточках ресурсов |
| Tag | Кастом | Цветные теги VM (production, dev, …) |
| ConsoleView | Кастом | Обёртка noVNC/xterm.js. Открывается в отдельной вкладке (route `/console/:serverId/:vmid`) |

---

# 5. Спецификация страниц

## 5.1 Layout

Фиксированный sidebar (232px) с группировкой навигации: **Infrastructure** / **Network** / **Management**. Сверху — лого + workspace-селектор. Снизу — аватар пользователя + роль. Top bar: статус-индикатор системы + колокольчик уведомлений. Мобильный: sidebar складывается в hamburger.

## 5.2 Dashboard

- 4 stat-карточки: Nodes, VM, Containers, Alerts. Каждая: метка, цифра, подпись, иконка
- 3 ресурсных карточки: CPU / Memory / Storage. Sparkline-график + progress bar + % значение
- Таблица Instances (6 строк): name, node, cpu, ram, status. Ссылка «View all»
- Панель Nodes: кольцевой индикатор CPU, имя, VM/CT count, uptime, статус
- Лента Recent Activity: время, пользователь, действие (цветной badge), ресурс
- Автообновление через WebSocket (метрики) и polling (список VM, 30с)

## 5.3 Instances (список VM/LXC)

- Табы: All (N) / VM (N) / LXC (N) с каунтерами
- Поиск по имени и IP. Фильтры: статус, нода, теги
- Таблица: checkbox, name (#id), status (точка), node, type (VM/LXC badge), IP, CPU (inline progress bar), Memory, Disk, Tags, меню (три точки)
- Bulk actions: Start / Stop / Delete (появляются при выделении)
- Контекстное меню: Console, Start/Restart, Stop, Snapshot
- Пагинация в футере таблицы
- Кнопка «Create Instance» в шапке страницы

## 5.4 Instance Detail (детальная страница VM/LXC)

Ключевое изменение: вместо одной длинной страницы — горизонтальные табы (как у Hetzner):

| Таб | Содержимое |
|---|---|
| **Overview** | Инфо-карточка (IP, OS, vCPU, RAM, Disk, нода), 4 metric-карточки (CPU, RAM, Disk, Uptime), сетевой трафик |
| **Graphs** | Area-графики CPU/RAM/Network/Disk I/O с переключением периода (1h/6h/24h/7d/30d) |
| **Console** | Открывается в отдельной вкладке браузера (`window.open`). Полноэкранный noVNC (VM) / xterm.js (LXC) с тулбаром (Send Ctrl+Alt+Del, Clipboard, Fullscreen). Без sidebar и top bar — только консоль. |
| **Snapshots** | Список снапшотов с действиями: create, rollback, delete |
| **Backups** | История бэкапов, запуск ручного бэкапа |
| **Networking** | IP-адреса, сетевые интерфейсы, firewall-правила |
| **Commands** | Быстрые команды + произвольный bash-скрипт (QEMU Guest Agent) |
| **Settings** | Resize (CPU/RAM/Disk), перенос владельца, теги |
| **Destroy** | Удаление с подтверждением (ввод имени VM) |

Шапка страницы: имя VM, статус, кнопки действий (Power On/Off, Restart, Console → новая вкладка) в одну линию.

## 5.5 Остальные страницы

| Страница | Ключевые изменения |
|---|---|
| **Nodes** | Карточки с MetricRing + клик → детальная страница ноды |
| **Templates** | Grid-сетка карточек OS с иконками дистрибутивов |
| **Backups** | Таблица + статусы + расписание |
| **IPAM** | Три-уровневая: сети → подсети → адреса. Визуализация занятости |
| **Logs** | Лог-таблица с фильтрами, expandable rows |
| **Settings** | Табы: General / Notifications / Security / About |
| **Users** | Таблица + модальное создание/редактирование |
| **Login** | Центрированная форма, лого, ошибки валидации |

---

# 6. План работ и фазы

| Фаза | Срок | Содержание | Результат |
|---|---|---|---|
| **1. Каркас** | 2–3 нед. | Vite + React + TS + shadcn/ui + Tailwind. Layout (сайдбар, top bar). Auth (логин, guards). Dashboard. | Работающий dashboard, логин |
| **2. Instances** | 3–4 нед. | Список VM/LXC. Detail с табами. Create VM wizard. Console (noVNC + xterm.js). | Основной функционал VM |
| **3. Доп. страницы** | 2–3 нед. | Nodes, Templates, Backups, IPAM, Logs, Settings, Users, Workspaces. | Полный паритет с текущим UI |
| **4. Полировка** | 1–2 нед. | i18n (ru/en), мобильная адаптация, empty states, анимации, тестирование. | Продакшн-готовность |

**Итого: 8–12 недель при работе одного разработчика.**

---

# 7. Изменения на бэкенде

## 7.1 Удалить

- Jinja2-роуты (`TemplateResponse`) — все эндпоинты с `include_in_schema=False`
- Папку `templates/` (все 20 HTML-файлов)
- Папку `static/` (CSS, JS, img) — заменяется Vite-сборкой
- `template_helpers.py`, `language_middleware.py`, `i18n.py`
- Зависимость `Jinja2` из `requirements.txt`

## 7.2 Сохранить без изменений

- Все JSON API-эндпоинты (19 файлов роутеров, 12 147 строк)
- WebSocket-эндпоинты (`/ws/tasks`, метрики)
- RBAC, auth, models, schemas, services, workers
- `proxmox_client.py`, `ssh_client.py`
- Docker-конфигурация (добавить сервис frontend)

## 7.3 Добавить

- CORS: разрешить оригин фронтенда (`localhost:5173` для dev, продакшн-домен)
- Nginx: проксирование `/api/*` → FastAPI, остальное → SPA (`index.html`)
- Docker: новый сервис frontend с Nginx или multi-stage build

---

# 8. Деплой и инфраструктура

Фронтенд собирается в статику (`vite build`) и отдаётся через Nginx. Два варианта:

- **Вариант A (рекомендуется):** Отдельный Docker-контейнер frontend: `node:22-alpine` для build stage, `nginx:alpine` для serve.
- **Вариант B:** Сборка в CI/CD, копирование `dist/` в существующий Nginx-контейнер.

Nginx-конфиг для SPA:

```nginx
location /api/ {
    proxy_pass http://backend:8000/;
}

location /ws/ {
    proxy_pass http://backend:8000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location / {
    try_files $uri $uri/ /index.html;
}
```

---

# 9. Критерии приёмки

1. Все существующие функции работают идентично текущему UI
2. Визуальное соответствие прототипам (Dashboard + VM List)
3. Dark / Light темы работают корректно
4. i18n: полный перевод RU/EN
5. Мобильная адаптация на экранах от 320px
6. Lighthouse Performance ≥ 85
7. VNC/xterm.js консоль работает без регрессий (открывается в отдельной вкладке)
8. WebSocket-метрики обновляются в реальном времени
9. Нет зависимости от Bootstrap
10. Docker-сборка работает через `docker compose up -d`

---

# 10. Риски

| Риск | Вероятность | Митигация |
|---|---|---|
| Регрессия функционала | Средняя | Пофазный перенос, параллельная работа старого UI |
| noVNC/xterm.js совместимость | Низкая | Используются как ES-модули, React-обёртки существуют |
| Увеличение сроков | Средняя | Начать с критических страниц (Dashboard, Instances) |
| Потеря i18n-переводов | Низкая | Миграция `ru.json`/`en.json` в react-i18next |

---

*Конец документа*
