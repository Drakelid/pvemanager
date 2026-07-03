from typing import List, Dict, Optional
from loguru import logger


class PoolsMixin:
    """
    Resource pools (/pools) — группировка VM/LXC и хранилищ.
    Геттеры возвращают данные как есть, мутации — {"success": bool, "error"?: str}.
    """

    def get_pools(self) -> List[Dict]:
        """Список пулов: [{poolid, comment}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.pools.get() or [])
        except Exception as e:
            logger.error(f"Error getting pools: {e}")
            return []

    def get_pool(self, poolid: str) -> Dict:
        """Детали пула, включая members (VM/LXC/storage)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.pools(poolid).get() or {})
        except Exception as e:
            logger.error(f"Error getting pool {poolid}: {e}")
            return {}

    def create_pool(self, poolid: str, comment: Optional[str] = None) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {"poolid": poolid}
            if comment:
                params["comment"] = comment
            self.proxmox.pools.post(**params)
            return {"success": True, "poolid": poolid}
        except Exception as e:
            logger.error(f"Error creating pool {poolid}: {e}")
            return {"success": False, "error": str(e)}

    def update_pool(self, poolid: str, vms: Optional[str] = None,
                    storage: Optional[str] = None, comment: Optional[str] = None,
                    delete: bool = False) -> Dict:
        """
        Добавить/убрать участников пула.

        Args:
            vms: список vmid через запятую ("100,101")
            storage: список storage id через запятую
            delete: True — убрать указанных участников, иначе добавить
        """
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params: Dict = {}
            if vms:
                params["vms"] = vms
            if storage:
                params["storage"] = storage
            if comment is not None:
                params["comment"] = comment
            if delete:
                params["delete"] = 1
            self.proxmox.pools(poolid).put(**params)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating pool {poolid}: {e}")
            return {"success": False, "error": str(e)}

    def delete_pool(self, poolid: str) -> Dict:
        """Удалить пул (в PVE должен быть пустым)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.pools(poolid).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting pool {poolid}: {e}")
            return {"success": False, "error": str(e)}
