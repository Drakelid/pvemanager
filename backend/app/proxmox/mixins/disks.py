from typing import List, Dict, Optional
from loguru import logger


class DisksMixin:
    """
    Физические диски ноды, SMART и ZFS-пулы (/nodes/{node}/disks/*).
    Геттеры возвращают данные как есть, мутации — {"success": bool, "upid"?, "error"?}.
    """

    # ---------- Physical disks ----------

    def get_node_disks(self, node: str) -> List[Dict]:
        """
        Список физических дисков ноды: devpath, size, model, serial, type
        (ssd/hdd/nvme), health (SMART), wearout, used, vendor и т.д.
        """
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).disks.list.get() or [])
        except Exception as e:
            logger.error(f"Error getting disks for node {node}: {e}")
            return []

    def get_disk_smart(self, node: str, disk: str) -> Dict:
        """SMART-данные диска (health + attributes)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).disks.smart.get(disk=disk) or {})
        except Exception as e:
            logger.error(f"Error getting SMART for {disk} on {node}: {e}")
            return {"error": str(e)}

    def wipe_disk(self, node: str, disk: str) -> Dict:
        """Очистить диск (wipe). ВНИМАНИЕ: уничтожает данные."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            upid = self.proxmox.nodes(node).disks.wipedisk.put(disk=disk)
            return {"success": True, "upid": upid}
        except Exception as e:
            logger.error(f"Error wiping disk {disk} on {node}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- ZFS pools ----------

    def get_zfs_pools(self, node: str) -> List[Dict]:
        """Список ZFS-пулов ноды: name, size, alloc, free, frag, dedup, health."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).disks.zfs.get() or [])
        except Exception as e:
            logger.error(f"Error getting ZFS pools for node {node}: {e}")
            return []

    def get_zfs_pool(self, node: str, name: str) -> Dict:
        """Детали ZFS-пула, включая дерево устройств (children)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).disks.zfs(name).get() or {})
        except Exception as e:
            logger.error(f"Error getting ZFS pool {name} on {node}: {e}")
            return {}

    def create_zfs_pool(self, node: str, name: str, devices: str,
                        raidlevel: str = "single", ashift: int = 12,
                        compression: str = "on", add_storage: bool = True) -> Dict:
        """
        Создать ZFS-пул из устройств.

        Args:
            devices: список devpath через запятую ("/dev/sdb,/dev/sdc")
            raidlevel: single | mirror | raid10 | raidz | raidz2 | raidz3
            ashift: 9..16 (обычно 12 для 4K-секторов)
            compression: on | off | lz4 | zstd | gzip
            add_storage: сразу зарегистрировать пул как storage в PVE
        """
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            upid = self.proxmox.nodes(node).disks.zfs.post(
                name=name,
                devices=devices,
                raidlevel=raidlevel,
                ashift=ashift,
                compression=compression,
                add_storage=1 if add_storage else 0,
            )
            return {"success": True, "upid": upid}
        except Exception as e:
            logger.error(f"Error creating ZFS pool {name} on {node}: {e}")
            return {"success": False, "error": str(e)}

    def destroy_zfs_pool(self, node: str, name: str,
                         cleanup_config: bool = True, cleanup_disks: bool = False) -> Dict:
        """
        Уничтожить ZFS-пул.

        Args:
            cleanup_config: убрать связанную запись storage из PVE
            cleanup_disks: затереть диски (wipe) после уничтожения пула
        """
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {}
            if cleanup_config:
                params["cleanup-config"] = 1
            if cleanup_disks:
                params["cleanup-disks"] = 1
            upid = self.proxmox.nodes(node).disks.zfs(name).delete(**params)
            return {"success": True, "upid": upid}
        except Exception as e:
            logger.error(f"Error destroying ZFS pool {name} on {node}: {e}")
            return {"success": False, "error": str(e)}
