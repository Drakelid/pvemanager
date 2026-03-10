"""
Internationalization (i18n) service
Multi-language support for the panel
"""

from typing import Dict, Optional
from enum import Enum


class Language(str, Enum):
    """Supported languages"""
    RU = "ru"  # Russian
    EN = "en"  # English (US)


class I18nService:
    """Service for handling translations"""
    
    # Translation dictionary
    translations: Dict[str, Dict[str, str]] = {
        # Common
        "app_name": {
            "ru": "PVEmanager",
            "en": "PVEmanager"
        },
        "welcome": {
            "ru": "Добро пожаловать",
            "en": "Welcome"
        },
        "loading": {
            "ru": "Загрузка...",
            "en": "Loading..."
        },
        "save": {
            "ru": "Сохранить",
            "en": "Save"
        },
        "cancel": {
            "ru": "Отмена",
            "en": "Cancel"
        },
        "delete": {
            "ru": "Удалить",
            "en": "Delete"
        },
        "saved": {
            "ru": "Сохранено",
            "en": "Saved"
        },
        "none": {
            "ru": "Нет",
            "en": "None"
        },
        "total": {
            "ru": "Всего",
            "en": "Total"
        },
        
        # Notifications
        "notifications": {
            "ru": "Уведомления",
            "en": "Notifications"
        },
        "unread": {
            "ru": "Непрочитанные",
            "en": "Unread"
        },
        "critical": {
            "ru": "Критические",
            "en": "Critical"
        },
        "no_notifications": {
            "ru": "Нет уведомлений",
            "en": "No notifications"
        },
        "mark_all_read": {
            "ru": "Отметить все как прочитанные",
            "en": "Mark all as read"
        },
        "clear_all": {
            "ru": "Очистить все",
            "en": "Clear all"
        },
        "all_notifications_marked_read": {
            "ru": "Все уведомления отмечены как прочитанные",
            "en": "All notifications marked as read"
        },
        "notifications_deleted": {
            "ru": "Удалено уведомлений",
            "en": "Notifications deleted"
        },
        "success": {
            "ru": "Успех",
            "en": "Success"
        },
        "all": {
            "ru": "Все",
            "en": "All"
        },
        
        # Notification Settings
        "notification_channels": {
            "ru": "Каналы уведомлений",
            "en": "Notification Channels"
        },
        "notification_settings": {
            "ru": "Настройки уведомлений",
            "en": "Notification Settings"
        },
        "email_notifications": {
            "ru": "Email уведомления",
            "en": "Email Notifications"
        },
        "email_notifications_help": {
            "ru": "Отправлять уведомления на ваш email",
            "en": "Send notifications to your email"
        },
        "telegram_notifications": {
            "ru": "Telegram уведомления",
            "en": "Telegram Notifications"
        },
        "telegram_notifications_help": {
            "ru": "Отправлять уведомления в Telegram",
            "en": "Send notifications to Telegram"
        },
        "telegram_chat_id": {
            "ru": "Telegram Chat ID",
            "en": "Telegram Chat ID"
        },
        "telegram_chat_id_help": {
            "ru": "Напишите боту @userinfobot чтобы узнать ваш Chat ID",
            "en": "Message @userinfobot to get your Chat ID"
        },
        "verify": {
            "ru": "Проверить",
            "en": "Verify"
        },
        "critical_only": {
            "ru": "Только критические",
            "en": "Critical Only"
        },
        "critical_only_help": {
            "ru": "Внешние уведомления (Email/Telegram) только для критических событий",
            "en": "External notifications (Email/Telegram) only for critical events"
        },
        "quiet_hours": {
            "ru": "Тихие часы",
            "en": "Quiet Hours"
        },
        "quiet_hours_help": {
            "ru": "В это время внешние уведомления не отправляются (оставьте пустым для отключения)",
            "en": "External notifications are not sent during this time (leave empty to disable)"
        },
        "to": {
            "ru": "до",
            "en": "to"
        },
        "save_settings": {
            "ru": "Сохранить настройки",
            "en": "Save Settings"
        },
        "testing": {
            "ru": "Тестирование",
            "en": "Testing"
        },
        "test_inapp": {
            "ru": "Тест In-App",
            "en": "Test In-App"
        },
        "test_email": {
            "ru": "Тест Email",
            "en": "Test Email"
        },
        "test_telegram": {
            "ru": "Тест Telegram",
            "en": "Test Telegram"
        },
        "test_all_channels": {
            "ru": "Тест всех каналов",
            "en": "Test All Channels"
        },
        "inapp_notifications": {
            "ru": "In-App уведомления",
            "en": "In-App Notifications"
        },
        "browser_notifications": {
            "ru": "Уведомления в браузере",
            "en": "Browser notifications"
        },
        "smtp_configured": {
            "ru": "SMTP настроен",
            "en": "SMTP configured"
        },
        "smtp_not_configured": {
            "ru": "SMTP не настроен (администратор)",
            "en": "SMTP not configured (admin)"
        },
        "bot_configured": {
            "ru": "Бот настроен",
            "en": "Bot configured"
        },
        "bot_not_configured": {
            "ru": "Бот не настроен (администратор)",
            "en": "Bot not configured (admin)"
        },
        "available": {
            "ru": "Доступно",
            "en": "Available"
        },
        "unavailable": {
            "ru": "Недоступен",
            "en": "Unavailable"
        },
        "checking": {
            "ru": "Проверка...",
            "en": "Checking..."
        },
        "enabled": {
            "ru": "Включено",
            "en": "Enabled"
        },
        "disabled": {
            "ru": "Выключено",
            "en": "Disabled"
        },
        "notification_settings_saved": {
            "ru": "Настройки уведомлений сохранены",
            "en": "Notification settings saved"
        },
        "error_saving_settings": {
            "ru": "Ошибка сохранения настроек",
            "en": "Error saving settings"
        },
        "enter_chat_id": {
            "ru": "Введите Chat ID",
            "en": "Enter Chat ID"
        },
        "telegram_connected": {
            "ru": "Telegram подключён успешно!",
            "en": "Telegram connected successfully!"
        },
        "telegram_verify_error": {
            "ru": "Ошибка проверки Telegram",
            "en": "Telegram verification error"
        },
        "test_completed": {
            "ru": "Тест завершён",
            "en": "Test completed"
        },
        "testing": {
            "ru": "Тестирование...",
            "en": "Testing..."
        },
        "errors": {
            "ru": "Ошибки",
            "en": "Errors"
        },
        "test_error": {
            "ru": "Ошибка тестирования",
            "en": "Test error"
        },
        
        # SMTP and Telegram Channel Settings
        "notification_channel_config": {
            "ru": "Настройка каналов уведомлений",
            "en": "Notification Channel Configuration"
        },
        "smtp_host": {
            "ru": "SMTP сервер",
            "en": "SMTP Server"
        },
        "smtp_port": {
            "ru": "Порт",
            "en": "Port"
        },
        "smtp_user": {
            "ru": "Пользователь",
            "en": "Username"
        },
        "smtp_password": {
            "ru": "Пароль",
            "en": "Password"
        },
        "smtp_password_help": {
            "ru": "Используйте пароль приложения",
            "en": "Use app password"
        },
        "smtp_from": {
            "ru": "Email отправителя",
            "en": "From Email"
        },
        "telegram_token": {
            "ru": "Токен бота",
            "en": "Bot Token"
        },
        "telegram_token_help": {
            "ru": "Получите токен у @BotFather в Telegram",
            "en": "Get token from @BotFather in Telegram"
        },
        "test_connection": {
            "ru": "Тестировать",
            "en": "Test"
        },
        "smtp_settings_saved": {
            "ru": "Настройки SMTP сохранены",
            "en": "SMTP settings saved"
        },
        "telegram_settings_saved": {
            "ru": "Настройки Telegram сохранены",
            "en": "Telegram settings saved"
        },
        "enter_test_email": {
            "ru": "Введите email для тестового письма",
            "en": "Enter email for test message"
        },
        "enter_bot_token": {
            "ru": "Введите токен бота",
            "en": "Enter bot token"
        },
        "enter_chat_id_for_test": {
            "ru": "Введите Chat ID для тестового сообщения",
            "en": "Enter Chat ID for test message"
        },
        "test_email_sent": {
            "ru": "Тестовое письмо отправлено",
            "en": "Test email sent"
        },
        "test_email_error": {
            "ru": "Ошибка отправки тестового письма",
            "en": "Test email error"
        },
        "test_telegram_sent": {
            "ru": "Тестовое сообщение отправлено",
            "en": "Test message sent"
        },
        "test_telegram_error": {
            "ru": "Ошибка отправки тестового сообщения",
            "en": "Test message error"
        },
        "sending": {
            "ru": "Отправка...",
            "en": "Sending..."
        },
        
        "edit": {
            "ru": "Редактировать",
            "en": "Edit"
        },
        "add": {
            "ru": "Добавить",
            "en": "Add"
        },
        "search": {
            "ru": "Поиск",
            "en": "Search"
        },
        "filter": {
            "ru": "Фильтр",
            "en": "Filter"
        },
        "actions": {
            "ru": "Действия",
            "en": "Actions"
        },
        "status": {
            "ru": "Статус",
            "en": "Status"
        },
        "name": {
            "ru": "Название",
            "en": "Name"
        },
        "description": {
            "ru": "Описание",
            "en": "Description"
        },
        "created": {
            "ru": "Создано",
            "en": "Created"
        },
        "updated": {
            "ru": "Обновлено",
            "en": "Updated"
        },
        "success": {
            "ru": "Успешно",
            "en": "Success"
        },
        "error": {
            "ru": "Ошибка",
            "en": "Error"
        },
        "no_permission": {
            "ru": "Недостаточно прав для выполнения этого действия",
            "en": "You don't have permission to perform this action"
        },
        "server_not_found": {
            "ru": "Proxmox сервер не найден",
            "en": "Proxmox server not found"
        },
        "failed_to_connect": {
            "ru": "Не удалось подключиться к Proxmox серверу",
            "en": "Failed to connect to Proxmox server"
        },
        "cannot_delete_running_vm": {
            "ru": "Невозможно удалить работающую VM. Сначала остановите её.",
            "en": "Cannot delete a running VM. Stop it first."
        },
        "cannot_delete_running_container": {
            "ru": "Невозможно удалить работающий контейнер. Сначала остановите его.",
            "en": "Cannot delete a running container. Stop it first."
        },
        "vm_deleted": {
            "ru": "VM успешно удалена",
            "en": "VM deleted successfully"
        },
        "container_deleted": {
            "ru": "Контейнер успешно удалён",
            "en": "Container deleted successfully"
        },
        "warning": {
            "ru": "Предупреждение",
            "en": "Warning"
        },
        "info": {
            "ru": "Информация",
            "en": "Information"
        },
        "confirm": {
            "ru": "Подтвердить",
            "en": "Confirm"
        },
        "yes": {
            "ru": "Да",
            "en": "Yes"
        },
        "no": {
            "ru": "Нет",
            "en": "No"
        },
        
        # Navigation
        "nav_dashboard": {
            "ru": "Dashboard",
            "en": "Dashboard"
        },
        "nav_proxmox": {
            "ru": "Proxmox VE",
            "en": "Proxmox VE"
        },
        "nav_vms": {
            "ru": "Виртуальные машины",
            "en": "Virtual Machines"
        },
        "nav_templates": {
            "ru": "OS Шаблоны",
            "en": "OS Templates"
        },
        "nav_ipam": {
            "ru": "IPAM",
            "en": "IPAM"
        },
        "nav_backups": {
            "ru": "Резервные копии",
            "en": "Backups"
        },
        "nav_docker": {
            "ru": "Docker",
            "en": "Docker"
        },
        "backup_tab_backups": {
            "ru": "Резервные копии",
            "en": "Backups"
        },
        "backup_tab_storages": {
            "ru": "Хранилища",
            "en": "Storages"
        },
        "backup_tab_schedule": {
            "ru": "Расписание",
            "en": "Schedule"
        },
        "backup_list_title": {
            "ru": "Список резервных копий",
            "en": "Backup List"
        },
        "backup_storages_title": {
            "ru": "Хранилища Proxmox",
            "en": "Proxmox Storages"
        },
        "backup_jobs_title": {
            "ru": "Задания резервного копирования",
            "en": "Backup Jobs"
        },
        "backup_create": {
            "ru": "Создать бэкап",
            "en": "Create Backup"
        },
        "backup_create_title": {
            "ru": "Создать резервную копию",
            "en": "Create Backup"
        },
        "backup_restore_title": {
            "ru": "Восстановить из резервной копии",
            "en": "Restore from Backup"
        },
        "backup_restore_btn": {
            "ru": "Восстановить",
            "en": "Restore"
        },
        "backup_restore_started": {
            "ru": "Восстановление запущено",
            "en": "Restore started"
        },
        "backup_restore_storage": {
            "ru": "Хранилище для дисков",
            "en": "Target storage for disks"
        },
        "backup_restore_new_vmid": {
            "ru": "Новый VMID",
            "en": "New VMID"
        },
        "backup_restore_vmid_hint": {
            "ru": "Оставьте пустым для использования оригинального",
            "en": "Leave empty to use original VMID"
        },
        "backup_restore_start": {
            "ru": "Запустить после восстановления",
            "en": "Start after restore"
        },
        "backup_restore_unique": {
            "ru": "Сгенерировать уникальный MAC",
            "en": "Generate unique MAC"
        },
        "backup_add_storage": {
            "ru": "Добавить хранилище",
            "en": "Add Storage"
        },
        "backup_add_job": {
            "ru": "Добавить задание",
            "en": "Add Job"
        },
        "backup_edit_job": {
            "ru": "Редактировать задание",
            "en": "Edit Job"
        },
        "backup_storage_id": {
            "ru": "Хранилище",
            "en": "Storage"
        },
        "backup_storage_type": {
            "ru": "Тип хранилища",
            "en": "Storage Type"
        },
        "backup_storage_content": {
            "ru": "Типы контента",
            "en": "Content Types"
        },
        "backup_storage_shared": {
            "ru": "Общее",
            "en": "Shared"
        },
        "backup_storage_usage": {
            "ru": "Использование",
            "en": "Usage"
        },
        "backup_storage_path": {
            "ru": "Путь",
            "en": "Path"
        },
        "backup_storage_delete_confirm": {
            "ru": "Удалить хранилище из конфигурации Proxmox?",
            "en": "Remove this storage from Proxmox configuration?"
        },
        "backup_storage_deleted": {
            "ru": "Хранилище удалено",
            "en": "Storage deleted"
        },
        "backup_storage_added": {
            "ru": "Хранилище добавлено",
            "en": "Storage added"
        },
        "backup_col_type": {
            "ru": "Тип ВМ",
            "en": "VM Type"
        },
        "backup_col_filename": {
            "ru": "Файл",
            "en": "File"
        },
        "backup_col_size": {
            "ru": "Размер",
            "en": "Size"
        },
        "backup_col_date": {
            "ru": "Дата",
            "en": "Date"
        },
        "backup_col_format": {
            "ru": "Формат",
            "en": "Format"
        },
        "backup_mode": {
            "ru": "Режим",
            "en": "Mode"
        },
        "backup_compress": {
            "ru": "Сжатие",
            "en": "Compression"
        },
        "backup_keep": {
            "ru": "Хранить N последних",
            "en": "Keep last N backups"
        },
        "backup_keep_hint": {
            "ru": "0 — не удалять старые резервные копии",
            "en": "0 — do not auto-remove old backups"
        },
        "backup_notes": {
            "ru": "Заметка",
            "en": "Notes"
        },
        "backup_notes_placeholder": {
            "ru": "Описание резервной копии",
            "en": "Backup description"
        },
        "backup_started": {
            "ru": "Резервное копирование запущено",
            "en": "Backup started"
        },
        "backup_deleted": {
            "ru": "Резервная копия удалена",
            "en": "Backup deleted"
        },
        "backup_delete_confirm": {
            "ru": "Удалить резервную копию? Это действие необратимо.",
            "en": "Delete this backup? This action cannot be undone."
        },
        "backup_empty": {
            "ru": "Резервных копий нет",
            "en": "No backups found"
        },
        "backup_no_storages": {
            "ru": "Нет доступных хранилищ",
            "en": "No storages available"
        },
        "backup_no_jobs": {
            "ru": "Нет заданий резервного копирования",
            "en": "No backup jobs configured"
        },
        "backup_task_log": {
            "ru": "Лог задания",
            "en": "Task Log"
        },
        "backup_job_last_run": {
            "ru": "Последний запуск",
            "en": "Last Run"
        },
        "backup_job_enabled": {
            "ru": "Задание активно",
            "en": "Job enabled"
        },
        "backup_job_enable": {
            "ru": "Включить задание",
            "en": "Enable job"
        },
        "backup_job_disable": {
            "ru": "Отключить задание",
            "en": "Disable job"
        },
        "backup_job_triggered": {
            "ru": "Задание запущено",
            "en": "Job triggered"
        },
        "backup_job_delete_confirm": {
            "ru": "Удалить задание расписания?",
            "en": "Delete this backup job?"
        },
        "backup_run_now": {
            "ru": "Запустить сейчас",
            "en": "Run now"
        },
        "backup_vmids_hint": {
            "ru": "Список через запятую или 'all' для всех ВМ",
            "en": "Comma-separated list or 'all' for all VMs"
        },
        "backup_cron_hint": {
            "ru": "Пример: '0 2 * * *' — каждую ночь в 02:00 UTC",
            "en": "Example: '0 2 * * *' — every night at 02:00 UTC"
        },
        "select_storage": {
            "ru": "Выберите хранилище",
            "en": "Select storage"
        },
        "select_server_and_storage": {
            "ru": "Выберите сервер и хранилище",
            "en": "Select a server and storage"
        },
        "nav_logs": {
            "ru": "Логи",
            "en": "Logs"
        },
        "nav_settings": {
            "ru": "Настройки",
            "en": "Settings"
        },
        "nav_users": {
            "ru": "Пользователи",
            "en": "Users"
        },
        "nav_logout": {
            "ru": "Выход",
            "en": "Logout"
        },
        "collapse_sidebar": {
            "ru": "Свернуть",
            "en": "Collapse"
        },
        "expand_sidebar": {
            "ru": "Развернуть",
            "en": "Expand"
        },
        
        # Filter translations
        "all_types": {
            "ru": "Все типы",
            "en": "All types"
        },
        "all_statuses": {
            "ru": "Все статусы",
            "en": "All statuses"
        },
        "containers": {
            "ru": "Контейнеры",
            "en": "Containers"
        },
        
        # VM Actions
        "starting": {
            "ru": "Запуск",
            "en": "Starting"
        },
        "stopping": {
            "ru": "Остановка",
            "en": "Stopping"
        },
        "restarting": {
            "ru": "Перезапуск",
            "en": "Restarting"
        },
        "deleting": {
            "ru": "Удаление",
            "en": "Deleting"
        },
        "completed": {
            "ru": "выполнено",
            "en": "completed"
        },
        "operation_failed": {
            "ru": "Операция не выполнена",
            "en": "Operation failed"
        },
        "confirm_delete_vm": {
            "ru": "Вы уверены что хотите удалить",
            "en": "Are you sure you want to delete"
        },
        "deleted": {
            "ru": "удалена",
            "en": "deleted"
        },
        "delete_failed": {
            "ru": "Ошибка удаления",
            "en": "Delete failed"
        },
        "console": {
            "ru": "Консоль",
            "en": "Console"
        },
        "reinstall": {
            "ru": "Переустановить",
            "en": "Reinstall"
        },
        
        # Form messages
        "fill_all_fields": {
            "ru": "Заполните все обязательные поля",
            "en": "Fill all required fields"
        },
        "select_node": {
            "ru": "Выберите ноду",
            "en": "Select node"
        },
        "no_nodes": {
            "ru": "Нет доступных нод",
            "en": "No nodes available"
        },
        
        # Auth
        "login": {
            "ru": "Вход",
            "en": "Login"
        },
        "username": {
            "ru": "Имя пользователя",
            "en": "Username"
        },
        "password": {
            "ru": "Пароль",
            "en": "Password"
        },
        "login_button": {
            "ru": "Войти",
            "en": "Sign In"
        },
        "login_error": {
            "ru": "Неверное имя пользователя или пароль",
            "en": "Invalid username or password"
        },
        
        # Settings
        "settings": {
            "ru": "Настройки",
            "en": "Settings"
        },
        "settings_account": {
            "ru": "Аккаунт",
            "en": "Account"
        },
        "settings_panel": {
            "ru": "Панель",
            "en": "Panel"
        },
        "settings_language": {
            "ru": "Язык",
            "en": "Language"
        },
        "user_profile": {
            "ru": "Профиль пользователя",
            "en": "User Profile"
        },
        "full_name": {
            "ru": "Полное имя",
            "en": "Full Name"
        },
        "email": {
            "ru": "Email",
            "en": "Email"
        },
        "change_password": {
            "ru": "Изменить пароль",
            "en": "Change Password"
        },
        "current_password": {
            "ru": "Текущий пароль",
            "en": "Current Password"
        },
        "new_password": {
            "ru": "Новый пароль",
            "en": "New Password"
        },
        "confirm_password": {
            "ru": "Подтвердите пароль",
            "en": "Confirm Password"
        },
        "password_min_length": {
            "ru": "Минимум 6 символов",
            "en": "Minimum 6 characters"
        },
        "panel_settings": {
            "ru": "Настройки панели",
            "en": "Panel Settings"
        },
        "system_updates": {
            "ru": "Обновление системы",
            "en": "System Updates"
        },
        "current_version": {
            "ru": "Текущая версия",
            "en": "Current Version"
        },
        "latest_version": {
            "ru": "Последняя версия",
            "en": "Latest Version"
        },
        "check_updates": {
            "ru": "Проверить обновления",
            "en": "Check for Updates"
        },
        "checking_updates": {
            "ru": "Проверка...",
            "en": "Checking..."
        },
        "update_available": {
            "ru": "Доступно обновление",
            "en": "Update Available"
        },
        "no_updates": {
            "ru": "Установлена последняя версия",
            "en": "You have the latest version"
        },
        "update_now": {
            "ru": "Обновить сейчас",
            "en": "Update Now"
        },
        "updating_system": {
            "ru": "Обновление системы...",
            "en": "Updating system..."
        },
        "update_in_progress": {
            "ru": "Выполняется обновление",
            "en": "Update in Progress"
        },
        "update_warning": {
            "ru": "Панель будет недоступна во время обновления",
            "en": "Panel will be unavailable during update"
        },
        "update_success": {
            "ru": "Обновление завершено успешно",
            "en": "Update completed successfully"
        },
        "update_failed": {
            "ru": "Ошибка обновления",
            "en": "Update failed"
        },
        "update_changelog": {
            "ru": "Что нового",
            "en": "What's New"
        },
        "commits_behind": {
            "ru": "коммитов позади",
            "en": "commits behind"
        },
        "git_repository": {
            "ru": "Git-репозиторий",
            "en": "Git Repository"
        },
        "repository_url": {
            "ru": "URL репозитория",
            "en": "Repository URL"
        },
        "select_repository": {
            "ru": "Выберите репозиторий",
            "en": "Select Repository"
        },
        "custom_repository": {
            "ru": "Другой репозиторий",
            "en": "Custom Repository"
        },
        "repository_saved": {
            "ru": "Репозиторий сохранён",
            "en": "Repository saved"
        },
        "panel_info": {
            "ru": "Информация о панели",
            "en": "Panel Information"
        },
        "refresh_interval": {
            "ru": "Интервал обновления (сек)",
            "en": "Refresh Interval (sec)"
        },
        "log_retention_days": {
            "ru": "Хранение логов (дней)",
            "en": "Log Retention (days)"
        },
        "cleanup_logs": {
            "ru": "Очистить старые логи",
            "en": "Cleanup Old Logs"
        },
        "project_name": {
            "ru": "Название проекта",
            "en": "Project Name"
        },
        "version": {
            "ru": "Версия",
            "en": "Version"
        },
        "language": {
            "ru": "Язык",
            "en": "Language"
        },
        "language_russian": {
            "ru": "Русский",
            "en": "Russian"
        },
        "language_english": {
            "ru": "Английский (США)",
            "en": "English (US)"
        },
        "username_readonly": {
            "ru": "Имя пользователя нельзя изменить",
            "en": "Username cannot be changed"
        },
        "placeholder_full_name": {
            "ru": "Иван Иванов",
            "en": "John Doe"
        },
        "placeholder_email": {
            "ru": "user@example.com",
            "en": "user@example.com"
        },
        "save_changes": {
            "ru": "Сохранить изменения",
            "en": "Save Changes"
        },
        "save_settings": {
            "ru": "Сохранить настройки",
            "en": "Save Settings"
        },
        "refresh_interval_label": {
            "ru": "Интервал обновления (сек)",
            "en": "Refresh Interval (sec)"
        },
        "refresh_interval_help": {
            "ru": "Как часто обновлять данные на панели (1-60 секунд)",
            "en": "How often to refresh panel data (1-60 seconds)"
        },
        "log_retention_label": {
            "ru": "Хранение логов (дней)",
            "en": "Log Retention (days)"
        },
        "log_retention_help": {
            "ru": "Сколько дней хранить логи перед автоматической очисткой (1-365 дней)",
            "en": "How many days to keep logs before automatic cleanup (1-365 days)"
        },
        "language_help": {
            "ru": "Язык интерфейса панели управления",
            "en": "Control panel interface language"
        },
        "panel_name": {
            "ru": "Название панели",
            "en": "Panel Name"
        },
        # OS Templates Page
        "os_templates": {
            "ru": "OS Шаблоны",
            "en": "OS Templates"
        },
        "os_templates_management": {
            "ru": "OS Шаблоны - Управление",
            "en": "OS Templates - Management"
        },
        "new_group": {
            "ru": "Новая группа",
            "en": "New Group"
        },
        "add_template": {
            "ru": "Добавить шаблон",
            "en": "Add Template"
        },
        "auto_import": {
            "ru": "Авто-импорт",
            "en": "Auto Import"
        },
        "auto_import_templates": {
            "ru": "Авто-импорт шаблонов",
            "en": "Auto Import Templates"
        },
        "auto_import_description": {
            "ru": "Автоматически импортировать все шаблоны с Proxmox сервера. Шаблоны будут автоматически распределены по группам (Ubuntu, Debian, CentOS и т.д.) с правильным порядком сортировки.",
            "en": "Automatically import all templates from Proxmox server. Templates will be automatically grouped by OS type (Ubuntu, Debian, CentOS, etc.) with proper sort order."
        },
        # High Availability (HA)
        "high_availability": {
            "ru": "Высокая доступность",
            "en": "High Availability"
        },
        "enable_ha": {
            "ru": "Включить HA",
            "en": "Enable HA"
        },
        "disable_ha": {
            "ru": "Отключить HA",
            "en": "Disable HA"
        },
        "add_to_ha": {
            "ru": "Добавить в HA",
            "en": "Add to HA"
        },
        "remove": {
            "ru": "Удалить",
            "en": "Remove"
        },
        "remove_from_ha": {
            "ru": "Удалить из HA",
            "en": "Remove from HA"
        },
        "confirm_remove_from_ha": {
            "ru": "Вы уверены, что хотите удалить",
            "en": "Are you sure you want to remove"
        },
        "from_ha": {
            "ru": "из HA",
            "en": "from HA"
        },
        "confirm_add_to_ha_message": {
            "ru": "Добавить",
            "en": "Add"
        },
        "to_ha_question": {
            "ru": "в High Availability",
            "en": "to High Availability"
        },
        "ha_enabled": {
            "ru": "HA включен",
            "en": "HA Enabled"
        },
        "ha_disabled": {
            "ru": "HA отключен",
            "en": "HA Disabled"
        },
        "ha_cluster_only": {
            "ru": "только кластер",
            "en": "cluster only"
        },
        "cluster_detected": {
            "ru": "кластер",
            "en": "cluster"
        },
        "vm_access_denied": {
            "ru": "У вас нет доступа к этой виртуальной машине",
            "en": "You do not have access to this virtual machine"
        },
        "owner": {
            "ru": "Владелец",
            "en": "Owner"
        },
        "my_instances": {
            "ru": "Мои инстансы",
            "en": "My Instances"
        },
        "all_instances": {
            "ru": "Все инстансы",
            "en": "All Instances"
        },
        "no_instances_assigned": {
            "ru": "Вам не назначено ни одного инстанса",
            "en": "No instances assigned to you"
        },
        "instance_owner": {
            "ru": "Владелец инстанса",
            "en": "Instance Owner"
        },
        "assign_to_user": {
            "ru": "Назначить пользователю",
            "en": "Assign to User"
        },
        "sdn": {
            "ru": "SDN (Программные сети)",
            "en": "SDN (Software Defined Networking)"
        },
        "sdn_zones": {
            "ru": "SDN Зоны",
            "en": "SDN Zones"
        },
        "sdn_vnets": {
            "ru": "Виртуальные сети",
            "en": "Virtual Networks"
        },
        "sdn_subnets": {
            "ru": "Подсети",
            "en": "Subnets"
        },
        "sdn_not_available": {
            "ru": "SDN не настроен на этом сервере",
            "en": "SDN is not configured on this server"
        },
        "sdn_zone_simple": {
            "ru": "Простая зона",
            "en": "Simple Zone"
        },
        "sdn_zone_vlan": {
            "ru": "VLAN зона",
            "en": "VLAN Zone"
        },
        "sdn_zone_vxlan": {
            "ru": "VXLAN зона",
            "en": "VXLAN Zone"
        },
        "sdn_apply_changes": {
            "ru": "Применить изменения SDN",
            "en": "Apply SDN Changes"
        },
        "sdn_pending_changes": {
            "ru": "Есть неприменённые изменения SDN",
            "en": "There are pending SDN changes"
        },
        "create_zone": {
            "ru": "Создать зону",
            "en": "Create Zone"
        },
        "create_vnet": {
            "ru": "Создать VNet",
            "en": "Create VNet"
        },
        "create_subnet": {
            "ru": "Создать подсеть",
            "en": "Create Subnet"
        },
        "snapshots": {
            "ru": "Снимки",
            "en": "Snapshots"
        },
        "snapshot": {
            "ru": "Снимок",
            "en": "Snapshot"
        },
        "create_snapshot": {
            "ru": "Создать снимок",
            "en": "Create Snapshot"
        },
        "snapshot_name": {
            "ru": "Имя снимка",
            "en": "Snapshot Name"
        },
        "snapshot_description": {
            "ru": "Описание снимка",
            "en": "Snapshot Description"
        },
        "include_ram": {
            "ru": "Включить RAM (состояние памяти)",
            "en": "Include RAM (memory state)"
        },
        "rollback_snapshot": {
            "ru": "Откатить к снимку",
            "en": "Rollback to Snapshot"
        },
        "delete_snapshot": {
            "ru": "Удалить снимок",
            "en": "Delete Snapshot"
        },
        "rollback_confirm": {
            "ru": "Вы уверены, что хотите откатить к этому снимку? Все текущие данные будут потеряны.",
            "en": "Are you sure you want to rollback to this snapshot? All current data will be lost."
        },
        "snapshot_created": {
            "ru": "Снимок успешно создан",
            "en": "Snapshot created successfully"
        },
        "snapshot_deleted": {
            "ru": "Снимок успешно удален",
            "en": "Snapshot deleted successfully"
        },
        "snapshot_rollback_success": {
            "ru": "Успешный откат к снимку",
            "en": "Rollback to snapshot successful"
        },
        "no_snapshots": {
            "ru": "Нет снимков",
            "en": "No snapshots"
        },
        "snapshot_date": {
            "ru": "Дата создания",
            "en": "Creation Date"
        },
        "ha_enable_success": {
            "ru": "HA успешно включен",
            "en": "HA enabled successfully"
        },
        "ha_disable_success": {
            "ru": "HA успешно отключен",
            "en": "HA disabled successfully"
        },
        "ha_error": {
            "ru": "Ошибка HA",
            "en": "HA Error"
        },
        "ha_auto_failover_hint": {
            "ru": "VM будет автоматически перезапущена на другой ноде при сбое",
            "en": "VM will automatically restart on another node in case of failure"
        },
        "add_to_ha_after_create": {
            "ru": "Добавить в HA после создания",
            "en": "Add to HA after creation"
        },
        "templates_to_import": {
            "ru": "Шаблоны для импорта",
            "en": "Templates to import"
        },
        "import_completed": {
            "ru": "Импорт завершён",
            "en": "Import completed"
        },
        "preview": {
            "ru": "Предпросмотр",
            "en": "Preview"
        },
        "import": {
            "ru": "Импортировать",
            "en": "Import"
        },
        "importing": {
            "ru": "Импорт...",
            "en": "Importing..."
        },
        "imported": {
            "ru": "Импортировано",
            "en": "Imported"
        },
        "found": {
            "ru": "Найдено",
            "en": "Found"
        },
        "new_templates": {
            "ru": "новых шаблонов",
            "en": "new templates"
        },
        "no_new_templates": {
            "ru": "Нет новых шаблонов для импорта. Все шаблоны уже добавлены.",
            "en": "No new templates to import. All templates are already added."
        },
        "manage_os_templates_description": {
            "ru": "Управляйте шаблонами операционных систем для быстрого развёртывания VM. Шаблоны связаны с VM-шаблонами в Proxmox VE.",
            "en": "Manage operating system templates for quick VM deployment. Templates are linked to VM templates in Proxmox VE."
        },
        "template_groups": {
            "ru": "Группы шаблонов",
            "en": "Template Groups"
        },
        "group_name": {
            "ru": "Название группы",
            "en": "Group Name"
        },
        "icon": {
            "ru": "Иконка",
            "en": "Icon"
        },
        "sort_order": {
            "ru": "Порядок сортировки",
            "en": "Sort Order"
        },
        "no_template_groups": {
            "ru": "Нет групп шаблонов.",
            "en": "No template groups."
        },
        "create_first_group": {
            "ru": "Создайте первую группу",
            "en": "Create first group"
        },
        "templates_os": {
            "ru": "Шаблоны ОС",
            "en": "OS Templates"
        },
        "all_groups": {
            "ru": "Все группы",
            "en": "All Groups"
        },
        "all_servers": {
            "ru": "Все серверы",
            "en": "All Servers"
        },
        "loading_templates": {
            "ru": "Загрузка шаблонов...",
            "en": "Loading templates..."
        },
        "template_discovery": {
            "ru": "Обнаружение шаблонов",
            "en": "Template Discovery"
        },
        "find_proxmox_templates_description": {
            "ru": "Найдите VM-шаблоны на ваших Proxmox серверах и добавьте их в панель.",
            "en": "Find VM templates on your Proxmox servers and add them to the panel."
        },
        "select_server": {
            "ru": "Выберите сервер",
            "en": "Select Server"
        },
        "find_templates": {
            "ru": "Найти шаблоны",
            "en": "Find Templates"
        },
        "found_templates": {
            "ru": "Найденные шаблоны:",
            "en": "Found Templates:"
        },
        "required": {
            "ru": "*",
            "en": "*"
        },
        "icon_emoji_help": {
            "ru": "Эмодзи или иконка (например: 🐧, 🪟, 🔴)",
            "en": "Emoji or icon (e.g.: 🐧, 🪟, 🔴)"
        },
        "group_description_placeholder": {
            "ru": "Описание группы шаблонов",
            "en": "Template group description"
        },
        "new_template": {
            "ru": "Новый шаблон",
            "en": "New Template"
        },
        "group": {
            "ru": "Группа",
            "en": "Group"
        },
        "select_group": {
            "ru": "Выберите группу",
            "en": "Select Group"
        },
        "proxmox_server": {
            "ru": "Proxmox сервер",
            "en": "Proxmox Server"
        },
        "template_name": {
            "ru": "Название шаблона",
            "en": "Template Name"
        },
        "vmid_in_proxmox": {
            "ru": "VMID шаблона в Proxmox",
            "en": "Template VMID in Proxmox"
        },
        "proxmox_node": {
            "ru": "Нода Proxmox",
            "en": "Proxmox Node"
        },
        "default_parameters": {
            "ru": "Параметры по умолчанию",
            "en": "Default Parameters"
        },
        "cpu_cores": {
            "ru": "CPU ядер",
            "en": "CPU Cores"
        },
        "memory_mb": {
            "ru": "Память (MB)",
            "en": "Memory (MB)"
        },
        "disk_gb": {
            "ru": "Диск (GB)",
            "en": "Disk (GB)"
        },
        "min_cpu_cores": {
            "ru": "Мин. CPU ядер",
            "en": "Min CPU Cores"
        },
        "min_memory_mb": {
            "ru": "Мин. память (MB)",
            "en": "Min Memory (MB)"
        },
        "min_disk_gb": {
            "ru": "Мин. диск (GB)",
            "en": "Min Disk (GB)"
        },
        "os_template_description_placeholder": {
            "ru": "Описание шаблона ОС",
            "en": "OS template description"
        },
        "template_active": {
            "ru": "Шаблон активен",
            "en": "Template is active"
        },
        "deploy_vm": {
            "ru": "Развернуть VM",
            "en": "Deploy VM"
        },
        "template_label": {
            "ru": "Шаблон",
            "en": "Template"
        },
        "server_label": {
            "ru": "Сервер",
            "en": "Server"
        },
        "new_vm_name": {
            "ru": "Имя новой VM",
            "en": "New VM Name"
        },
        "vm_name_pattern_hint": {
            "ru": "Только латинские буквы, цифры, дефис и подчёркивание",
            "en": "Only latin letters, numbers, hyphen and underscore"
        },
        "resources": {
            "ru": "Ресурсы",
            "en": "Resources"
        },
        "target_node": {
            "ru": "Целевая нода",
            "en": "Target Node"
        },
        "auto_select": {
            "ru": "Авто (нода шаблона)",
            "en": "Auto (template node)"
        },
        "cross_node_deploy_hint": {
            "ru": "Выберите ноду для создания VM. Шаблон будет автоматически реплицирован если нужно.",
            "en": "Select node for VM creation. Template will be automatically replicated if needed."
        },
        "replicating_template": {
            "ru": "Репликация шаблона на целевую ноду...",
            "en": "Replicating template to target node..."
        },
        "network": {
            "ru": "Сеть",
            "en": "Network"
        },
        "network_bridge": {
            "ru": "Сетевой мост",
            "en": "Network Bridge"
        },
        "ip_address_optional": {
            "ru": "IP адрес (опционально)",
            "en": "IP Address (optional)"
        },
        "gateway_optional": {
            "ru": "Gateway (опционально)",
            "en": "Gateway (optional)"
        },
        "cloud_init_optional": {
            "ru": "Cloud-Init (опционально)",
            "en": "Cloud-Init (optional)"
        },
        "user": {
            "ru": "Пользователь",
            "en": "User"
        },
        "ssh_keys_public": {
            "ru": "SSH ключи (public)",
            "en": "SSH Keys (public)"
        },
        "start_vm_after_create": {
            "ru": "Запустить VM после создания",
            "en": "Start VM after creation"
        },
        "deploy": {
            "ru": "Развернуть",
            "en": "Deploy"
        },
        "no_group": {
            "ru": "Без группы",
            "en": "No Group"
        },
        "active": {
            "ru": "Активен",
            "en": "Active"
        },
        "inactive": {
            "ru": "Неактивен",
            "en": "Inactive"
        },
        "unknown_server": {
            "ru": "Неизвестный сервер",
            "en": "Unknown Server"
        },
        "no_templates": {
            "ru": "Нет шаблонов.",
            "en": "No templates."
        },
        "add_first_template": {
            "ru": "Добавьте первый шаблон",
            "en": "Add first template"
        },
        "templates_count": {
            "ru": "шаблон(ов)",
            "en": "template(s)"
        },
        "error_loading_templates": {
            "ru": "Ошибка загрузки шаблонов",
            "en": "Error loading templates"
        },
        "edit_group": {
            "ru": "Редактировать группу",
            "en": "Edit Group"
        },
        "error_loading_group": {
            "ru": "Ошибка загрузки группы",
            "en": "Error loading group"
        },
        "delete_group_confirm": {
            "ru": "Удалить группу",
            "en": "Delete group"
        },
        "error_saving_group": {
            "ru": "Ошибка сохранения группы",
            "en": "Error saving group"
        },
        "error_deleting_group": {
            "ru": "Ошибка удаления группы",
            "en": "Error deleting group"
        },
        "edit_template": {
            "ru": "Редактировать шаблон",
            "en": "Edit Template"
        },
        "delete_template_confirm": {
            "ru": "Удалить шаблон",
            "en": "Delete template"
        },
        "error_saving_template": {
            "ru": "Ошибка сохранения шаблона",
            "en": "Error saving template"
        },
        "error_deleting_template": {
            "ru": "Ошибка удаления шаблона",
            "en": "Error deleting template"
        },
        "select_proxmox_server": {
            "ru": "Выберите Proxmox сервер",
            "en": "Select Proxmox server"
        },
        "searching_templates": {
            "ru": "Поиск шаблонов...",
            "en": "Searching templates..."
        },
        "no_templates_found": {
            "ru": "Шаблоны не найдены на этом сервере.",
            "en": "No templates found on this server."
        },
        "already_added": {
            "ru": "Добавлен",
            "en": "Added"
        },
        "select_group_placeholder": {
            "ru": "Выберите группу...",
            "en": "Select group..."
        },
        "please_select_group": {
            "ru": "Пожалуйста, выберите группу для шаблона",
            "en": "Please select a group for the template"
        },
        "add_template_to_group": {
            "ru": "Добавить шаблон в группу",
            "en": "Add Template to Group"
        },
        "error_loading_template_info": {
            "ru": "Ошибка загрузки информации о шаблоне",
            "en": "Error loading template information"
        },
        "min_value": {
            "ru": "мин.",
            "en": "min"
        },
        "deploying_vm": {
            "ru": "Развертывание VM... Это может занять несколько минут.",
            "en": "Deploying VM... This may take several minutes."
        },
        "deploying_status": {
            "ru": "Развертывание...",
            "en": "Deploying..."
        },
        "deploy_error": {
            "ru": "Ошибка",
            "en": "Error"
        },
        
        # IPAM (IP Address Management)
        "ipam_networks": {
            "ru": "Сети IPAM",
            "en": "IPAM Networks"
        },
        "ip_networks_management": {
            "ru": "Управление IP-сетями",
            "en": "IP Networks Management"
        },
        "add_network": {
            "ru": "Добавить сеть",
            "en": "Add Network"
        },
        "all_networks": {
            "ru": "Все сети",
            "en": "All Networks"
        },
        "networks_not_found": {
            "ru": "Сети не найдены",
            "en": "No networks found"
        },
        "add_first_network": {
            "ru": "Добавьте первую сеть для управления IP-адресами",
            "en": "Add your first network to manage IP addresses"
        },
        "network_label": {
            "ru": "Сеть",
            "en": "Network"
        },
        "cidr": {
            "ru": "CIDR",
            "en": "CIDR"
        },
        "gateway": {
            "ru": "Gateway",
            "en": "Gateway"
        },
        "vlan": {
            "ru": "VLAN",
            "en": "VLAN"
        },
        "usage": {
            "ru": "Использование",
            "en": "Usage"
        },
        "actions": {
            "ru": "Действия",
            "en": "Actions"
        },
        "open": {
            "ru": "Открыть",
            "en": "Open"
        },
        "title": {
            "ru": "Название",
            "en": "Title"
        },
        "network_cidr": {
            "ru": "Сеть (CIDR)",
            "en": "Network (CIDR)"
        },
        "vlan_id": {
            "ru": "VLAN ID",
            "en": "VLAN ID"
        },
        "proxmox_bridge": {
            "ru": "Proxmox Bridge",
            "en": "Proxmox Bridge"
        },
        "proxmox_node": {
            "ru": "Нода Proxmox",
            "en": "Proxmox Node"
        },
        "proxmox_node_hint": {
            "ru": "Нода внутри кластера, к которой привязана сеть. Привязка будет учтена при поиске IP.",
            "en": "Cluster node the network is associated with. Used for IP matching."
        },
        "all_nodes": {
            "ru": "— Все ноды —",
            "en": "— All nodes —"
        },
        "select_node": {
            "ru": "— Выберите ноду —",
            "en": "— Select node —"
        },
        "loading_nodes": {
            "ru": "Загрузка нод...",
            "en": "Loading nodes..."
        },
        "proxmox_server": {
            "ru": "Proxmox сервер",
            "en": "Proxmox Server"
        },
        "all_servers": {
            "ru": "Все серверы",
            "en": "All servers"
        },
        "global_network": {
            "ru": "Глобальная сеть",
            "en": "Global network"
        },
        "network_server_hint": {
            "ru": "Привязать сеть к конкретному серверу или оставить глобальной",
            "en": "Bind network to a specific server or leave it global"
        },
        "global": {
            "ru": "Глобальная",
            "en": "Global"
        },
        "create": {
            "ru": "Создать",
            "en": "Create"
        },
        "error_creating_network": {
            "ru": "Ошибка создания сети",
            "en": "Error creating network"
        },
        "delete_network_confirm": {
            "ru": "Удалить сеть",
            "en": "Delete network"
        },
        "all_related_data_lost": {
            "ru": "Все связанные данные будут потеряны.",
            "en": "All related data will be lost."
        },
        "error_deleting_network": {
            "ru": "Ошибка удаления сети",
            "en": "Error deleting network"
        },
        "error_loading_networks": {
            "ru": "Ошибка загрузки сетей",
            "en": "Error loading networks"
        },
        
        # IPAM Allocations
        "ip_allocations": {
            "ru": "Выделения IP",
            "en": "IP Allocations"
        },
        "all_allocated_ips": {
            "ru": "Все выделенные IP-адреса",
            "en": "All allocated IP addresses"
        },
        "allocate_ip": {
            "ru": "Выделить IP",
            "en": "Allocate IP"
        },
        "all_networks": {
            "ru": "Все сети",
            "en": "All Networks"
        },
        "all_status": {
            "ru": "Все",
            "en": "All"
        },
        "allocated": {
            "ru": "Выделен",
            "en": "Allocated"
        },
        "reserved": {
            "ru": "Резерв",
            "en": "Reserved"
        },
        "search": {
            "ru": "Поиск",
            "en": "Search"
        },
        "search_placeholder": {
            "ru": "IP, hostname, VM...",
            "en": "IP, hostname, VM..."
        },
        "refresh": {
            "ru": "Обновить",
            "en": "Refresh"
        },
        "allocations_not_found": {
            "ru": "Выделения не найдены",
            "en": "No allocations found"
        },
        "no_allocated_ips": {
            "ru": "Нет выделенных IP-адресов",
            "en": "No allocated IP addresses"
        },
        "ip_address": {
            "ru": "IP",
            "en": "IP"
        },
        "hostname": {
            "ru": "Hostname",
            "en": "Hostname"
        },
        "resource": {
            "ru": "Ресурс",
            "en": "Resource"
        },
        "created": {
            "ru": "Создан",
            "en": "Created"
        },
        "release": {
            "ru": "Освободить",
            "en": "Release"
        },
        "select_network": {
            "ru": "-- Выберите сеть --",
            "en": "-- Select Network --"
        },
        "ip_address_auto": {
            "ru": "IP адрес (пусто = авто)",
            "en": "IP Address (empty = auto)"
        },
        "auto_allocation": {
            "ru": "Авто-выделение",
            "en": "Auto-allocation"
        },
        "reserve_checkbox": {
            "ru": "Резерв (не использовать для авто-выделения)",
            "en": "Reserved (do not use for auto-allocation)"
        },
        "allocate": {
            "ru": "Выделить",
            "en": "Allocate"
        },
        "allocating_ip": {
            "ru": "Выделение IP адреса",
            "en": "Allocating IP address"
        },
        "ip_allocation_failed": {
            "ru": "Ошибка выделения IP",
            "en": "IP allocation failed"
        },
        "error_allocating_ip": {
            "ru": "Ошибка выделения IP",
            "en": "Error allocating IP"
        },
        "release_ip_confirm": {
            "ru": "Освободить IP",
            "en": "Release IP"
        },
        "error_releasing_ip": {
            "ru": "Ошибка освобождения IP",
            "en": "Error releasing IP"
        },
        "error_loading_allocations": {
            "ru": "Ошибка загрузки",
            "en": "Error loading"
        },
        
        # IPAM Network Detail
        "network_detail": {
            "ru": "Сеть",
            "en": "Network"
        },
        "add_pool": {
            "ru": "Добавить пул",
            "en": "Add Pool"
        },
        "back": {
            "ru": "Назад",
            "en": "Back"
        },
        "total_ips": {
            "ru": "Всего IP",
            "en": "Total IPs"
        },
        "available_ips": {
            "ru": "Доступно",
            "en": "Available"
        },
        "allocated_ips": {
            "ru": "Выделено",
            "en": "Allocated"
        },
        "reserved_ips": {
            "ru": "Резерв",
            "en": "Reserved"
        },
        "utilization": {
            "ru": "Использование",
            "en": "Utilization"
        },
        "ip_pools": {
            "ru": "Пулы IP-адресов",
            "en": "IP Address Pools"
        },
        "no_pools": {
            "ru": "Нет пулов.",
            "en": "No pools."
        },
        "ip_map": {
            "ru": "Карта IP-адресов",
            "en": "IP Address Map"
        },
        "available": {
            "ru": "Доступно",
            "en": "Available"
        },
        "allocated_addresses": {
            "ru": "Выделенные адреса",
            "en": "Allocated Addresses"
        },
        "no_allocated_addresses": {
            "ru": "Нет выделенных адресов",
            "en": "No allocated addresses"
        },
        "type": {
            "ru": "Тип",
            "en": "Type"
        },
        "resource_type": {
            "ru": "Тип ресурса",
            "en": "Resource Type"
        },
        "not_specified": {
            "ru": "-- Не указано --",
            "en": "-- Not specified --"
        },
        "vm": {
            "ru": "VM",
            "en": "VM"
        },
        "lxc_container": {
            "ru": "LXC Контейнер",
            "en": "LXC Container"
        },
        "create_lxc": {
            "ru": "Создать LXC",
            "en": "Create LXC"
        },
        "create_lxc_container": {
            "ru": "Создать LXC контейнер",
            "en": "Create LXC Container"
        },
        "lxc_templates": {
            "ru": "Шаблоны LXC",
            "en": "LXC Templates"
        },
        "available_templates": {
            "ru": "Доступные шаблоны",
            "en": "Available Templates"
        },
        "download_template": {
            "ru": "Скачать шаблон",
            "en": "Download Template"
        },
        "hostname": {
            "ru": "Имя хоста",
            "en": "Hostname"
        },
        "root_password": {
            "ru": "Root пароль",
            "en": "Root Password"
        },
        "ssh_public_keys": {
            "ru": "SSH публичные ключи",
            "en": "SSH Public Keys"
        },
        "rootfs_size": {
            "ru": "Размер rootfs",
            "en": "Rootfs Size"
        },
        "swap_memory": {
            "ru": "Swap память",
            "en": "Swap Memory"
        },
        "unprivileged": {
            "ru": "Непривилегированный",
            "en": "Unprivileged"
        },
        "start_after_create": {
            "ru": "Запустить после создания",
            "en": "Start After Create"
        },
        "start_on_boot": {
            "ru": "Запуск при загрузке",
            "en": "Start on Boot"
        },
        "network_config": {
            "ru": "Сетевая конфигурация",
            "en": "Network Configuration"
        },
        "physical_server": {
            "ru": "Physical Server",
            "en": "Physical Server"
        },
        "service": {
            "ru": "Service",
            "en": "Service"
        },
        "resource_name": {
            "ru": "Название ресурса",
            "en": "Resource Name"
        },
        "mac_address": {
            "ru": "MAC адрес",
            "en": "MAC Address"
        },
        "notes": {
            "ru": "Примечание",
            "en": "Notes"
        },
        "description_placeholder": {
            "ru": "Описание...",
            "en": "Description..."
        },
        "pool_name": {
            "ru": "Название",
            "en": "Name"
        },
        "pool_type": {
            "ru": "Тип",
            "en": "Type"
        },
        "static": {
            "ru": "Static",
            "en": "Static"
        },
        "dhcp": {
            "ru": "DHCP",
            "en": "DHCP"
        },
        "range_start": {
            "ru": "Начало диапазона",
            "en": "Range Start"
        },
        "range_end": {
            "ru": "Конец диапазона",
            "en": "Range End"
        },
        "auto_assign_pool": {
            "ru": "Автоматическое выделение из этого пула",
            "en": "Automatic allocation from this pool"
        },
        "pool_description": {
            "ru": "Описание пула...",
            "en": "Pool description..."
        },
        "error_creating_pool": {
            "ru": "Ошибка создания пула",
            "en": "Error creating pool"
        },
        "delete_pool_confirm": {
            "ru": "Удалить пул",
            "en": "Delete pool"
        },
        "error_deleting_pool": {
            "ru": "Ошибка удаления пула",
            "en": "Error deleting pool"
        },
        "ip_details": {
            "ru": "IP Details",
            "en": "IP Details"
        },
        "loading_data": {
            "ru": "Загрузка...",
            "en": "Loading..."
        },
        "no_data": {
            "ru": "Нет данных",
            "en": "No data"
        },
        "error_loading_map": {
            "ru": "Ошибка загрузки",
            "en": "Error loading"
        },
        "showing_first_ips": {
            "ru": "Показано первые 254 IP. Всего:",
            "en": "Showing first 254 IPs. Total:"
        },
        "ip_available": {
            "ru": "IP адрес доступен",
            "en": "IP address is available"
        },
        "close": {
            "ru": "Закрыть",
            "en": "Close"
        },
        "allocated_by": {
            "ru": "Выделено:",
            "en": "Allocated by:"
        },
        "proxmox_vmid": {
            "ru": "Proxmox VMID:",
            "en": "Proxmox VMID:"
        },
        "auto_button": {
            "ru": "Авто",
            "en": "Auto"
        },
        "leave_empty_auto": {
            "ru": "Оставьте пустым для автоматического выделения",
            "en": "Leave empty for automatic allocation"
        },
        "no_available_ips": {
            "ru": "Нет доступных IP-адресов",
            "en": "No available IP addresses"
        },
        
        "theme": {
            "ru": "Тема",
            "en": "Theme"
        },
        "theme_dark": {
            "ru": "Темная",
            "en": "Dark"
        },
        "theme_light": {
            "ru": "Светлая",
            "en": "Light"
        },
        "placeholder_panel_name": {
            "ru": "Server Panel",
            "en": "Server Panel"
        },
        
        # Notifications and Messages
        "profile_updated": {
            "ru": "Профиль обновлён",
            "en": "Profile Updated"
        },
        "error_updating_profile": {
            "ru": "Ошибка при обновлении профиля",
            "en": "Error Updating Profile"
        },
        "passwords_dont_match": {
            "ru": "Новые пароли не совпадают",
            "en": "New Passwords Don't Match"
        },
        "password_changed": {
            "ru": "Пароль успешно изменён",
            "en": "Password Changed Successfully"
        },
        "error_changing_password": {
            "ru": "Ошибка при изменении пароля",
            "en": "Error Changing Password"
        },
        "language_changed_reload": {
            "ru": "Язык изменён. Страница будет перезагружена...",
            "en": "Language Changed. Page Will Reload..."
        },
        "panel_settings_updated": {
            "ru": "Настройки панели обновлены",
            "en": "Panel Settings Updated"
        },
        "error_updating_settings": {
            "ru": "Ошибка при обновлении настроек",
            "en": "Error Updating Settings"
        },
        "confirm_cleanup_logs": {
            "ru": "Вы уверены, что хотите очистить старые логи? Это действие нельзя отменить.",
            "en": "Are you sure you want to cleanup old logs? This action cannot be undone."
        },
        "error_cleanup_logs": {
            "ru": "Ошибка при очистке логов",
            "en": "Error Cleaning Up Logs"
        },
        "error_loading_profile": {
            "ru": "Ошибка при загрузке профиля",
            "en": "Error Loading Profile"
        },
        "error_loading_settings": {
            "ru": "Ошибка при загрузке настроек панели",
            "en": "Error Loading Panel Settings"
        },
        "role": {
            "ru": "Роль",
            "en": "Role"
        },
        "admin": {
            "ru": "Администратор",
            "en": "Administrator"
        },
        "user": {
            "ru": "Пользователь",
            "en": "User"
        },
        "active": {
            "ru": "Активен",
            "en": "Active"
        },
        "inactive": {
            "ru": "Неактивен",
            "en": "Inactive"
        },
        "created_date": {
            "ru": "Дата создания",
            "en": "Created Date"
        },
        "last_login": {
            "ru": "Последний вход",
            "en": "Last Login"
        },
        "sec": {
            "ru": "сек",
            "en": "sec"
        },
        "days": {
            "ru": "дней",
            "en": "days"
        },
        "gb": {
            "ru": "ГБ",
            "en": "GB"
        },
        
        # Navigation
        "nav_dashboard": {
            "ru": "Dashboard",
            "en": "Dashboard"
        },
        "nav_proxmox": {
            "ru": "Proxmox VE",
            "en": "Proxmox VE"
        },
        "nav_vms": {
            "ru": "Виртуальные машины",
            "en": "Virtual Machines"
        },
        "nav_templates": {
            "ru": "ОС Шаблоны",
            "en": "OS Templates"
        },
        "nav_ipam": {
            "ru": "IPAM",
            "en": "IPAM"
        },
        "nav_backups": {
            "ru": "Резервные копии",
            "en": "Backups"
        },
        "nav_docker": {
            "ru": "Docker",
            "en": "Docker"
        },
        "backup_tab_backups": {
            "ru": "Резервные копии",
            "en": "Backups"
        },
        "backup_tab_storages": {
            "ru": "Хранилища",
            "en": "Storages"
        },
        "backup_tab_schedule": {
            "ru": "Расписание",
            "en": "Schedule"
        },
        "backup_list_title": {
            "ru": "Список резервных копий",
            "en": "Backup List"
        },
        "backup_storages_title": {
            "ru": "Хранилища Proxmox",
            "en": "Proxmox Storages"
        },
        "backup_jobs_title": {
            "ru": "Задания резервного копирования",
            "en": "Backup Jobs"
        },
        "backup_create": {
            "ru": "Создать бэкап",
            "en": "Create Backup"
        },
        "backup_create_title": {
            "ru": "Создать резервную копию",
            "en": "Create Backup"
        },
        "backup_restore_title": {
            "ru": "Восстановить из резервной копии",
            "en": "Restore from Backup"
        },
        "backup_restore_btn": {
            "ru": "Восстановить",
            "en": "Restore"
        },
        "backup_restore_started": {
            "ru": "Восстановление запущено",
            "en": "Restore started"
        },
        "backup_restore_storage": {
            "ru": "Хранилище для дисков",
            "en": "Target storage for disks"
        },
        "backup_restore_new_vmid": {
            "ru": "Новый VMID",
            "en": "New VMID"
        },
        "backup_restore_vmid_hint": {
            "ru": "Оставьте пустым для использования оригинального",
            "en": "Leave empty to use original VMID"
        },
        "backup_restore_start": {
            "ru": "Запустить после восстановления",
            "en": "Start after restore"
        },
        "backup_restore_unique": {
            "ru": "Сгенерировать уникальный MAC",
            "en": "Generate unique MAC"
        },
        "backup_add_storage": {
            "ru": "Добавить хранилище",
            "en": "Add Storage"
        },
        "backup_add_job": {
            "ru": "Добавить задание",
            "en": "Add Job"
        },
        "backup_edit_job": {
            "ru": "Редактировать задание",
            "en": "Edit Job"
        },
        "backup_storage_id": {
            "ru": "Хранилище",
            "en": "Storage"
        },
        "backup_storage_type": {
            "ru": "Тип хранилища",
            "en": "Storage Type"
        },
        "backup_storage_content": {
            "ru": "Типы контента",
            "en": "Content Types"
        },
        "backup_storage_shared": {
            "ru": "Общее",
            "en": "Shared"
        },
        "backup_storage_usage": {
            "ru": "Использование",
            "en": "Usage"
        },
        "backup_storage_path": {
            "ru": "Путь",
            "en": "Path"
        },
        "backup_storage_delete_confirm": {
            "ru": "Удалить хранилище из конфигурации Proxmox?",
            "en": "Remove this storage from Proxmox configuration?"
        },
        "backup_storage_deleted": {
            "ru": "Хранилище удалено",
            "en": "Storage deleted"
        },
        "backup_storage_added": {
            "ru": "Хранилище добавлено",
            "en": "Storage added"
        },
        "backup_col_type": {
            "ru": "Тип ВМ",
            "en": "VM Type"
        },
        "backup_col_filename": {
            "ru": "Файл",
            "en": "File"
        },
        "backup_col_size": {
            "ru": "Размер",
            "en": "Size"
        },
        "backup_col_date": {
            "ru": "Дата",
            "en": "Date"
        },
        "backup_col_format": {
            "ru": "Формат",
            "en": "Format"
        },
        "backup_mode": {
            "ru": "Режим",
            "en": "Mode"
        },
        "backup_compress": {
            "ru": "Сжатие",
            "en": "Compression"
        },
        "backup_keep": {
            "ru": "Хранить N последних",
            "en": "Keep last N backups"
        },
        "backup_keep_hint": {
            "ru": "0 — не удалять старые резервные копии",
            "en": "0 — do not auto-remove old backups"
        },
        "backup_notes": {
            "ru": "Заметка",
            "en": "Notes"
        },
        "backup_notes_placeholder": {
            "ru": "Описание резервной копии",
            "en": "Backup description"
        },
        "backup_started": {
            "ru": "Резервное копирование запущено",
            "en": "Backup started"
        },
        "backup_deleted": {
            "ru": "Резервная копия удалена",
            "en": "Backup deleted"
        },
        "backup_delete_confirm": {
            "ru": "Удалить резервную копию? Это действие необратимо.",
            "en": "Delete this backup? This action cannot be undone."
        },
        "backup_empty": {
            "ru": "Резервных копий нет",
            "en": "No backups found"
        },
        "backup_no_storages": {
            "ru": "Нет доступных хранилищ",
            "en": "No storages available"
        },
        "backup_no_jobs": {
            "ru": "Нет заданий резервного копирования",
            "en": "No backup jobs configured"
        },
        "backup_task_log": {
            "ru": "Лог задания",
            "en": "Task Log"
        },
        "backup_job_last_run": {
            "ru": "Последний запуск",
            "en": "Last Run"
        },
        "backup_job_enabled": {
            "ru": "Задание активно",
            "en": "Job enabled"
        },
        "backup_job_enable": {
            "ru": "Включить задание",
            "en": "Enable job"
        },
        "backup_job_disable": {
            "ru": "Отключить задание",
            "en": "Disable job"
        },
        "backup_job_triggered": {
            "ru": "Задание запущено",
            "en": "Job triggered"
        },
        "backup_job_delete_confirm": {
            "ru": "Удалить задание расписания?",
            "en": "Delete this backup job?"
        },
        "backup_run_now": {
            "ru": "Запустить сейчас",
            "en": "Run now"
        },
        "backup_vmids_hint": {
            "ru": "Список через запятую или 'all' для всех ВМ",
            "en": "Comma-separated list or 'all' for all VMs"
        },
        "backup_cron_hint": {
            "ru": "Пример: '0 2 * * *' — каждую ночь в 02:00 UTC",
            "en": "Example: '0 2 * * *' — every night at 02:00 UTC"
        },
        "select_storage": {
            "ru": "Выберите хранилище",
            "en": "Select storage"
        },
        "select_server_and_storage": {
            "ru": "Выберите сервер и хранилище",
            "en": "Select a server and storage"
        },
        "nav_logs": {
            "ru": "Логи",
            "en": "Logs"
        },
        "nav_settings": {
            "ru": "Настройки",
            "en": "Settings"
        },
        "nav_logout": {
            "ru": "Выход",
            "en": "Logout"
        },
        
        # Filter translations
        "all_types": {
            "ru": "Все типы",
            "en": "All types"
        },
        "all_statuses": {
            "ru": "Все статусы",
            "en": "All statuses"
        },
        "containers": {
            "ru": "Контейнеры",
            "en": "Containers"
        },
        
        # Dashboard
        "online": {
            "ru": "Онлайн",
            "en": "Online"
        },
        "offline": {
            "ru": "Офлайн",
            "en": "Offline"
        },
        "proxmox_nodes_load": {
            "ru": "Нагрузка Proxmox нод",
            "en": "Proxmox Nodes Load"
        },
        
        # OS Templates
        "os_templates": {
            "ru": "ОС Шаблоны - Управление",
            "en": "OS Templates - Management"
        },
        "new_group": {
            "ru": "Новая группа",
            "en": "New Group"
        },
        "add_template": {
            "ru": "Добавить шаблон",
            "en": "Add Template"
        },
        "template_groups": {
            "ru": "Группы шаблонов",
            "en": "Template Groups"
        },
        "os_templates_list": {
            "ru": "Шаблоны ОС",
            "en": "OS Templates"
        },
        "all_groups": {
            "ru": "Все группы",
            "en": "All Groups"
        },
        "all_servers": {
            "ru": "Все серверы",
            "en": "All Servers"
        },
        "expand": {
            "ru": "Развернуть",
            "en": "Expand"
        },
        
        # IPAM
        "networks": {
            "ru": "Сети",
            "en": "Networks"
        },
        "allocated_ips": {
            "ru": "Выделено IP",
            "en": "Allocated IPs"
        },
        "vms": {
            "ru": "VM",
            "en": "VMs"
        },
        "reserved": {
            "ru": "Резерв",
            "en": "Reserved"
        },
        "show_all": {
            "ru": "Обновить",
            "en": "Refresh"
        },
        "subnets": {
            "ru": "Подсети",
            "en": "Subnets"
        },
        "add_network": {
            "ru": "Добавить сеть",
            "en": "Add Network"
        },
        "network": {
            "ru": "Сеть",
            "en": "Network"
        },
        "gateway": {
            "ru": "Шлюз",
            "en": "Gateway"
        },
        "vlan": {
            "ru": "VLAN",
            "en": "VLAN"
        },
        "usage": {
            "ru": "Использование",
            "en": "Usage"
        },
        
        # Docker
        "docker_containers": {
            "ru": "Docker контейнеры",
            "en": "Docker Containers"
        },
        "docker_management": {
            "ru": "Управление Docker",
            "en": "Docker Management"
        },
        "docker_description": {
            "ru": "Раздел в разработке. Здесь будет управление Docker контейнерами на всех хостах.",
            "en": "Under development. Docker container management across all hosts will be available here."
        },
        "section_in_development": {
            "ru": "Раздел в разработке. Здесь будет управление Docker контейнерами на всех хостах.",
            "en": "Under development. Docker container management across all hosts will be available here."
        },
        "to_servers": {
            "ru": "К серверам",
            "en": "To Servers"
        },
        
        # Logs
        "system_logs": {
            "ru": "Логи системы",
            "en": "System Logs"
        },
        "event_log": {
            "ru": "Журнал событий",
            "en": "Event Log"
        },
        "view_analyze_logs": {
            "ru": "Просмотр и фильтрация логов системы",
            "en": "View and Filter System Logs"
        },
        "all_24h": {
            "ru": "Всего за 24ч",
            "en": "Total 24h"
        },
        "info_events": {
            "ru": "Информация",
            "en": "Info"
        },
        "all_levels": {
            "ru": "Все уровни",
            "en": "All Levels"
        },
        "all_categories": {
            "ru": "Все категории",
            "en": "All Categories"
        },
        "user_filter": {
            "ru": "Пользователь",
            "en": "User"
        },
        "all_users": {
            "ru": "Все пользователи",
            "en": "All Users"
        },
        "date_from": {
            "ru": "Дата от",
            "en": "Date From"
        },
        "date_to": {
            "ru": "Дата по",
            "en": "Date To"
        },
        "search_placeholder": {
            "ru": "Поиск в сообщениях...",
            "en": "Search in messages..."
        },
        "reset": {
            "ru": "Сбросить",
            "en": "Reset"
        },
        "apply": {
            "ru": "Применить",
            "en": "Apply"
        },
        "export": {
            "ru": "Экспорт",
            "en": "Export"
        },
        "back": {
            "ru": "Назад",
            "en": "Back"
        },
        "refresh": {
            "ru": "Обновить",
            "en": "Refresh"
        },
        "host": {
            "ru": "Хост",
            "en": "Host"
        },
        "monitoring": {
            "ru": "Мониторинг",
            "en": "Monitoring"
        },
        "loading_data": {
            "ru": "Загрузка данных...",
            "en": "Loading data..."
        },
        "loading_instance": {
            "ru": "Загрузка данных инстанса...",
            "en": "Loading instance data..."
        },
        "total_vms": {
            "ru": "Всего VM",
            "en": "Total VMs"
        },
        "total_lxc": {
            "ru": "Всего LXC",
            "en": "Total LXC"
        },
        "running": {
            "ru": "Запущено",
            "en": "Running"
        },
        "stopped": {
            "ru": "Остановлено",
            "en": "Stopped"
        },
        "control": {
            "ru": "Управление",
            "en": "Control"
        },
        "kill": {
            "ru": "Принудительно",
            "en": "Force Stop"
        },
        "reinstall": {
            "ru": "Переустановить",
            "en": "Reinstall"
        },
        "network_interfaces": {
            "ru": "Сетевые интерфейсы",
            "en": "Network Interfaces"
        },
        "ip_unavailable_guest_agent": {
            "ru": "IP адреса недоступны (требуется QEMU guest agent или конфигурация сети)",
            "en": "IP addresses unavailable (requires QEMU guest agent or network configuration)"
        },
        "command_execution": {
            "ru": "Выполнение команд",
            "en": "Command Execution"
        },
        "quick_commands": {
            "ru": "Быстрые команды",
            "en": "Quick Commands"
        },
        "disks": {
            "ru": "Диски",
            "en": "Disks"
        },
        "processes": {
            "ru": "Процессы",
            "en": "Processes"
        },
        "services": {
            "ru": "Сервисы",
            "en": "Services"
        },
        "custom_command": {
            "ru": "Произвольная команда",
            "en": "Custom Command"
        },
        "run": {
            "ru": "Выполнить",
            "en": "Run"
        },
        "bash_script": {
            "ru": "Bash скрипт",
            "en": "Bash Script"
        },
        "run_script": {
            "ru": "Запустить скрипт",
            "en": "Run Script"
        },
        "result": {
            "ru": "Результат",
            "en": "Result"
        },
        "monitoring_charts": {
            "ru": "Графики мониторинга",
            "en": "Monitoring Charts"
        },
        "hour": {
            "ru": "Час",
            "en": "Hour"
        },
        "day": {
            "ru": "День",
            "en": "Day"
        },
        "week": {
            "ru": "Неделя",
            "en": "Week"
        },
        "month": {
            "ru": "Месяц",
            "en": "Month"
        },
        "network_in": {
            "ru": "Входящий трафик",
            "en": "Network In"
        },
        "network_out": {
            "ru": "Исходящий трафик",
            "en": "Network Out"
        },
        "disk_read": {
            "ru": "Чтение диска",
            "en": "Disk Read"
        },
        "disk_write": {
            "ru": "Запись диска",
            "en": "Disk Write"
        },
        "configuration": {
            "ru": "Конфигурация",
            "en": "Configuration"
        },
        "vnc_console": {
            "ru": "VNC Консоль",
            "en": "VNC Console"
        },
        "terminal": {
            "ru": "Терминал",
            "en": "Terminal"
        },
        "terminal_console": {
            "ru": "Консоль терминала",
            "en": "Terminal Console"
        },
        "connecting": {
            "ru": "Подключение",
            "en": "Connecting"
        },
        "connected": {
            "ru": "Подключено",
            "en": "Connected"
        },
        "disconnected": {
            "ru": "Отключено",
            "en": "Disconnected"
        },
        "connecting_to_terminal": {
            "ru": "Подключение к терминалу...",
            "en": "Connecting to terminal..."
        },
        "terminal_connection_error": {
            "ru": "Ошибка подключения к терминалу",
            "en": "Terminal Connection Error"
        },
        "terminal_requires_password": {
            "ru": "Терминал требует авторизацию по паролю (не API токен)",
            "en": "Terminal requires password authentication (not API token)"
        },
        "vm_may_be_stopped": {
            "ru": "VM/Контейнер может быть выключен",
            "en": "VM/Container may be stopped"
        },
        "check_proxmox_settings": {
            "ru": "Проверьте настройки Proxmox сервера",
            "en": "Check Proxmox server settings"
        },
        "possible_causes": {
            "ru": "Возможные причины",
            "en": "Possible causes"
        },
        "time": {
            "ru": "Время",
            "en": "Time"
        },
        "message": {
            "ru": "Сообщение",
            "en": "Message"
        },
        
        # Login
        "login_to_continue": {
            "ru": "Войдите в систему для продолжения",
            "en": "Login to Continue"
        },
        "login": {
            "ru": "Войти",
            "en": "Login"
        },
        "enter_username": {
            "ru": "Введите имя пользователя",
            "en": "Enter username"
        },
        "enter_password": {
            "ru": "Введите пароль",
            "en": "Enter password"
        },
        "logging_in": {
            "ru": "Вход...",
            "en": "Signing in..."
        },
        "login_error_check_credentials": {
            "ru": "Проверьте логин и пароль",
            "en": "Check your username and password"
        },
        "server_connection_error": {
            "ru": "Ошибка соединения с сервером",
            "en": "Server connection error"
        },
        
        # Proxmox
        "proxmox_servers": {
            "ru": "Серверы Proxmox",
            "en": "Proxmox Servers"
        },
        "add_server": {
            "ru": "Добавить сервер",
            "en": "Add Server"
        },
        "delete_server": {
            "ru": "Удаление сервера",
            "en": "Delete Server"
        },
        "confirm_delete_server_msg": {
            "ru": "Вы уверены, что хотите удалить сервер",
            "en": "Are you sure you want to delete server"
        },
        "action_irreversible": {
            "ru": "Это действие нельзя отменить.",
            "en": "This action cannot be undone."
        },
        "server_deleted": {
            "ru": "Сервер удалён",
            "en": "Server deleted"
        },
        "failed_to_delete_server": {
            "ru": "Не удалось удалить сервер",
            "en": "Failed to delete server"
        },
        "sync_from_proxmox": {
            "ru": "Синхронизировать с Proxmox",
            "en": "Sync from Proxmox"
        },
        "sync_completed": {
            "ru": "Синхронизация завершена",
            "en": "Synchronization completed"
        },
        "sync_failed": {
            "ru": "Ошибка синхронизации",
            "en": "Synchronization failed"
        },
        "create_vm": {
            "ru": "Создать VM",
            "en": "Create VM"
        },
        "vm_container": {
            "ru": "VM/Контейнер",
            "en": "VM/Container"
        },
        "test": {
            "ru": "Тест",
            "en": "Test"
        },
        "loading_status": {
            "ru": "Загрузка статуса...",
            "en": "Loading status..."
        },
        "no_proxmox_servers": {
            "ru": "Нет Proxmox серверов.",
            "en": "No Proxmox servers."
        },
        "no_proxmox_node": {
            "ru": "Нет доступных нод Proxmox. Дождитесь загрузки ресурсов.",
            "en": "No Proxmox node available. Please wait for resources to load."
        },
        "add_first_server": {
            "ru": "Добавьте первый сервер",
            "en": "Add the first server"
        },
        "type": {
            "ru": "Тип",
            "en": "Type"
        },
        "node": {
            "ru": "Нода",
            "en": "Node"
        },
        "node_storage": {
            "ru": "Узел/Хранилище",
            "en": "Node/Storage"
        },
        "cluster": {
            "ru": "Кластер",
            "en": "Cluster"
        },
        "owner": {
            "ru": "Владелец",
            "en": "Owner"
        },
        "os_config": {
            "ru": "ОС/Конфигурация",
            "en": "OS/Configuration"
        },
        "virtual_machines": {
            "ru": "Виртуальные машины",
            "en": "Virtual Machines"
        },
        "vm_disks": {
            "ru": "Диски VM",
            "en": "VM Disks"
        },
        "vm_snapshots": {
            "ru": "Снимки VM",
            "en": "VM Snapshots"
        },
        
        # Snapshots UI
        "select_vm": {
            "ru": "Выберите VM",
            "en": "Select VM"
        },
        "select_vm_for_snapshots": {
            "ru": "Выберите VM для просмотра снимков",
            "en": "Select a VM to view snapshots"
        },
        "no_snapshots": {
            "ru": "Снимков нет",
            "en": "No snapshots"
        },
        "create_first_snapshot": {
            "ru": "Создать первый снимок",
            "en": "Create first snapshot"
        },
        "create_snapshot": {
            "ru": "Создать снимок",
            "en": "Create snapshot"
        },
        "snapshot_name": {
            "ru": "Имя снимка",
            "en": "Snapshot name"
        },
        "snapshot_name_hint": {
            "ru": "Только буквы, цифры, дефис и подчёркивание",
            "en": "Only letters, numbers, dash and underscore"
        },
        "include_ram_state": {
            "ru": "Включить состояние RAM",
            "en": "Include RAM state"
        },
        "include_ram_hint": {
            "ru": "Сохраняет содержимое оперативной памяти (требует больше места)",
            "en": "Saves RAM contents (requires more space)"
        },
        "snapshot_created": {
            "ru": "Снимок создан",
            "en": "Snapshot created"
        },
        "snapshot_create_failed": {
            "ru": "Не удалось создать снимок",
            "en": "Failed to create snapshot"
        },
        "delete_snapshot": {
            "ru": "Удалить снимок",
            "en": "Delete snapshot"
        },
        "delete_snapshot_confirm": {
            "ru": "Вы уверены, что хотите удалить снимок {name}?",
            "en": "Are you sure you want to delete snapshot {name}?"
        },
        "snapshot_deleted": {
            "ru": "Снимок удалён",
            "en": "Snapshot deleted"
        },
        "snapshot_delete_failed": {
            "ru": "Не удалось удалить снимок",
            "en": "Failed to delete snapshot"
        },
        "rollback_snapshot": {
            "ru": "Откатить к снимку",
            "en": "Rollback to snapshot"
        },
        "rollback_snapshot_confirm": {
            "ru": "Откатить VM к снимку {name}? Текущее состояние будет потеряно!",
            "en": "Rollback VM to snapshot {name}? Current state will be lost!"
        },
        "snapshot_rollback_started": {
            "ru": "Откат к снимку запущен",
            "en": "Snapshot rollback started"
        },
        "snapshot_rollback_failed": {
            "ru": "Не удалось откатить к снимку",
            "en": "Failed to rollback to snapshot"
        },
        "operation_in_progress": {
            "ru": "Операция выполняется, пожалуйста подождите...",
            "en": "Operation in progress, please wait..."
        },
        "rollback_in_progress": {
            "ru": "Выполняется откат, VM будет заблокирована на время операции...",
            "en": "Rollback in progress, VM will be locked during this operation..."
        },
        "error_loading_snapshots": {
            "ru": "Ошибка загрузки снимков",
            "en": "Error loading snapshots"
        },
        "select_vm_first": {
            "ru": "Сначала выберите VM",
            "en": "Select a VM first"
        },
        "parent": {
            "ru": "Родитель",
            "en": "Parent"
        },
        "rollback": {
            "ru": "Откатить",
            "en": "Rollback"
        },
        "creating": {
            "ru": "Создание",
            "en": "Creating"
        },
        "deleting": {
            "ru": "Удаление",
            "en": "Deleting"
        },
        "rolling_back": {
            "ru": "Откат",
            "en": "Rolling back"
        },
        "in_queue": {
            "ru": "в очереди",
            "en": "in queue"
        },
        "task_timeout": {
            "ru": "Превышено время ожидания операции",
            "en": "Operation timed out"
        },
        
        "filters": {
            "ru": "Фильтры",
            "en": "Filters"
        },
        "per_page": {
            "ru": "на странице",
            "en": "per page"
        },
        "of": {
            "ru": "из",
            "en": "of"
        },
        "no_vms_found": {
            "ru": "Виртуальные машины не найдены",
            "en": "No virtual machines found"
        },
        "filters_coming_soon": {
            "ru": "Фильтры будут добавлены в ближайшее время",
            "en": "Filters coming soon"
        },
        "feature_coming_soon": {
            "ru": "Эта функция будет добавлена в ближайшее время",
            "en": "This feature is coming soon"
        },
        "select_server_first": {
            "ru": "Сначала выберите сервер на странице Proxmox VE",
            "en": "First select a server on the Proxmox VE page"
        },
        "select_server": {
            "ru": "Выберите сервер",
            "en": "Select server"
        },
        "select_server_for_create": {
            "ru": "Выберите сервер Proxmox для создания виртуальной машины или контейнера",
            "en": "Select a Proxmox server to create a virtual machine or container"
        },
        "select_server_for_vm": {
            "ru": "Выберите сервер для создания VM",
            "en": "Select server for VM creation"
        },
        "select_server_for_lxc": {
            "ru": "Выберите сервер для создания LXC контейнера",
            "en": "Select server for LXC container creation"
        },
        "no_servers_available": {
            "ru": "Нет доступных серверов",
            "en": "No servers available"
        },
        "cpu": {
            "ru": "CPU",
            "en": "CPU"
        },
        "memory": {
            "ru": "Память",
            "en": "Memory"
        },
        "disk": {
            "ru": "Диск",
            "en": "Disk"
        },
        "disk_size": {
            "ru": "Размер диска",
            "en": "Disk size"
        },
        "core": {
            "ru": "ядро",
            "en": "core"
        },
        "cores": {
            "ru": "ядер",
            "en": "cores"
        },
        "network": {
            "ru": "Сеть",
            "en": "Network"
        },
        "uptime": {
            "ru": "Время работы",
            "en": "Uptime"
        },
        "start": {
            "ru": "Запустить",
            "en": "Start"
        },
        "stop": {
            "ru": "Остановить",
            "en": "Stop"
        },
        "restart": {
            "ru": "Перезапустить",
            "en": "Restart"
        },
        "console": {
            "ru": "Консоль",
            "en": "Console"
        },
        
        # Templates
        "templates": {
            "ru": "Шаблоны",
            "en": "Templates"
        },
        "template_groups": {
            "ru": "Группы шаблонов",
            "en": "Template Groups"
        },
        "add_template": {
            "ru": "Добавить шаблон",
            "en": "Add Template"
        },
        "new_group": {
            "ru": "Новая группа",
            "en": "New Group"
        },
        "discover_templates": {
            "ru": "Обнаружение шаблонов",
            "en": "Discover Templates"
        },
        "scan_templates": {
            "ru": "Найти шаблоны",
            "en": "Find Templates"
        },
        
        # IPAM
        "ipam": {
            "ru": "IPAM",
            "en": "IPAM"
        },
        "networks": {
            "ru": "Сети",
            "en": "Networks"
        },
        "ip_pools": {
            "ru": "IP Пулы",
            "en": "IP Pools"
        },
        "allocations": {
            "ru": "Выделения",
            "en": "Allocations"
        },
        
        # Logs
        "logs": {
            "ru": "Логи",
            "en": "Logs"
        },
        "audit_logs": {
            "ru": "Логи аудита",
            "en": "Audit Logs"
        },
        "level": {
            "ru": "Уровень",
            "en": "Level"
        },
        "category": {
            "ru": "Категория",
            "en": "Category"
        },
        "action": {
            "ru": "Действие",
            "en": "Action"
        },
        "message": {
            "ru": "Сообщение",
            "en": "Message"
        },
        "user": {
            "ru": "Пользователь",
            "en": "User"
        },
        "date": {
            "ru": "Дата",
            "en": "Date"
        },
        "export": {
            "ru": "Экспорт",
            "en": "Export"
        },
        
        # Messages
        "profile_updated": {
            "ru": "Профиль обновлён",
            "en": "Profile updated"
        },
        "password_changed": {
            "ru": "Пароль успешно изменён",
            "en": "Password changed successfully"
        },
        "settings_saved": {
            "ru": "Настройки сохранены",
            "en": "Settings saved"
        },
        "language_changed": {
            "ru": "Язык изменён. Страница будет перезагружена.",
            "en": "Language changed. Page will reload."
        },
        "error_occurred": {
            "ru": "Произошла ошибка",
            "en": "An error occurred"
        },
        "confirm_delete": {
            "ru": "Вы уверены, что хотите удалить?",
            "en": "Are you sure you want to delete?"
        },
        
        # Logs page specific
        "view_and_filter_system_logs": {
            "ru": "Просмотр и фильтрация системных логов",
            "en": "View and filter system logs"
        },
        "total_24h": {
            "ru": "Всего 24ч",
            "en": "Total 24h"
        },
        "failed_logins": {
            "ru": "Неудачные входы",
            "en": "Failed logins"
        },
        "all_levels": {
            "ru": "Все уровни",
            "en": "All levels"
        },
        "all_categories": {
            "ru": "Все категории",
            "en": "All categories"
        },
        "username": {
            "ru": "Имя пользователя",
            "en": "Username"
        },
        "search_in_messages": {
            "ru": "Поиск в сообщениях...",
            "en": "Search in messages..."
        },
        "level": {
            "ru": "Уровень",
            "en": "Level"
        },
        "category": {
            "ru": "Категория",
            "en": "Category"
        },
        "action": {
            "ru": "Действие",
            "en": "Action"
        },
        "status": {
            "ru": "Статус",
            "en": "Status"
        },
        "page": {
            "ru": "Страница",
            "en": "Page"
        },
        "of": {
            "ru": "из",
            "en": "of"
        },
        "records": {
            "ru": "записей",
            "en": "records"
        },
        "forward": {
            "ru": "Вперёд",
            "en": "Forward"
        },
        "loading_logs": {
            "ru": "Загрузка логов...",
            "en": "Loading logs..."
        },
        "log_details": {
            "ru": "Детали лога",
            "en": "Log details"
        },
        "log_load_error": {
            "ru": "❌ Ошибка загрузки логов",
            "en": "❌ Error loading logs"
        },
        "no_logs_for_filters": {
            "ru": "Логи не найдены по выбранным фильтрам",
            "en": "No logs found for selected filters"
        },
        "no_data_to_export": {
            "ru": "Нет данных для экспорта",
            "en": "No data to export"
        },
        
        # IPAM Dashboard specific
        "ip_address_management": {
            "ru": "Управление IP адресами",
            "en": "IP Address Management"
        },
        "allocations": {
            "ru": "Выделения",
            "en": "Allocations"
        },
        "recent_activity": {
            "ru": "Последняя активность",
            "en": "Recent Activity"
        },
        "loading_ellipsis": {
            "ru": "Загрузка...",
            "en": "Loading..."
        },
        "networks_not_found": {
            "ru": "Сети не найдены",
            "en": "Networks not found"
        },
        "add_first_network": {
            "ru": "Добавьте первую сеть для управления IP-адресами",
            "en": "Add first network to manage IP addresses"
        },
        "error_loading_networks": {
            "ru": "Ошибка загрузки сетей",
            "en": "Error loading networks"
        },
        "error_loading": {
            "ru": "Ошибка загрузки",
            "en": "Error loading"
        },
        "network_label": {
            "ru": "Сеть",
            "en": "Network"
        },
        "cidr": {
            "ru": "CIDR",
            "en": "CIDR"
        },
        "actions": {
            "ru": "Действия",
            "en": "Actions"
        },
        "title": {
            "ru": "Название",
            "en": "Title"
        },
        "network_cidr": {
            "ru": "Сеть (CIDR)",
            "en": "Network (CIDR)"
        },
        "vlan_id": {
            "ru": "VLAN ID",
            "en": "VLAN ID"
        },
        "proxmox_bridge": {
            "ru": "Proxmox Bridge",
            "en": "Proxmox Bridge"
        },
        "dns_primary": {
            "ru": "DNS Primary",
            "en": "DNS Primary"
        },
        "dns_secondary": {
            "ru": "DNS Secondary",
            "en": "DNS Secondary"
        },
        "dns_domain": {
            "ru": "DNS Domain",
            "en": "DNS Domain"
        },
        "description": {
            "ru": "Описание",
            "en": "Description"
        },
        "network_description_placeholder": {
            "ru": "Описание сети...",
            "en": "Network description..."
        },
        "create": {
            "ru": "Создать",
            "en": "Create"
        },
        "error_colon": {
            "ru": "Ошибка:",
            "en": "Error:"
        },
        "failed_to_create_network": {
            "ru": "Не удалось создать сеть",
            "en": "Failed to create network"
        },
        "network_creation_error": {
            "ru": "Ошибка создания сети",
            "en": "Network creation error"
        },
        "delete_network_confirm": {
            "ru": "Удалить сеть \"{name}\"? Все связанные данные будут потеряны.",
            "en": "Delete network \"{name}\"? All related data will be lost."
        },
        "failed_to_delete_network": {
            "ru": "Не удалось удалить сеть",
            "en": "Failed to delete network"
        },
        "network_deletion_error": {
            "ru": "Ошибка удаления сети",
            "en": "Network deletion error"
        },
        "no_recent_activity": {
            "ru": "Нет недавней активности",
            "en": "No recent activity"
        },
        
        # IPAM History specific
        "ipam_history": {
            "ru": "История IPAM",
            "en": "IPAM History"
        },
        
        # IPAM Maintenance
        "maintenance": {
            "ru": "Обслуживание",
            "en": "Maintenance"
        },
        "ipam_maintenance": {
            "ru": "Обслуживание IPAM",
            "en": "IPAM Maintenance"
        },
        "orphan_allocations": {
            "ru": "Осиротевшие адреса",
            "en": "Orphan Allocations"
        },
        "orphan_allocations_desc": {
            "ru": "IP-адреса, привязанные к VM/LXC которые больше не существуют",
            "en": "IP addresses allocated to VMs/LXCs that no longer exist"
        },
        "unlinked_allocations": {
            "ru": "Несвязанные адреса",
            "en": "Unlinked Allocations"
        },
        "unlinked_allocations_desc": {
            "ru": "IP-адреса без привязки к VMID. Можно связать с существующими VM по имени",
            "en": "IP addresses without VMID link. Can be linked to existing VMs by name"
        },
        "cleanup_orphans": {
            "ru": "Очистить сироты",
            "en": "Cleanup Orphans"
        },
        "link_to_vms": {
            "ru": "Привязать к VM",
            "en": "Link to VMs"
        },
        "no_orphans_found": {
            "ru": "Сиротских адресов не найдено",
            "en": "No orphan allocations found"
        },
        "all_allocations_linked": {
            "ru": "Все адреса привязаны",
            "en": "All allocations are linked"
        },
        "no_match": {
            "ru": "Нет совпадений",
            "en": "No match"
        },
        "linkable": {
            "ru": "можно связать",
            "en": "linkable"
        },
        "confirm_cleanup_orphans": {
            "ru": "Освободить все осиротевшие IP-адреса? Это действие нельзя отменить.",
            "en": "Release all orphan IP addresses? This action cannot be undone."
        },
        "confirm_link_allocations": {
            "ru": "Привязать все несвязанные адреса к соответствующим VM по имени?",
            "en": "Link all unlinked allocations to matching VMs by name?"
        },
        "link_allocations_title": {
            "ru": "Привязать IP к VM",
            "en": "Link IPs to VMs"
        },
        "link_scope_hint": {
            "ru": "Выберите сервер (ноду) и подсеть. Будут привязаны только ВМ выбранного сервера к выбранной подсети.",
            "en": "Select a server (node) and subnet. Only VMs from the selected server will be linked to the selected subnet."
        },
        "select_server_for_link": {
            "ru": "— Выберите сервер —",
            "en": "— Select server —"
        },
        "select_network_first_server": {
            "ru": "— Сначала выберите сервер —",
            "en": "— Select server first —"
        },
        "no_networks_for_server": {
            "ru": "Нет сетей для этого сервера",
            "en": "No networks for this server"
        },
        "cleaning": {
            "ru": "Очистка",
            "en": "Cleaning"
        },
        "linking": {
            "ru": "Привязка",
            "en": "Linking"
        },
        "released": {
            "ru": "Освобождено",
            "en": "Released"
        },
        "linked": {
            "ru": "Привязано",
            "en": "Linked"
        },
        "cleanup_failed": {
            "ru": "Ошибка очистки",
            "en": "Cleanup failed"
        },
        "linking_failed": {
            "ru": "Ошибка привязки",
            "en": "Linking failed"
        },
        
        "all_changes_log": {
            "ru": "Журнал всех изменений",
            "en": "Log of all changes"
        },
        "action_filter": {
            "ru": "Действие:",
            "en": "Action:"
        },
        "period_filter": {
            "ru": "Период:",
            "en": "Period:"
        },
        "all": {
            "ru": "Все",
            "en": "All"
        },
        "allocation": {
            "ru": "Выделение",
            "en": "Allocation"
        },
        "release": {
            "ru": "Освобождение",
            "en": "Release"
        },
        "reservation": {
            "ru": "Резервирование",
            "en": "Reservation"
        },
        "update": {
            "ru": "Обновление",
            "en": "Update"
        },
        "days_7": {
            "ru": "7 дней",
            "en": "7 days"
        },
        "days_30": {
            "ru": "30 дней",
            "en": "30 days"
        },
        "days_90": {
            "ru": "90 дней",
            "en": "90 days"
        },
        "all_time": {
            "ru": "Все время",
            "en": "All time"
        },
        "history_empty": {
            "ru": "История пуста",
            "en": "History empty"
        },
        "no_records_for_period": {
            "ru": "Нет записей за выбранный период",
            "en": "No records for selected period"
        },
        "ip_allocated": {
            "ru": "IP адрес выделен",
            "en": "IP address allocated"
        },
        "ip_released": {
            "ru": "IP адрес освобождён",
            "en": "IP address released"
        },
        "ip_reserved": {
            "ru": "IP адрес зарезервирован",
            "en": "IP address reserved"
        },
        "record_updated": {
            "ru": "Запись обновлена",
            "en": "Record updated"
        },
        "record_created": {
            "ru": "Запись создана",
            "en": "Record created"
        },
        "record_deleted": {
            "ru": "Запись удалена",
            "en": "Record deleted"
        },
        "success": {
            "ru": "Успешно",
            "en": "Success"
        },
        "error": {
            "ru": "Ошибка",
            "en": "Error"
        },
        "details": {
            "ru": "Детали",
            "en": "Details"
        },
        "resource": {
            "ru": "Ресурс",
            "en": "Resource"
        },
        "request": {
            "ru": "запрос",
            "en": "request"
        },
        "port": {
            "ru": "Порт",
            "en": "Port"
        },
        
        # Server form translations
        "server_name": {
            "ru": "Название сервера",
            "en": "Server Name"
        },
        "hostname_fqdn": {
            "ru": "Hostname/FQDN",
            "en": "Hostname/FQDN"
        },
        "ip_address": {
            "ru": "IP адрес",
            "en": "IP Address"
        },
        "proxmox_auth": {
            "ru": "Авторизация Proxmox",
            "en": "Proxmox Authorization"
        },
        "api_user": {
            "ru": "Пользователь",
            "en": "User"
        },
        "root_password": {
            "ru": "Пароль root",
            "en": "root password"
        },
        "verify_ssl": {
            "ru": "Проверять SSL сертификат",
            "en": "Verify SSL Certificate"
        },
        "verify_ssl_hint": {
            "ru": "Отключите для self-signed сертификатов",
            "en": "Disable for self-signed certificates"
        },
        "server_description": {
            "ru": "Описание",
            "en": "Description"
        },
        "server_description_placeholder": {
            "ru": "Описание сервера (необязательно)",
            "en": "Server description (optional)"
        },
        "connect": {
            "ru": "Подключить",
            "en": "Connect"
        },
        "add_server_info": {
            "ru": "Введите логин и пароль root пользователя. Система автоматически создаст API Token для безопасной работы.",
            "en": "Enter root user login and password. The system will automatically create an API Token for secure operation."
        },
        "add_proxmox_server": {
            "ru": "Добавить Proxmox сервер",
            "en": "Add Proxmox Server"
        },
        "edit_server": {
            "ru": "Редактировать сервер",
            "en": "Edit Server"
        },
        "required": {
            "ru": "*",
            "en": "*"
        },
        "use_password_less_secure": {
            "ru": "Использовать пароль (менее безопасно)",
            "en": "Use password (less secure)"
        },
        "auto_api_token_title": {
            "ru": "Автоматическое создание API Token",
            "en": "Automatic API Token creation"
        },
        "back_to_server": {
            "ru": "Назад к серверу",
            "en": "Back to server"
        },
        "back_to_vms": {
            "ru": "Назад к виртуальным машинам",
            "en": "Back to Virtual Machines"
        },
        "enter_command": {
            "ru": "Введите команду",
            "en": "Enter command"
        },
        "enter_script": {
            "ru": "Введите скрипт",
            "en": "Enter script"
        },
        "executing_script": {
            "ru": "Выполняется скрипт...",
            "en": "Executing script..."
        },
        "failed_to_load_resources": {
            "ru": "Не удалось загрузить ресурсы",
            "en": "Failed to load resources"
        },
        "instance_not_found": {
            "ru": "Инстанс не найден",
            "en": "Instance not found"
        },
        "script_execution_error": {
            "ru": "Ошибка выполнения скрипта",
            "en": "Script execution error"
        },
        
        # Connection and status messages
        "checking_connection": {
            "ru": "Проверка соединения...",
            "en": "Checking connection..."
        },
        "connecting": {
            "ru": "Подключение...",
            "en": "Connecting..."
        },
        "connecting_to_vnc": {
            "ru": "Подключение к VNC...",
            "en": "Connecting to VNC..."
        },
        "connection_successful": {
            "ru": "Подключение успешно",
            "en": "Connection successful"
        },
        "command_executed_successfully": {
            "ru": "Команда выполнена успешно",
            "en": "Command executed successfully"
        },
        "check_connection_retry": {
            "ru": "Проверьте подключение к интернету и попробуйте снова",
            "en": "Check your internet connection and try again"
        },
        "network_error_check_proxmox": {
            "ru": "Ошибка сети. Проверьте подключение к Proxmox серверу.",
            "en": "Network error. Check connection to Proxmox server."
        },
        
        # Group form
        "group_name": {
            "ru": "Название группы",
            "en": "Group name"
        },
        "icon_hint": {
            "ru": "Эмодзи или иконка (например: 🐧, 🪟, 🔴)",
            "en": "Emoji or icon (e.g.: 🐧, 🪟, 🔴)"
        },
        "group_description_placeholder": {
            "ru": "Описание группы шаблонов",
            "en": "Template group description"
        },
        "sort_order": {
            "ru": "Порядок сортировки",
            "en": "Sort order"
        },
        
        # Select placeholders
        "select_template": {
            "ru": "-- Выберите шаблон --",
            "en": "-- Select template --"
        },
        "select_server": {
            "ru": "-- Выберите сервер --",
            "en": "-- Select server --"
        },
        "first_select_server": {
            "ru": "-- Сначала выберите сервер --",
            "en": "-- First select a server --"
        },
        "do_not_use_ipam": {
            "ru": "-- Не использовать IPAM --",
            "en": "-- Do not use IPAM --"
        },
        "select_os_template": {
            "ru": "Выберите шаблон ОС",
            "en": "Select OS template"
        },
        
        # VNC error hints
        "vm_stopped_start_first": {
            "ru": "VM/контейнер остановлен - запустите его перед подключением",
            "en": "VM/container is stopped - start it before connecting"
        },
        "network_connection_issues": {
            "ru": "Проблемы с сетевым подключением",
            "en": "Network connection issues"
        },
        "vnc_connection_error": {
            "ru": "Ошибка подключения к VNC",
            "en": "VNC connection error"
        },
        "possible_causes": {
            "ru": "Возможные причины",
            "en": "Possible causes"
        },
        "api_token_insufficient_rights": {
            "ru": "Недостаточно прав у API токена - добавьте права",
            "en": "Insufficient API token rights - add permission"
        },
        "novnc_loading_error": {
            "ru": "Ошибка загрузки библиотеки noVNC",
            "en": "noVNC library loading error"
        },
        "proxmox_server_unreachable": {
            "ru": "Proxmox сервер недоступен с вашего устройства",
            "en": "Proxmox server unreachable from your device"
        },
        "unknown_error": {
            "ru": "Неизвестная ошибка",
            "en": "Unknown error"
        },
        "creating_vm": {
            "ru": "Создание VM",
            "en": "Creating VM"
        },
        "create_failed": {
            "ru": "Ошибка создания",
            "en": "Create failed"
        },
        "connection_closed": {
            "ru": "Соединение закрыто",
            "en": "Connection closed"
        },
        "connection_error": {
            "ru": "Ошибка подключения",
            "en": "Connection error"
        },
        "for": {
            "ru": "для",
            "en": "for"
        },
        "templates_count": {
            "ru": "шаблонов",
            "en": "templates"
        },
        "no_templates_on_servers": {
            "ru": "Нет шаблонов на серверах",
            "en": "No templates on servers"
        },
        "add_templates_for_servers": {
            "ru": "Добавьте шаблоны ОС для ваших Proxmox серверов.",
            "en": "Add OS templates for your Proxmox servers."
        },
        "go_to_templates": {
            "ru": "Перейти к шаблонам",
            "en": "Go to templates"
        },
        "select_proxmox_server": {
            "ru": "Выберите Proxmox сервер",
            "en": "Select Proxmox server"
        },
        "enter_vm_name": {
            "ru": "Введите имя VM",
            "en": "Enter VM name"
        },
        "creating": {
            "ru": "Создание...",
            "en": "Creating..."
        },
        "cloning_template": {
            "ru": "Клонирование шаблона",
            "en": "Cloning template"
        },
        "creating_container": {
            "ru": "Создание контейнера",
            "en": "Creating container"
        },
        
        "other": {
            "ru": "Другие",
            "en": "Other"
        },
        "icon": {
            "ru": "Иконка",
            "en": "Icon"
        },
        "attention": {
            "ru": "Внимание",
            "en": "Attention"
        },
        "reinstall_data_loss_warning": {
            "ru": "Переустановка полностью заменит текущую ОС и все данные будут потеряны.",
            "en": "Reinstall will completely replace the current OS and all data will be lost."
        },
        "reinstall_confirm_message": {
            "ru": "Вы собираетесь переустановить \"{name}\" (ID: {vmid}).\n\nВсе данные на этой VM будут УДАЛЕНЫ.",
            "en": "You are about to reinstall \"{name}\" (ID: {vmid}).\n\nAll data on this VM will be DELETED."
        },
        "continue": {
            "ru": "Продолжить",
            "en": "Continue"
        },
        "data_will_be_deleted": {
            "ru": "Все данные на текущем инстансе будут <strong>удалены</strong>!",
            "en": "All data on the current instance will be <strong>deleted</strong>!"
        },
        "add_templates_instruction": {
            "ru": "Добавьте шаблоны ОС в разделе \"Шаблоны\".",
            "en": "Add OS templates in the \"Templates\" section."
        },
        
        # =======================
        # Notification messages (for Email/Telegram)
        # =======================
        
        # Server status notifications
        "notify_server_offline_title": {
            "ru": "🔴 Сервер {server_name} недоступен",
            "en": "🔴 Server {server_name} is offline"
        },
        "notify_server_offline_message": {
            "ru": "Не удалось подключиться к Proxmox серверу {server_name} ({hostname}). Ошибка: {error}",
            "en": "Failed to connect to Proxmox server {server_name} ({hostname}). Error: {error}"
        },
        "notify_server_online_title": {
            "ru": "🟢 Сервер {server_name} снова доступен",
            "en": "🟢 Server {server_name} is back online"
        },
        "notify_server_online_message": {
            "ru": "Proxmox сервер {server_name} ({hostname}) восстановил соединение.",
            "en": "Proxmox server {server_name} ({hostname}) connection restored."
        },
        
        # VM status notifications
        "notify_vm_started_title": {
            "ru": "▶️ VM {vm_name} запущена",
            "en": "▶️ VM {vm_name} started"
        },
        "notify_vm_started_message": {
            "ru": "Виртуальная машина {vm_name} успешно запущена на сервере {server_name}.",
            "en": "Virtual machine {vm_name} successfully started on server {server_name}."
        },
        "notify_vm_stopped_title": {
            "ru": "⏹️ VM {vm_name} остановлена",
            "en": "⏹️ VM {vm_name} stopped"
        },
        "notify_vm_stopped_message": {
            "ru": "Виртуальная машина {vm_name} остановлена на сервере {server_name}.",
            "en": "Virtual machine {vm_name} stopped on server {server_name}."
        },
        "notify_vm_status_change_title": {
            "ru": "ℹ️ VM {vm_name}: статус изменён",
            "en": "ℹ️ VM {vm_name}: status changed"
        },
        "notify_vm_status_change_message": {
            "ru": "Статус VM {vm_name} изменился: {old_status} → {new_status}",
            "en": "VM {vm_name} status changed: {old_status} → {new_status}"
        },
        
        # Resource alerts
        "notify_resource_alert_title": {
            "ru": "⚠️ Высокая загрузка {resource_type}",
            "en": "⚠️ High {resource_type} usage"
        },
        "notify_resource_alert_message": {
            "ru": "{resource_name}: {usage}% (порог: {threshold}%)",
            "en": "{resource_name}: {usage}% (threshold: {threshold}%)"
        },
        
        # Test notification
        "notify_test_title": {
            "ru": "🧪 Тестовое уведомление",
            "en": "🧪 Test Notification"
        },
        "notify_test_message": {
            "ru": "Это тестовое уведомление от PVEmanager. Если вы видите это сообщение, уведомления работают корректно!",
            "en": "This is a test notification from PVEmanager. If you see this, notifications are working correctly!"
        },
        
        # Update notifications
        "notify_update_available_title": {
            "ru": "🆕 Доступна новая версия {new_version}",
            "en": "🆕 New version {new_version} available"
        },
        "notify_update_available_message": {
            "ru": "Доступна новая версия панели {new_version}. Текущая версия: {current_version}. Перейдите на страницу обновления для установки.",
            "en": "New panel version {new_version} is available. Current version: {current_version}. Go to the update page to install."
        },
        
        # ==================== Users & RBAC ====================
        "users_management": {
            "ru": "Управление пользователями",
            "en": "User Management"
        },
        "users": {
            "ru": "Пользователи",
            "en": "Users"
        },
        "user_list": {
            "ru": "Список пользователей",
            "en": "User List"
        },
        "add_user": {
            "ru": "Добавить пользователя",
            "en": "Add User"
        },
        "edit_user": {
            "ru": "Редактировать пользователя",
            "en": "Edit User"
        },
        "user_created": {
            "ru": "Пользователь создан",
            "en": "User created"
        },
        "user_updated": {
            "ru": "Пользователь обновлён",
            "en": "User updated"
        },
        "user_deleted": {
            "ru": "Пользователь удалён",
            "en": "User deleted"
        },
        "confirm_delete_user": {
            "ru": "Удалить пользователя",
            "en": "Delete user"
        },
        "error_loading_users": {
            "ru": "Ошибка загрузки пользователей",
            "en": "Error loading users"
        },
        "leave_empty_to_keep": {
            "ru": "оставьте пустым, чтобы не менять",
            "en": "leave empty to keep current"
        },
        "administrator": {
            "ru": "Администратор",
            "en": "Administrator"
        },
        "locked": {
            "ru": "Заблокирован",
            "en": "Locked"
        },
        
        # Roles
        "roles": {
            "ru": "Роли",
            "en": "Roles"
        },
        "role": {
            "ru": "Роль",
            "en": "Role"
        },
        "add_role": {
            "ru": "Добавить роль",
            "en": "Add Role"
        },
        "edit_role": {
            "ru": "Редактировать роль",
            "en": "Edit Role"
        },
        "role_name": {
            "ru": "Имя роли",
            "en": "Role Name"
        },
        "role_name_hint": {
            "ru": "Только строчные латинские буквы, цифры и подчёркивание",
            "en": "Only lowercase letters, numbers and underscore"
        },
        "display_name": {
            "ru": "Отображаемое имя",
            "en": "Display Name"
        },
        "role_created": {
            "ru": "Роль создана",
            "en": "Role created"
        },
        "role_saved": {
            "ru": "Роль сохранена",
            "en": "Role saved"
        },
        "role_deleted": {
            "ru": "Роль удалена",
            "en": "Role deleted"
        },
        "confirm_delete_role": {
            "ru": "Удалить роль",
            "en": "Delete role"
        },
        "select_role_to_edit": {
            "ru": "Выберите роль для редактирования",
            "en": "Select a role to edit"
        },
        "system_role_cannot_delete": {
            "ru": "Системная роль не может быть удалена",
            "en": "System role cannot be deleted"
        },
        "no_role": {
            "ru": "Без роли",
            "en": "No role"
        },
        
        # Permissions
        "permissions": {
            "ru": "Права доступа",
            "en": "Permissions"
        },
        
        # RBAC v2 Permission Categories
        "permission_category_dashboard": {
            "ru": "Дашборд",
            "en": "Dashboard"
        },
        "permission_category_server": {
            "ru": "Серверы",
            "en": "Servers"
        },
        "permission_category_vm": {
            "ru": "Виртуальные машины",
            "en": "Virtual Machines"
        },
        "permission_category_lxc": {
            "ru": "LXC контейнеры",
            "en": "LXC Containers"
        },
        "permission_category_template": {
            "ru": "Шаблоны",
            "en": "Templates"
        },
        "permission_category_storage": {
            "ru": "Хранилища",
            "en": "Storage"
        },
        "permission_category_backup": {
            "ru": "Резервные копии",
            "en": "Backups"
        },
        "permission_category_ipam": {
            "ru": "IPAM",
            "en": "IPAM"
        },
        "permission_category_user": {
            "ru": "Пользователи",
            "en": "Users"
        },
        "permission_category_role": {
            "ru": "Роли",
            "en": "Roles"
        },
        "permission_category_log": {
            "ru": "Логи",
            "en": "Logs"
        },
        "permission_category_setting": {
            "ru": "Настройки",
            "en": "Settings"
        },
        "permission_category_notification": {
            "ru": "Уведомления",
            "en": "Notifications"
        },
        # Permission actions
        "perm_view": {
            "ru": "Просмотр",
            "en": "View"
        },
        "perm_create": {
            "ru": "Создание",
            "en": "Create"
        },
        "perm_update": {
            "ru": "Изменение",
            "en": "Update"
        },
        "perm_delete": {
            "ru": "Удаление",
            "en": "Delete"
        },
        "perm_manage": {
            "ru": "Управление",
            "en": "Manage"
        },
        "perm_start": {
            "ru": "Запуск",
            "en": "Start"
        },
        "perm_stop": {
            "ru": "Остановка",
            "en": "Stop"
        },
        "perm_restart": {
            "ru": "Перезапуск",
            "en": "Restart"
        },
        "perm_console": {
            "ru": "Консоль",
            "en": "Console"
        },
        "perm_migrate": {
            "ru": "Миграция",
            "en": "Migrate"
        },
        "perm_execute": {
            "ru": "Выполнение команд",
            "en": "Execute commands"
        },
        "perm_export": {
            "ru": "Экспорт",
            "en": "Export"
        },
        
        # Sessions
        "active_sessions": {
            "ru": "Активные сессии",
            "en": "Active Sessions"
        },
        "session_terminated": {
            "ru": "Сессия завершена",
            "en": "Session terminated"
        },
        "terminate_all": {
            "ru": "Завершить все",
            "en": "Terminate All"
        },
        "confirm_terminate_all": {
            "ru": "Завершить все сессии (кроме текущей)?",
            "en": "Terminate all sessions (except current)?"
        },
        "all_sessions_terminated": {
            "ru": "Все сессии завершены",
            "en": "All sessions terminated"
        },
        "no_active_sessions": {
            "ru": "Нет активных сессий",
            "en": "No active sessions"
        },
        "device": {
            "ru": "Устройство",
            "en": "Device"
        },
        "last_activity": {
            "ru": "Последняя активность",
            "en": "Last Activity"
        },
        "expires": {
            "ru": "Истекает",
            "en": "Expires"
        },
        
        # Session settings
        "session_settings": {
            "ru": "Настройки сессий",
            "en": "Session Settings"
        },
        "session_settings_help": {
            "ru": "Управление сессиями пользователей",
            "en": "Manage user sessions"
        },
        "single_session_mode": {
            "ru": "Режим одной сессии",
            "en": "Single Session Mode"
        },
        "single_session_help": {
            "ru": "Разрешить только одну активную сессию на пользователя",
            "en": "Allow only one active session per user"
        },
        
        # Log categories
        "auth": {
            "ru": "Аутентификация",
            "en": "Authentication"
        },
        "system": {
            "ru": "Система",
            "en": "System"
        },
        "warnings": {
            "ru": "Предупреждения",
            "en": "Warnings"
        },
        
        # Security
        "security": {
            "ru": "Безопасность",
            "en": "Security"
        },
        "security_settings": {
            "ru": "Настройки безопасности",
            "en": "Security Settings"
        },
        "max_login_attempts": {
            "ru": "Макс. попыток входа",
            "en": "Max Login Attempts"
        },
        "account_lockout_minutes": {
            "ru": "Блокировка аккаунта (мин)",
            "en": "Account Lockout (min)"
        },
        "session_timeout_minutes": {
            "ru": "Таймаут сессии (мин)",
            "en": "Session Timeout (min)"
        },
        "ip_block_duration_minutes": {
            "ru": "Блокировка IP (мин)",
            "en": "IP Block Duration (min)"
        },
        "min_password_length": {
            "ru": "Мин. длина пароля",
            "en": "Min Password Length"
        },
        "require_uppercase": {
            "ru": "Требовать заглавные буквы",
            "en": "Require Uppercase"
        },
        "require_numbers": {
            "ru": "Требовать цифры",
            "en": "Require Numbers"
        },
        "require_special_chars": {
            "ru": "Требовать спецсимволы",
            "en": "Require Special Characters"
        },
        
        # Password validation errors
        "password_error_min_length": {
            "ru": "Пароль должен быть не менее {min_length} символов",
            "en": "Password must be at least {min_length} characters"
        },
        "password_error_uppercase": {
            "ru": "Пароль должен содержать хотя бы одну заглавную букву",
            "en": "Password must contain at least one uppercase letter"
        },
        "password_error_lowercase": {
            "ru": "Пароль должен содержать хотя бы одну строчную букву",
            "en": "Password must contain at least one lowercase letter"
        },
        "password_error_number": {
            "ru": "Пароль должен содержать хотя бы одну цифру",
            "en": "Password must contain at least one number"
        },
        "password_error_special": {
            "ru": "Пароль должен содержать хотя бы один спецсимвол",
            "en": "Password must contain at least one special character"
        },
        
        # SSH Public Key
        "ssh_public_key": {
            "ru": "SSH Публичный ключ",
            "en": "SSH Public Key"
        },
        "ssh_public_key_label": {
            "ru": "Ваш SSH публичный ключ",
            "en": "Your SSH Public Key"
        },
        "ssh_public_key_help": {
            "ru": "Этот ключ будет автоматически добавляться при создании VM/LXC. Поддерживаются ключи ssh-rsa, ssh-ed25519, ecdsa.",
            "en": "This key will be automatically added when creating VM/LXC instances. Supports ssh-rsa, ssh-ed25519, ecdsa keys."
        },
        "save_ssh_key": {
            "ru": "Сохранить ключ",
            "en": "Save Key"
        },
        "ssh_key_saved": {
            "ru": "SSH ключ успешно сохранён",
            "en": "SSH key saved successfully"
        },
        "error_saving_ssh_key": {
            "ru": "Ошибка сохранения SSH ключа",
            "en": "Error saving SSH key"
        },
        "invalid_ssh_key_format": {
            "ru": "Неверный формат SSH ключа. Ключ должен начинаться с ssh-rsa, ssh-ed25519, ecdsa-sha2 или ssh-dss",
            "en": "Invalid SSH key format. Key must start with ssh-rsa, ssh-ed25519, ecdsa-sha2 or ssh-dss"
        },
        
        # IP Blacklist
        "ip_blacklist": {
            "ru": "Чёрный список IP",
            "en": "IP Blacklist"
        },
        "block_ip": {
            "ru": "Заблокировать IP",
            "en": "Block IP"
        },
        "address": {
            "ru": "адрес",
            "en": "address"
        },
        "reason": {
            "ru": "Причина",
            "en": "Reason"
        },
        "block_reason": {
            "ru": "Причина блокировки",
            "en": "Block reason"
        },
        "duration_minutes": {
            "ru": "Длительность (мин)",
            "en": "Duration (min)"
        },
        "leave_empty_permanent": {
            "ru": "Оставьте пустым для постоянной блокировки",
            "en": "Leave empty for permanent block"
        },
        "block": {
            "ru": "Заблокировать",
            "en": "Block"
        },
        "ip_blocked": {
            "ru": "IP заблокирован",
            "en": "IP blocked"
        },
        "ip_unblocked": {
            "ru": "IP разблокирован",
            "en": "IP unblocked"
        },
        "no_blocked_ips": {
            "ru": "Нет заблокированных IP",
            "en": "No blocked IPs"
        },
        "permanent": {
            "ru": "Постоянно",
            "en": "Permanent"
        },
        
        # Security Events
        "security_events": {
            "ru": "События безопасности",
            "en": "Security Events"
        },
        "event": {
            "ru": "Событие",
            "en": "Event"
        },
        "no_events": {
            "ru": "Нет событий",
            "en": "No events"
        },
        
        # ==================== VM/Container Actions ====================
        "config_saved": {
            "ru": "Конфигурация сохранена",
            "en": "Configuration saved"
        },
        "connection_error": {
            "ru": "Ошибка соединения",
            "en": "Connection error"
        },
        "disk_resized": {
            "ru": "Размер диска изменен",
            "en": "Disk resized"
        },
        "enter_positive_number_gb": {
            "ru": "Введите положительное число GB",
            "en": "Enter a positive number in GB"
        },
        "resize_disk_confirm": {
            "ru": "Увеличить диск {disk} на {size}GB?",
            "en": "Increase disk {disk} by {size}GB?"
        },
        "reinstall_confirm": {
            "ru": "Переустановить \"{name}\"? Все данные будут удалены!",
            "en": "Reinstall \"{name}\"? All data will be deleted!"
        },
        "novnc_not_loaded": {
            "ru": "noVNC не загружен",
            "en": "noVNC not loaded"
        },
        "action_start": {
            "ru": "Запуск",
            "en": "Start"
        },
        "action_stop": {
            "ru": "Остановка",
            "en": "Stop"
        },
        "action_kill": {
            "ru": "Принудительная остановка",
            "en": "Force stop"
        },
        "action_restart": {
            "ru": "Перезагрузка",
            "en": "Restart"
        },
        "confirm_action": {
            "ru": "Вы уверены, что хотите выполнить это действие",
            "en": "Are you sure you want to perform this action"
        },
        "kill_warning": {
            "ru": "⚠️ Это аналог kill -9, данные могут быть потеряны!",
            "en": "⚠️ This is like kill -9, data may be lost!"
        },
        "command_sent": {
            "ru": "Команда отправлена",
            "en": "Command sent"
        },
        "delete_instance": {
            "ru": "Удаление инстанса",
            "en": "Delete instance"
        },
        "delete_instance_confirm": {
            "ru": "Вы уверены, что хотите удалить \"{name}\" (ID: {id})? Все данные будут потеряны!",
            "en": "Are you sure you want to delete \"{name}\" (ID: {id})? All data will be lost!"
        },
        "enter_id_to_confirm": {
            "ru": "Для подтверждения введите ID: {id}",
            "en": "To confirm, enter ID: {id}"
        },
        "id_mismatch": {
            "ru": "ID не совпадает",
            "en": "ID does not match"
        },
        "instance_deleted": {
            "ru": "Инстанс удален",
            "en": "Instance deleted"
        },
        "select_template": {
            "ru": "Выберите шаблон",
            "en": "Select a template"
        },
        "loading_saved_config": {
            "ru": "Загрузка сохраненной конфигурации...",
            "en": "Loading saved configuration..."
        },
        "stopping_instance": {
            "ru": "Остановка инстанса...",
            "en": "Stopping instance..."
        },
        
        # ==================== Form Labels ====================
        "cpu_cores": {
            "ru": "Ядра CPU",
            "en": "CPU Cores"
        },
        "memory_mb": {
            "ru": "Память (МБ)",
            "en": "Memory (MB)"
        },
        "disk_gb": {
            "ru": "Диск (ГБ)",
            "en": "Disk (GB)"
        },
        "name": {
            "ru": "Имя",
            "en": "Name"
        },
        "settings": {
            "ru": "Настройки",
            "en": "Settings"
        },
        "reinstall": {
            "ru": "Переустановка",
            "en": "Reinstall"
        },
        "autostart_on_boot": {
            "ru": "Автозапуск при старте",
            "en": "Autostart on boot"
        },
        "disks": {
            "ru": "Диски",
            "en": "Disks"
        },
        "current_size": {
            "ru": "Текущий",
            "en": "Current"
        },
        "increase": {
            "ru": "Увеличить",
            "en": "Increase"
        },
        "disk_shrink_not_supported": {
            "ru": "Уменьшение размера не поддерживается",
            "en": "Disk shrink is not supported"
        },
        "reinstall_warning": {
            "ru": "Все данные на текущем инстансе будут <strong>удалены</strong>!",
            "en": "All data on the current instance will be <strong>deleted</strong>!"
        },
        "os_template": {
            "ru": "Шаблон ОС",
            "en": "OS Template"
        },
        "select_template": {
            "ru": "Выберите шаблон",
            "en": "Select template"
        },
        "cloud_init_settings": {
            "ru": "Cloud-Init настройки (опционально)",
            "en": "Cloud-Init settings (optional)"
        },
        "username": {
            "ru": "Пользователь",
            "en": "Username"
        },
        "password": {
            "ru": "Пароль",
            "en": "Password"
        },
        "ssh_public_key": {
            "ru": "SSH публичный ключ",
            "en": "SSH public key"
        },
        "leave_empty_for_ssh": {
            "ru": "Оставьте пустым для SSH ключей",
            "en": "Leave empty for SSH keys"
        },
        "multiple_keys_hint": {
            "ru": "Можно указать несколько ключей (каждый с новой строки)",
            "en": "You can specify multiple keys (one per line)"
        },
        "confirm_data_loss": {
            "ru": "Я понимаю, что все данные будут потеряны",
            "en": "I understand that all data will be lost"
        },
        "do_reinstall": {
            "ru": "Переустановить",
            "en": "Reinstall"
        },
        "reinstall_complete": {
            "ru": "Переустановка завершена",
            "en": "Reinstall complete"
        },
        "reinstall_failed": {
            "ru": "Ошибка переустановки",
            "en": "Reinstall failed"
        },
        "reinstalling": {
            "ru": "Переустановка",
            "en": "Reinstalling"
        },
        "save_failed": {
            "ru": "Ошибка сохранения",
            "en": "Save failed"
        },
        "saving": {
            "ru": "Сохранение",
            "en": "Saving"
        },
        "error_loading_config": {
            "ru": "Ошибка загрузки конфигурации",
            "en": "Error loading configuration"
        },
        "add_templates": {
            "ru": "Добавить шаблоны",
            "en": "Add templates"
        },
        "confirm_delete": {
            "ru": "Подтверждение удаления",
            "en": "Confirm deletion"
        },
        "vm_name": {
            "ru": "Имя VM",
            "en": "VM Name"
        },
        "create_vm": {
            "ru": "Создать VM",
            "en": "Create VM"
        },
        "create_vm_from_template": {
            "ru": "Создать VM из шаблона",
            "en": "Create VM from template"
        },
        "start_vm_after_creation": {
            "ru": "Запустить VM после создания",
            "en": "Start VM after creation"
        },
        "network": {
            "ru": "Сеть",
            "en": "Network"
        },
        "ipam_network": {
            "ru": "IPAM Сеть (автовыделение IP)",
            "en": "IPAM Network (auto IP allocation)"
        },
        "ipam_network_auto_ip": {
            "ru": "IPAM Сеть (автовыделение IP)",
            "en": "IPAM Network (auto IP allocation)"
        },
        "no_ipam": {
            "ru": "-- Не использовать IPAM --",
            "en": "-- Don't use IPAM --"
        },
        "select_network_for_auto_ip": {
            "ru": "Выберите сеть для автоматического выделения IP",
            "en": "Select network for automatic IP allocation"
        },
        "ip_address": {
            "ru": "IP адрес",
            "en": "IP Address"
        },
        "gateway": {
            "ru": "Шлюз",
            "en": "Gateway"
        },
        "auto_from_ipam": {
            "ru": "Авто из IPAM или вручную",
            "en": "Auto from IPAM or manual"
        },
        "auto_from_ipam_or_manual": {
            "ru": "Авто из IPAM или вручную",
            "en": "Auto from IPAM or manual"
        },
        "auto_from_ipam_network": {
            "ru": "Авто из сети IPAM",
            "en": "Auto from IPAM network"
        },
        "cloud_init_optional": {
            "ru": "Cloud-init (опционально)",
            "en": "Cloud-init (optional)"
        },
        "ssh_keys": {
            "ru": "SSH ключи",
            "en": "SSH keys"
        },
        "host_monitoring": {
            "ru": "Мониторинг хоста",
            "en": "Host monitoring"
        },
        "cpu_usage": {
            "ru": "Использование CPU",
            "en": "CPU Usage"
        },
        "memory_usage": {
            "ru": "Память",
            "en": "Memory"
        },
        "root_fs": {
            "ru": "Корневая ФС",
            "en": "Root FS"
        },
        "uptime": {
            "ru": "Время работы",
            "en": "Uptime"
        },
        "load_average": {
            "ru": "Нагрузка",
            "en": "Load Average"
        },
        "kernel": {
            "ru": "Ядро",
            "en": "Kernel"
        },
        "pve_version": {
            "ru": "Версия PVE",
            "en": "PVE Version"
        },
        "host_graphs": {
            "ru": "Графики хоста (последний час)",
            "en": "Host graphs (last hour)"
        },
        "cpu_usage_percent": {
            "ru": "CPU %",
            "en": "CPU Usage %"
        },
        "memory_gb": {
            "ru": "Память ГБ",
            "en": "Memory GB"
        },
        "network_mb_s": {
            "ru": "Сеть МБ/с",
            "en": "Network MB/s"
        },
        "in_mb_s": {
            "ru": "Вх МБ/с",
            "en": "In MB/s"
        },
        "out_mb_s": {
            "ru": "Исх МБ/с",
            "en": "Out MB/s"
        },
        "enter_gb_to_add": {
            "ru": "Введите количество GB для добавления к текущему размеру. Уменьшение размера не поддерживается.",
            "en": "Enter GB to add to current size. Shrinking is not supported."
        },
        "resize_disk_warning": {
            "ru": "Вы уверены, что хотите увеличить диск {disk} на {size}GB?\n\nЭто действие необратимо!",
            "en": "Are you sure you want to increase disk {disk} by {size}GB?\n\nThis action is irreversible!"
        },
        "select_server_first": {
            "ru": "Сначала выберите сервер",
            "en": "First select a server"
        },
        "select_server": {
            "ru": "Выберите сервер",
            "en": "Select server"
        },
        "select_server_for_create": {
            "ru": "Выберите сервер Proxmox для создания виртуальной машины или контейнера",
            "en": "Select a Proxmox server to create a virtual machine or container"
        },
        "no_servers_available": {
            "ru": "Нет доступных серверов",
            "en": "No servers available"
        },
        "server": {
            "ru": "Сервер",
            "en": "Server"
        },
        "no_chart_data": {
            "ru": "Нет данных для графиков",
            "en": "No chart data available"
        },
        "vm_graphs": {
            "ru": "Графики (последний час)",
            "en": "Graphs (last hour)"
        },
        "disk_io": {
            "ru": "Диск I/O МБ/с",
            "en": "Disk I/O MB/s"
        },
        "error_loading_host_data": {
            "ru": "Ошибка загрузки данных хоста",
            "en": "Error loading host data"
        },
        "running_status": {
            "ru": "Запущен",
            "en": "Running"
        },
        "stopped_status": {
            "ru": "Остановлен",
            "en": "Stopped"
        },
        "current_config": {
            "ru": "Текущая конфигурация",
            "en": "Current configuration"
        },
        "data_will_be_deleted": {
            "ru": "Все данные на текущем инстансе будут удалены!",
            "en": "All data on the current instance will be deleted!"
        },
        "disk_resize_failed": {
            "ru": "Не удалось изменить размер диска",
            "en": "Failed to resize disk"
        },
        
        # Time units for formatTimeAgo
        "year": {
            "ru": "год",
            "en": "year"
        },
        "years_few": {
            "ru": "года",
            "en": "years"
        },
        "years_many": {
            "ru": "лет",
            "en": "years"
        },
        "month": {
            "ru": "месяц",
            "en": "month"
        },
        "months_few": {
            "ru": "месяца",
            "en": "months"
        },
        "months_many": {
            "ru": "месяцев",
            "en": "months"
        },
        "day": {
            "ru": "день",
            "en": "day"
        },
        "days_few": {
            "ru": "дня",
            "en": "days"
        },
        "days_many": {
            "ru": "дней",
            "en": "days"
        },
        "hour": {
            "ru": "час",
            "en": "hour"
        },
        "hours_few": {
            "ru": "часа",
            "en": "hours"
        },
        "hours_many": {
            "ru": "часов",
            "en": "hours"
        },
        "minute": {
            "ru": "минута",
            "en": "minute"
        },
        "minutes_few": {
            "ru": "минуты",
            "en": "minutes"
        },
        "minutes_many": {
            "ru": "минут",
            "en": "minutes"
        },
        "ago": {
            "ru": "назад",
            "en": "ago"
        },
        "just_now": {
            "ru": "только что",
            "en": "just now"
        },
        
        # Bulk Operations
        "selected": {
            "ru": "выбрано",
            "en": "selected"
        },
        "items": {
            "ru": "элементов",
            "en": "items"
        },
        "no_items_selected": {
            "ru": "Ничего не выбрано",
            "en": "No items selected"
        },
        "confirm_bulk_delete": {
            "ru": "Подтвердите удаление",
            "en": "Confirm deletion"
        },
        "confirm_bulk_delete_msg": {
            "ru": "Вы уверены, что хотите удалить",
            "en": "Are you sure you want to delete"
        },
        "confirm_bulk_operation_msg": {
            "ru": "Это действие будет применено ко всем выбранным элементам",
            "en": "This action will be applied to all selected items"
        },
        "starting": {
            "ru": "Запуск",
            "en": "Starting"
        },
        "stopping": {
            "ru": "Остановка",
            "en": "Stopping"
        },
        "restarting": {
            "ru": "Перезапуск",
            "en": "Restarting"
        },
        "shutting_down": {
            "ru": "Выключение",
            "en": "Shutting down"
        },
        "deleting": {
            "ru": "Удаление",
            "en": "Deleting"
        },
        "processing": {
            "ru": "Обработка",
            "en": "Processing"
        },
        "completed": {
            "ru": "Завершено",
            "en": "Completed"
        },
        "completed_with_errors": {
            "ru": "Завершено с ошибками",
            "en": "Completed with errors"
        },
        "failed": {
            "ru": "Ошибка",
            "en": "Failed"
        },
        "shutdown": {
            "ru": "Выключить",
            "en": "Shutdown"
        },
        "start_all": {
            "ru": "Запустить все",
            "en": "Start all"
        },
        "stop_all": {
            "ru": "Остановить все",
            "en": "Stop all"
        },
        "restart_all": {
            "ru": "Перезапустить все",
            "en": "Restart all"
        },
        "shutdown_all": {
            "ru": "Выключить все",
            "en": "Shutdown all"
        },
        "delete_all": {
            "ru": "Удалить все",
            "en": "Delete all"
        },

        # ---- Dashboard labels ----
        "nodes_label": {
            "ru": "Ноды",
            "en": "Nodes"
        },
        "clusters_label": {
            "ru": "Кластеры",
            "en": "Clusters"
        },
        "alerts_label": {
            "ru": "Оповещения",
            "en": "Alerts"
        },
        "all_online": {
            "ru": "Все онлайн",
            "en": "All online"
        },
        "all_healthy": {
            "ru": "Все работают",
            "en": "All healthy"
        },
        "no_alerts": {
            "ru": "Нет оповещений",
            "en": "No alerts"
        },
        "all_systems_operational": {
            "ru": "Все системы работают",
            "en": "All systems operational"
        },
        "view_all": {
            "ru": "Смотреть все →",
            "en": "View all →"
        },
        "recent_audit_events": {
            "ru": "Недавние события аудита",
            "en": "Recent Audit Events"
        },
        "no_audit_events": {
            "ru": "Нет событий аудита",
            "en": "No audit events found"
        },
        "last_24h": {
            "ru": "последние 24ч",
            "en": "last 24h"
        },
        "ram": {
            "ru": "RAM",
            "en": "RAM"
        },
        "ram_usage": {
            "ru": "Использование RAM",
            "en": "RAM Usage"
        },
        "storage": {
            "ru": "Хранилище",
            "en": "Storage"
        },
        "paused": {
            "ru": "Пауза",
            "en": "Paused"
        },
        "stopped": {
            "ru": "Остановлен",
            "en": "Stopped"
        },
    }
    
    @classmethod
    def get(cls, key: str, lang: str = "ru", **kwargs) -> str:
        """
        Get translation for key
        
        Args:
            key: Translation key
            lang: Language code (ru/en)
            **kwargs: Format variables
        
        Returns:
            Translated string
        """
        if key not in cls.translations:
            return key
        
        translation = cls.translations[key].get(lang, cls.translations[key].get("ru", key))
        
        # Apply formatting if kwargs provided
        if kwargs:
            try:
                translation = translation.format(**kwargs)
            except KeyError:
                pass
        
        return translation
    
    @classmethod
    def get_all(cls, lang: str = "ru") -> Dict[str, str]:
        """
        Get all translations for specific language
        
        Args:
            lang: Language code
        
        Returns:
            Dictionary with all translations
        """
        return {key: cls.get(key, lang) for key in cls.translations}
    
    @classmethod
    def add_translation(cls, key: str, ru: str, en: str):
        """
        Add new translation
        
        Args:
            key: Translation key
            ru: Russian translation
            en: English translation
        """
        cls.translations[key] = {
            "ru": ru,
            "en": en
        }


# Convenience function
def t(key: str, lang: str = "ru", **kwargs) -> str:
    """Shortcut for I18nService.get()"""
    return I18nService.get(key, lang, **kwargs)
