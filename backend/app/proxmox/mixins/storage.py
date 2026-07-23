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

        def download_url(self, node: str, storage: str, url: str, content: str,
                         filename: str, checksum: Optional[str] = None,
                         checksum_algorithm: Optional[str] = None) -> Optional[str]:
            """
            Скачать файл (ISO / vztmpl / образ для импорта) по URL прямо на ноду
            средствами Proxmox (aria2). Использует endpoint
            POST /nodes/{node}/storage/{storage}/download-url.

            Args:
                node: имя ноды
                storage: целевое хранилище
                url: прямой URL к образу (.img/.qcow2/.iso/.tar.zst ...)
                content: тип контента ('iso', 'vztmpl', 'import')
                filename: имя файла в хранилище
                checksum: контрольная сумма (опционально)
                checksum_algorithm: алгоритм (md5/sha1/sha224/sha256/sha384/sha512)

            Returns:
                UPID задачи или None
            """
            if not self.proxmox:
                return None
            try:
                params = {
                    'url': url,
                    'content': content,
                    'filename': filename,
                }
                if checksum and checksum_algorithm:
                    params['checksum'] = checksum
                    params['checksum-algorithm'] = checksum_algorithm
                # 'download-url' содержит дефис — обращаемся через call-форму proxmoxer
                result = self.proxmox.nodes(node).storage(storage)('download-url').post(**params)
                logger.info(f"Запущена загрузка {filename} ({content}) на {node}:{storage}, UPID: {result}")
                return result
            except Exception as e:
                logger.error(f"Ошибка загрузки {url} на {node}:{storage}: {e}")
                raise

        def volume_exists(self, node: str, storage: str, volid: str) -> bool:
            """Проверить, есть ли уже том volid в хранилище (для идемпотентной загрузки)."""
            if not self.proxmox:
                return False
            try:
                items = self.proxmox.nodes(node).storage(storage).content.get()
                return any(it.get('volid') == volid for it in (items or []))
            except Exception as e:
                logger.debug(f"volume_exists check failed {storage}/{volid}: {e}")
                return False

        def get_download_target_storages(self, node: str, content: str) -> List[Dict]:
            """
            Получить активные хранилища ноды, поддерживающие указанный тип контента
            (для выбора цели загрузки образов).

            Args:
                node: имя ноды
                content: 'iso' | 'vztmpl' | 'images' | 'import'
            """
            if not self.proxmox:
                return []
            result: List[Dict] = []
            try:
                for s in self.proxmox.nodes(node).storage.get():
                    if s.get('active', 1) == 0 or s.get('enabled', 1) == 0:
                        continue
                    if content in (s.get('content', '') or '').split(','):
                        result.append(s)
            except Exception as e:
                logger.error(f"Ошибка получения хранилищ ({content}) ноды {node}: {e}")
            return result

        def get_storage_node_status(self) -> Dict[str, List[Dict[str, Any]]]:
            """
            Доступность каждого хранилища по нодам — одним запросом /cluster/resources.

            Конфиг кластера (/storage) не знает, поднялось ли хранилище на конкретной
            ноде: VG/пул может быть объявлен, но физически отсутствовать — типичный
            случай после ввода новой ноды в кластер, где локальные хранилища ноды
            заменяются кластерным конфигом.

            Хранилища, отключённые в конфиге (disable), в /cluster/resources не
            попадают, поэтому в карте их не будет.

            Returns:
                {storage_id: [{'node': 'prod', 'active': True}, ...]}
            """
            if not self.proxmox:
                return {}
            status: Dict[str, List[Dict[str, Any]]] = {}
            try:
                for res in self.get_cluster_resources(type_='storage'):
                    storage_id = res.get('storage')
                    node = res.get('node')
                    if not storage_id or not node:
                        continue
                    status.setdefault(storage_id, []).append({
                        'node': node,
                        'active': res.get('status') == 'available',
                    })
            except Exception as e:
                logger.error(f"Ошибка получения статусов хранилищ с {self.host}: {e}")
            return status

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

        def get_node_pci_devices(self, node: str) -> List[Dict]:
            """
            Получить список PCI-устройств ноды для passthrough (hostpciN).

            Returns:
                Список Dict с полями: id (0000:01:00.0), vendor_name, device_name,
                iommugroup, mdev, subsystem_* и т.д. Отсортирован по id.
            """
            if not self.proxmox:
                return []
            try:
                devices = self.proxmox.nodes(node).hardware.pci.get()
                return sorted(devices, key=lambda d: d.get('id', ''))
            except Exception as e:
                logger.error(f"Ошибка получения PCI-устройств ноды {node}: {e}")
                return []

        def get_node_usb_devices(self, node: str) -> List[Dict]:
            """
            Получить список USB-устройств ноды для passthrough (usbN).

            Returns:
                Список Dict с полями: busnum, devnum, vendid, prodid, port,
                usbpath, class, speed, prodname/manufacturer. Отсортирован по usbpath.
            """
            if not self.proxmox:
                return []
            try:
                # Не все версии PVE отдают hardware/usb; scanusb — исторический fallback.
                try:
                    devices = self.proxmox.nodes(node).hardware.usb.get()
                except Exception:
                    devices = self.proxmox.nodes(node).scanusb.get()
                # Отбрасываем корневые хабы без vendor/product id — их нельзя пробросить.
                cleaned = [d for d in devices if d.get('vendid') and d.get('prodid')]
                return sorted(cleaned, key=lambda d: str(d.get('usbpath') or d.get('port') or ''))
            except Exception as e:
                logger.error(f"Ошибка получения USB-устройств ноды {node}: {e}")
                return []

