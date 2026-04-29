# Отчет об исправлении ошибок в PVEManager

## Проблема
При попытке выполнить следующие операции возвращались HTTP 400 ошибки:
- Переустановка ВМ: `POST /api/{server_id}/vm/{vmid}/reinstall`
- Смена пароля ВМ: `POST /api/{server_id}/vm/{vmid}/change-password`
- Смена пароля LXC: `POST /api/{server_id}/container/{vmid}/change-password`

**Ошибка в логах**:
```
2026-04-30 01:26:56 | ERROR | logging:callHandlers:1762 - Database session error: 400: Invalid action
2026-04-30 01:26:56 | WARNING | app.main:custom_http_exception_handler:265 - HTTP exception: 400 - Invalid action
```

## Причина
В файле `backend/app/logging_service.py` в методе `log_proxmox_action` отсутствовали соответствия для новых типов операций в словаре `action_messages`. Когда система пыталась залогировать операцию, она не находила её описание и возвращала ошибку 400.

### Был код:
```python
action_messages = {
    "start": "started",
    "stop": "stopped",
    "restart": "restarted",
    "shutdown": "shutdown",
    "delete": "deleted",
    "create": "created",
    "clone": "cloned",
    "migrate": "migrated",
    "backup": "backup created",
    "restore": "restored",
    "snapshot": "snapshot created",
    "resize": "disk resized",
    "console": "console accessed",
    "config_update": "config updated"
    # ОТСУТСТВОВАЛИ 'reinstall' и 'change-password'
}
```

## Решение
Добавлены два недостающих типа операций в словарь `action_messages`:

### Исправленный код:
```python
action_messages = {
    "start": "started",
    "stop": "stopped",
    "restart": "restarted",
    "shutdown": "shutdown",
    "delete": "deleted",
    "create": "created",
    "clone": "cloned",
    "migrate": "migrated",
    "backup": "backup created",
    "restore": "restored",
    "snapshot": "snapshot created",
    "resize": "disk resized",
    "console": "console accessed",
    "config_update": "config updated",
    "reinstall": "reinstalled",          # ← ДОБАВЛЕНО
    "change-password": "password changed" # ← ДОБАВЛЕНО
}
```

## Файлы изменён
- `backend/app/logging_service.py` (строка 265-281)

## Проверка исправления

### Что было протестировано:
✅ LoggingService.log_proxmox_action() - все 16 типов операций присутствуют
✅ Endpoint'ы для новых операций доступны:
  - POST /api/{server_id}/vm/{vmid}/reinstall
  - POST /api/{server_id}/vm/{vmid}/change-password
  - POST /api/{server_id}/container/{vmid}/change-password
✅ Методы ProxmoxClient работают:
  - change_vm_password()
  - change_container_password()
  - clone_vm()
  - clone_container()
  - delete_vm()
  - delete_container()

### Результат тестирования:
```
============================================================
Test Results Summary
============================================================
LoggingService: ✅ PASSED
VM Operations: ✅ PASSED
ProxmoxClient Methods: ✅ PASSED
============================================================
✅ All tests passed!
```

## Деталь операций

### 1. Переустановка ВМ/LXC
Путём переустановки система:
1. Сохраняет текущую конфигурацию (CPU, память, имя, описание)
2. Останавливает текущую инстанцию
3. Удаляет её (без архивирования)
4. Клонирует заново из исходного шаблона
5. Переприменяет сохранённую конфигурацию

Используемые методы: `clone_vm()`, `clone_container()`, `delete_vm()`, `delete_container()`

### 2. Смена пароля ВМ
Изменяет пароль через QEMU guest agent:
- Требует установленный `qemu-guest-agent` в ВМ
- Работает только для запущенных ВМ
- Пароль передаётся в открытом виде через API (используйте HTTPS в продакшене)

Используемый метод: `change_vm_password()`

### 3. Смена пароля LXC
Изменяет пароль через выполнение команды `chpasswd` в контейнере:
- Требует наличие утилиты `chpasswd` в контейнере
- Работает только для запущенных контейнеров
- Использует формат "user:password" для chpasswd

Используемый метод: `change_container_password()`

## Логирование

Все три операции теперь правильно логируются в таблицу `audit_logs`:

```sql
SELECT id, action, resource_type, resource_id, success, created_at 
FROM audit_logs 
WHERE action IN ('reinstall', 'change-password') 
ORDER BY created_at DESC;
```

## Примечание о безопасности

⚠️ **При использовании операции смены пароля через незащищённый HTTP:**
- Пароли передаются в открытом виде
- Используйте HTTPS в продакшене
- Установите переменную окружения `FERNET_KEY` для шифрования паролей в БД

## Версия
Исправление применяется в v1.4.0 и позже.

## Статус
✅ **ГОТОВО К ИСПОЛЬЗОВАНИЮ**

Все новые операции работают корректно и полностью интегрированы в систему логирования.
