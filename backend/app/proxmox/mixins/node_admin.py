from typing import List, Dict
from loguru import logger


class NodeAdminMixin:
    """
    Администрирование ноды: питание (reboot/shutdown), systemd-сервисы
    (/nodes/{node}/services), APT (обновления и репозитории, /nodes/{node}/apt),
    журналы (syslog), история задач и системная конфигурация (DNS/hosts/time).
    """

    # ---------- Power (reboot / shutdown) ----------

    def node_power_action(self, node: str, command: str) -> Dict:
        """
        Управление питанием ноды: reboot | shutdown.
        Проксирует POST /nodes/{node}/status?command=... как в UI Proxmox.
        """
        if command not in ("reboot", "shutdown"):
            return {"success": False, "error": "command must be reboot or shutdown"}
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).status.post(command=command)
            return {"success": True, "command": command}
        except Exception as e:
            logger.error(f"Error {command} node {node}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Syslog ----------

    def get_node_syslog(self, node: str, limit: int = 500, start: int = 0,
                        service: str = None, since: str = None, until: str = None) -> List[Dict]:
        """Системный журнал ноды: [{n, t}] (номер строки и текст)."""
        if not self.proxmox:
            return []
        params = {"limit": limit, "start": start}
        if service:
            params["service"] = service
        if since:
            params["since"] = since
        if until:
            params["until"] = until
        try:
            return list(self.proxmox.nodes(node).syslog.get(**params) or [])
        except Exception as e:
            logger.error(f"Error getting syslog for {node}: {e}")
            return []

    # ---------- Task history ----------

    def get_node_tasks(self, node: str, limit: int = 100, start: int = 0,
                       errors: bool = False, typefilter: str = None,
                       userfilter: str = None) -> List[Dict]:
        """История задач ноды: [{upid, type, id, user, status, starttime, endtime}]."""
        if not self.proxmox:
            return []
        params = {"limit": limit, "start": start}
        if errors:
            params["errors"] = 1
        if typefilter:
            params["typefilter"] = typefilter
        if userfilter:
            params["userfilter"] = userfilter
        try:
            return list(self.proxmox.nodes(node).tasks.get(**params) or [])
        except Exception as e:
            logger.error(f"Error getting tasks for {node}: {e}")
            return []

    def get_node_task_log(self, node: str, upid: str, limit: int = 500, start: int = 0) -> List[Dict]:
        """Лог конкретной задачи: [{n, t}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).tasks(upid).log.get(limit=limit, start=start) or [])
        except Exception as e:
            logger.error(f"Error getting task log {upid} on {node}: {e}")
            return []

    def get_node_task_status(self, node: str, upid: str) -> Dict:
        """Статус конкретной задачи: {status, exitstatus, type, user, ...}."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).tasks(upid).status.get() or {})
        except Exception as e:
            logger.error(f"Error getting task status {upid} on {node}: {e}")
            return {}

    # ---------- System config: DNS / hosts / time ----------

    def get_node_dns(self, node: str) -> Dict:
        """DNS ноды: {search, dns1, dns2, dns3}."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).dns.get() or {})
        except Exception as e:
            logger.error(f"Error getting DNS for {node}: {e}")
            return {}

    def set_node_dns(self, node: str, search: str = None, dns1: str = None,
                     dns2: str = None, dns3: str = None) -> Dict:
        """Настроить DNS ноды (search обязателен для Proxmox)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        params = {}
        if search is not None:
            params["search"] = search
        if dns1 is not None:
            params["dns1"] = dns1
        if dns2 is not None:
            params["dns2"] = dns2
        if dns3 is not None:
            params["dns3"] = dns3
        try:
            self.proxmox.nodes(node).dns.put(**params)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error setting DNS on {node}: {e}")
            return {"success": False, "error": str(e)}

    def get_node_hosts(self, node: str) -> Dict:
        """Содержимое /etc/hosts ноды: {data, digest}."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).hosts.get() or {})
        except Exception as e:
            logger.error(f"Error getting hosts for {node}: {e}")
            return {}

    def set_node_hosts(self, node: str, data: str, digest: str = None) -> Dict:
        """Записать /etc/hosts ноды (digest — защита от гонок, опционально)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        params = {"data": data}
        if digest:
            params["digest"] = digest
        try:
            self.proxmox.nodes(node).hosts.post(**params)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error setting hosts on {node}: {e}")
            return {"success": False, "error": str(e)}

    def get_node_time(self, node: str) -> Dict:
        """Время ноды: {timezone, time, localtime}."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).time.get() or {})
        except Exception as e:
            logger.error(f"Error getting time for {node}: {e}")
            return {}

    def set_node_timezone(self, node: str, timezone: str) -> Dict:
        """Установить часовой пояс ноды."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).time.put(timezone=timezone)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error setting timezone on {node}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Services ----------

    def get_node_services(self, node: str) -> List[Dict]:
        """Список сервисов ноды: [{service, name, desc, state, active-state}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).services.get() or [])
        except Exception as e:
            logger.error(f"Error getting services for {node}: {e}")
            return []

    def node_service_action(self, node: str, service: str, action: str) -> Dict:
        """
        Управление сервисом: start | stop | restart | reload.
        Возвращает UPID задачи.
        """
        if action not in ("start", "stop", "restart", "reload"):
            return {"success": False, "error": "invalid action"}
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            endpoint = getattr(self.proxmox.nodes(node).services(service), action)
            upid = endpoint.post()
            return {"success": True, "upid": upid}
        except Exception as e:
            logger.error(f"Error {action} service {service} on {node}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- APT: updates ----------

    def get_apt_updates(self, node: str) -> List[Dict]:
        """Доступные обновления пакетов: [{Package, Version, OldVersion, Title}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).apt.update.get() or [])
        except Exception as e:
            logger.error(f"Error getting APT updates for {node}: {e}")
            return []

    def apt_refresh(self, node: str) -> Dict:
        """Обновить списки пакетов (apt-get update). Возвращает UPID."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            upid = self.proxmox.nodes(node).apt.update.post()
            return {"success": True, "upid": upid}
        except Exception as e:
            logger.error(f"Error refreshing APT on {node}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- APT: repositories ----------

    def get_apt_repositories(self, node: str) -> Dict:
        """Информация о репозиториях APT (files, standard-repos, errors)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).apt.repositories.get() or {})
        except Exception as e:
            logger.error(f"Error getting APT repositories for {node}: {e}")
            return {}

    def set_apt_repository(self, node: str, path: str, index: int, enabled: bool) -> Dict:
        """Включить/выключить конкретный репозиторий (по файлу и индексу)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).apt.repositories.post(
                path=path, index=index, enabled=1 if enabled else 0,
            )
            return {"success": True}
        except Exception as e:
            logger.error(f"Error toggling APT repo {path}#{index} on {node}: {e}")
            return {"success": False, "error": str(e)}

    def add_apt_standard_repository(self, node: str, handle: str) -> Dict:
        """Добавить стандартный репозиторий PVE (handle из standard-repos)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).apt.repositories.put(handle=handle)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error adding standard repo {handle} on {node}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- TLS certificates ----------

    def get_node_certificates(self, node: str) -> List[Dict]:
        """
        Информация о TLS-сертификатах ноды.
        GET /nodes/{node}/certificates/info →
        [{filename, fingerprint, subject, issuer, notbefore, notafter, san,
          pem, public-key-type, public-key-bits}].
        """
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).certificates.info.get() or [])
        except Exception as e:
            logger.error(f"Error getting certificates for {node}: {e}")
            return []

    def upload_node_certificate(self, node: str, certificates: str, key: str = None,
                                force: bool = True, restart: bool = True) -> Dict:
        """
        Загрузить/заменить пользовательский сертификат pveproxy (PEM).
        POST /nodes/{node}/certificates/custom.

        Args:
            certificates: PEM-цепочка (сертификат + промежуточные)
            key: приватный ключ PEM (опционально, если уже загружен)
            force: перезаписать существующий пользовательский сертификат
            restart: перезапустить pveproxy для применения
        """
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        params = {
            "certificates": certificates,
            "force": 1 if force else 0,
            "restart": 1 if restart else 0,
        }
        if key:
            params["key"] = key
        try:
            self.proxmox.nodes(node).certificates.custom.post(**params)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error uploading certificate on {node}: {e}")
            return {"success": False, "error": str(e)}

    def delete_node_certificate(self, node: str, restart: bool = True) -> Dict:
        """
        Удалить пользовательский сертификат (вернуться к самоподписанному).
        DELETE /nodes/{node}/certificates/custom.
        """
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).certificates.custom.delete(restart=1 if restart else 0)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting certificate on {node}: {e}")
            return {"success": False, "error": str(e)}
