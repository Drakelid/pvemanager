from typing import List, Dict, Optional, Union, Any
import time
import urllib3
from loguru import logger

class StorageMixin:
        def get_node_isos(self, node: str) -> List[Dict]:
            """Получить список ISO-образов со всех ISO-хранилищ ноды."""
            if not self.proxmox:
                return []
            result: List[Dict] = []
            try:
                storages = self.proxmox.nodes(node).storage.get()
                for s in storages:
                    content = s.get('content', '')
                    if 'iso' not in content:
                        continue
                    storage_id = s.get('storage')
                    try:
                        items = self.proxmox.nodes(node).storage(storage_id).content.get(content='iso')
                        for it in items:
                            result.append({
                                'volid': it.get('volid'),
                                'storage': storage_id,
                                'size': it.get('size'),
                                'format': it.get('format'),
                                'name': (it.get('volid') or '').split('/')[-1],
                            })
                    except Exception as e:
                        logger.debug(f"Не удалось получить ISO из {storage_id}: {e}")
            except Exception as e:
                logger.error(f"Ошибка получения списка ISO для ноды {node}: {e}")
            return result

        def get_lxc_storage_templates(self, node: Optional[str] = None) -> List[Dict]:
            """
            Получить список LXC CT-шаблонов из хранилищ Proxmox.
            Ищет файлы типа vzdump/vztmpl на всех нодах (или на указанной).
            Возвращает список объектов с полями: volid, storage, node, name, size.
            """
            if not self.proxmox:
                return []
            result: List[Dict] = []
            try:
                if node:
                    nodes_list = [{'node': node}]
                else:
                    nodes_list = self.get_nodes()
    
                seen_volids: set = set()
                for n in nodes_list:
                    node_name = n.get('node')
                    try:
                        storages = self.proxmox.nodes(node_name).storage.get()
                        for s in storages:
                            content = s.get('content', '')
                            if 'vztmpl' not in content:
                                continue
                            storage_id = s.get('storage')
                            try:
                                items = self.proxmox.nodes(node_name).storage(storage_id).content.get(content='vztmpl')
                                for it in items:
                                    volid = it.get('volid', '')
                                    if volid in seen_volids:
                                        continue
                                    seen_volids.add(volid)
                                    filename = volid.split('/')[-1] if '/' in volid else volid
                                    result.append({
                                        'volid': volid,
                                        'storage': storage_id,
                                        'node': node_name,
                                        'name': filename,
                                        'size': it.get('size', 0),
                                    })
                            except Exception as e:
                                logger.debug(f"Не удалось получить CT-шаблоны из {storage_id} на {node_name}: {e}")
                    except Exception as e:
                        logger.error(f"Ошибка получения хранилищ ноды {node_name}: {e}")
            except Exception as e:
                logger.error(f"Ошибка получения CT-шаблонов {self.host}: {e}")
            return result

        def get_node_storages(self, node: str, content: str = None) -> List[Dict]:
            """Get storages available on a specific node, optionally filtered by content type"""
            if not self.proxmox:
                return []
            try:
                params = {}
                if content:
                    params['content'] = content
                storages = self.proxmox.nodes(node).storage.get(**params)
                return storages
            except Exception as e:
                logger.error(f"Error getting storages for node {node}: {e}")
                return []

        def vzdump_guest(self, node: str, vmid: int, storage: str,
                         compress: str = 'zstd', mode: str = 'snapshot') -> Dict:
            """
            Создать резервную копию VM/LXC через vzdump.
    
            Args:
                node: Имя ноды
                vmid: ID ВМ или контейнера
                storage: Хранилище для бэкапа (должно поддерживать content=backup)
                compress: Алгоритм сжатия (zstd, lzo, gzip, 0)
                mode: Режим снятия бэкапа (snapshot, suspend, stop)
    
            Returns:
                Dict с UPID задачи
            """
            if not self.proxmox:
                return {'success': False, 'error': 'Not connected'}
    
            try:
                upid = self.proxmox.nodes(node).vzdump.post(
                    vmid=vmid,
                    storage=storage,
                    compress=compress,
                    mode=mode,
                    remove=0,  # не удалять старые бэкапы автоматически
                )
                logger.info(f"vzdump started for vmid {vmid} on {node}, storage {storage}, UPID: {upid}")
                return {'success': True, 'upid': upid, 'vmid': vmid}
            except Exception as e:
                logger.error(f"Ошибка vzdump vmid {vmid} на {node}: {e}")
                return {'success': False, 'error': str(e), 'vmid': vmid}

        def get_backup_storages(self, node: str) -> List[Dict]:
            """
            Получить список хранилищ, поддерживающих content=backup на ноде.
    
            Returns:
                Список Dict с полями: storage, type, content, avail, total
            """
            if not self.proxmox:
                return []
    
            try:
                storages = self.proxmox.nodes(node).storage.get(content='backup', enabled=1)
                return storages
            except Exception as e:
                logger.error(f"Ошибка получения backup-хранилищ для {node}: {e}")
                return []

