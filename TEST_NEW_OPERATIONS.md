# Тестирование новых операций PVEManager

## Недавно добавленные операции

### 1. Переустановка ВМ (Reinstall)
**Endpoint**: `POST /api/{server_id}/vm/{vmid}/reinstall`
**Параметры**:
- `server_id` - ID сервера Proxmox
- `vmid` - ID виртуальной машины
- `node` (query) - имя ноды

**Описание**: Переустанавливает ВМ или LXC контейнер путём:
1. Остановки текущей инстанции
2. Удаления её (без архивирования снапшотов)
3. Клонирования заново из исходного шаблона
4. Переприменения конфигурации (CPU cores, память)

**Требования**:
- Пользователь должен иметь права `vms.delete`
- ВМ должна быть связана с шаблоном (храниться в `template_id`)
- Доступ к ВМ (владелец или администратор)

**Логирование**: `action='reinstall'` в audit log

---

### 2. Смена пароля на ВМ
**Endpoint**: `POST /api/{server_id}/vm/{vmid}/change-password`
**Параметры JSON**:
- `username` - имя пользователя в ВМ
- `password` - новый пароль (минимум 4 символа)

**Описание**: Изменяет пароль пользователя на ВМ через QEMU guest agent

**Требования**:
- Пользователь должен иметь права `vms.console`
- На ВМ должен быть установлен `qemu-guest-agent`
- ВМ должна быть запущена

**Логирование**: `action='change-password'`, `resource_type='vm'`

---

### 3. Смена пароля в LXC контейнере
**Endpoint**: `POST /api/{server_id}/container/{vmid}/change-password`
**Параметры JSON**:
- `username` - имя пользователя в контейнере
- `password` - новый пароль (минимум 4 символа)

**Описание**: Изменяет пароль пользователя в LXC контейнере через `chpasswd`

**Требования**:
- Пользователь должен иметь права `vms.console`
- Контейнер должен быть запущен
- В контейнере должна быть утилита `chpasswd`

**Логирование**: `action='change-password'`, `resource_type='lxc'`

---

## Исправления в v1.4.0+

### Логирование операций
Исправлена ошибка в `backend/app/logging_service.py` где отсутствовали соответствия для новых операций:

**До**:
```python
action_messages = {
    "start": "started",
    "stop": "stopped",
    # ... другие операции ...
    # 'reinstall' НЕ был здесь
    # 'change-password' НЕ был здесь
}
```

**После**:
```python
action_messages = {
    "start": "started",
    "stop": "stopped",
    # ... другие операции ...
    "reinstall": "reinstalled",  # ← добавлено
    "change-password": "password changed"  # ← добавлено
}
```

Это исправляет ошибку `HTTP 400: Invalid action` при выполнении операций.

---

## Способность к тестированию

Все операции:
1. ✅ Имеют правильные endpoint'ы
2. ✅ Имеют правильную авторизацию (PermissionChecker)
3. ✅ Имеют правильное логирование (LoggingService)
4. ✅ Имеют поддержку как для VM (qemu), так и для контейнеров (lxc)
5. ✅ Имеют обработку ошибок
6. ✅ Имеют проверку доступа пользователя (require_vm_access)

---

## Использование в клиентском коде

### Переустановка ВМ (JavaScript/TypeScript)
```javascript
const response = await fetch(`/proxmox/api/${serverId}/vm/${vmid}/reinstall?node=${node}`, {
  method: 'POST',
});
const result = await response.json();
// result = { status: "success", vmid: 111, upid: "UPID:..." }
```

### Смена пароля ВМ
```javascript
const response = await fetch(`/proxmox/api/${serverId}/vm/${vmid}/change-password?node=${node}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'root',
    password: 'newpassword123'
  })
});
// result = { status: "success" }
```

### Смена пароля LXC
```javascript
const response = await fetch(`/proxmox/api/${serverId}/container/${vmid}/change-password?node=${node}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'root',
    password: 'newpassword123'
  })
});
// result = { status: "success" }
```

---

## Автоматическое тестирование

Все операции успешно логируются и могут быть проверены в таблице `audit_logs`:

```sql
SELECT action, resource_type, resource_id, success FROM audit_logs 
WHERE action IN ('reinstall', 'change-password') 
ORDER BY created_at DESC LIMIT 10;
```

---

## Проверка статуса операций

### Переустановка ВМ отслеживается через:
- `audit_logs` - логирование действия
- Proxmox API task (UPID) - отслеживание хода выполнения
- `vm_instances` - обновление конфигурации ВМ

### Смена пароля отслеживается через:
- `audit_logs` - логирование действия с указанием целевого пользователя
- Proxmox guest agent API - выполнение команды

Все операции полностью интегрированы и готовы к использованию.
