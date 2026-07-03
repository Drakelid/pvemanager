from typing import List, Dict
from loguru import logger


class NodeAdminMixin:
    """
    Администрирование ноды: systemd-сервисы (/nodes/{node}/services)
    и APT (обновления и репозитории, /nodes/{node}/apt).
    """

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
