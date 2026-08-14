from typing import List, Dict, Optional, Union, Any
import re
import time
import urllib3
from loguru import logger

class VmMixin:
        def start_vm(self, node: str, vmid: int) -> Optional[str]:
            """Запустить VM. Возвращает UPID задачи или None при ошибке."""
            if not self.proxmox:
                return None
            
            try:
                upid = self.proxmox.nodes(node).qemu(vmid).status.start.post()
                return upid if isinstance(upid, str) else None
            except Exception as e:
                logger.error(f"Ошибка запуска VM {vmid} на {node}: {e}")
                return None

        def stop_vm(self, node: str, vmid: int, force: bool = False) -> Optional[str]:
            """Остановить VM. Возвращает UPID задачи или None при ошибке."""
            if not self.proxmox:
                return None
            
            try:
                upid = self.proxmox.nodes(node).qemu(vmid).status.stop.post()
                return upid if isinstance(upid, str) else None
            except Exception as e:
                logger.error(f"Ошибка остановки VM {vmid} на {node}: {e}")
                return None

        def restart_vm(self, node: str, vmid: int) -> Optional[str]:
            """Перезапустить VM. Возвращает UPID задачи или None при ошибке."""
            if not self.proxmox:
                return None
            
            try:
                upid = self.proxmox.nodes(node).qemu(vmid).status.reboot.post()
                return upid if isinstance(upid, str) else None
            except Exception as e:
                logger.error(f"Ошибка перезапуска VM {vmid} на {node}: {e}")
                return None

        def _wait_vm_stopped(self, node: str, vmid: int, timeout: int) -> bool:
            """Опрашивать статус ВМ, пока не 'stopped' или не выйдет timeout секунд."""
            deadline = time.time() + timeout
            while time.time() < deadline:
                st = self.get_vm_status(node, vmid) or {}
                if st.get('status') == 'stopped':
                    return True
                time.sleep(1)
            return False

        def hybrid_restart_vm(self, node: str, vmid: int,
                              graceful_timeout: int = 20) -> bool:
            """Перезапуск «мягко, при таймауте — жёстко», затем start.

            status/shutdown с forceStop=1 сначала шлёт ACPI-выключение, а если гость
            не ответил за graceful_timeout секунд — Proxmox сам убивает процесс QEMU.
            Это покрывает и живую ОС (корректное выключение), и свежий установщик без
            ACPI/QEMU Guest Agent (где обычный reboot виснет на guest-ping). Нужен для
            применения нового boot order. Возвращает True, если ВМ снова запущена.
            """
            if not self.proxmox:
                return False
            try:
                self.proxmox.nodes(node).qemu(vmid).status.shutdown.post(
                    timeout=graceful_timeout, forceStop=1)
                # Ждём с запасом сверх graceful_timeout (форс-стоп внутри shutdown).
                if not self._wait_vm_stopped(node, vmid, graceful_timeout + 20):
                    # Подстраховка: shutdown завис — бьём по процессу напрямую.
                    logger.warning(f"VM {vmid}: shutdown не завершился, принудительный stop")
                    self.proxmox.nodes(node).qemu(vmid).status.stop.post()
                    if not self._wait_vm_stopped(node, vmid, 15):
                        logger.error(f"VM {vmid} не остановилась — старт отменён")
                        return False
                upid = self.proxmox.nodes(node).qemu(vmid).status.start.post()
                logger.info(f"VM {vmid} на {node}: гибридный перезапуск выполнен, UPID: {upid}")
                return isinstance(upid, str)
            except Exception as e:
                logger.error(f"Ошибка гибридного перезапуска VM {vmid} на {node}: {e}")
                return False

        def shutdown_vm(self, node: str, vmid: int, timeout: int = 60) -> Optional[str]:
            """Корректно выключить VM (ACPI). Возвращает UPID задачи."""
            if not self.proxmox:
                return None
            try:
                upid = self.proxmox.nodes(node).qemu(vmid).status.shutdown.post(timeout=timeout)
                return upid if isinstance(upid, str) else None
            except Exception as e:
                logger.error(f"Ошибка корректного выключения VM {vmid} на {node}: {e}")
                return None

        def clone_vm(self, node: str, vmid: int, new_vmid: int, name: str,
                     full: bool = True, target_node: Optional[str] = None,
                     target_storage: Optional[str] = None,
                     description: Optional[str] = None) -> Optional[str]:
            """Клонировать VM (qemu). Работает и для шаблонов, и для обычных VM."""
            if not self.proxmox:
                return None
            try:
                params = {'newid': new_vmid, 'name': name, 'full': 1 if full else 0}
                if target_storage:
                    params['storage'] = target_storage
                if target_node and target_node != node:
                    params['target'] = target_node
                if description:
                    params['description'] = description
                upid = self.proxmox.nodes(node).qemu(vmid).clone.post(**params)
                return upid if isinstance(upid, str) else None
            except Exception as e:
                logger.error(f"Ошибка клонирования VM {vmid} -> {new_vmid}: {e}")
                return None

        def change_vm_password(self, node: str, vmid: int, username: str, password: str) -> Dict:
            """
            Сменить пароль пользователя на VM через QEMU guest agent.
            Требует установленный qemu-guest-agent в VM.
            """
            if not self.proxmox:
                return {'success': False, 'error': 'Proxmox connection not initialized'}
            try:
                # Proxmox API: POST /nodes/{node}/qemu/{vmid}/agent/set-user-password
                self.proxmox.nodes(node).qemu(vmid).agent('set-user-password').post(
                    username=username,
                    password=password,
                )
                return {'success': True}
            except Exception as e:
                logger.error(f"Не удалось сменить пароль на VM {vmid}: {e}")
                return {'success': False, 'error': str(e)}

        def set_vm_notes(self, node: str, vmid: int, description: str) -> bool:
            """Установить description (заметки) у VM."""
            if not self.proxmox:
                return False
            try:
                self.proxmox.nodes(node).qemu(vmid).config.put(description=description or '')
                return True
            except Exception as e:
                logger.error(f"Ошибка обновления заметок VM {vmid}: {e}")
                return False

        def create_vm_from_iso(self, node: str, vmid: int, name: str,
                               memory: int, cores: int,
                               disk_storage: str, disk_size: int,
                               iso_volid: Optional[str] = None,
                               bridge: str = 'vmbr0',
                               ostype: str = 'l26',
                               disk_bus: str = 'scsi',
                               net_model: str = 'virtio',
                               bios: str = 'seabios',
                               tpm: bool = False,
                               extra_iso_volid: Optional[str] = None,
                               onboot: bool = False,
                               description: Optional[str] = None) -> Optional[str]:
            """
            Создать «пустую» ВМ под установку ОС с ISO.

            В отличие от create_vm_with_import диск не импортируется из образа,
            а аллоцируется пустым (`<storage>:<size_gb>`), ISO подключается
            CD-ROM'ом на ide2 и ставится первым в порядке загрузки. Консоль —
            графическая (vga=std), иначе установщик не будет виден в noVNC.

            Args:
                disk_size: размер пустого диска в GB
                iso_volid: volid установочного ISO ('local:iso/ubuntu.iso'); None — без ISO
                disk_bus: шина диска — scsi | sata | virtio (ide занят CD-ROM'ом)
                net_model: модель сетевой карты (virtio | e1000 | rtl8139)
                bios: seabios | ovmf (UEFI — добавляется efidisk0 и machine=q35)
                tpm: добавить TPM 2.0 (требуется для Windows 11)
                extra_iso_volid: второй ISO на ide0 (например, virtio-win с драйверами)

            Returns:
                UPID задачи создания ВМ

            Исключение пробрасывается наверх — воркеру нужен текст ошибки Proxmox.
            """
            if not self.proxmox:
                return None

            bus = disk_bus if disk_bus in ('scsi', 'sata', 'virtio') else 'scsi'
            disk_dev = f'{bus}0'
            disk_opts = ',discard=on' + (',iothread=1' if bus in ('scsi', 'virtio') else '')

            params = {
                'vmid': vmid,
                'name': name,
                'memory': memory,
                'cores': cores,
                'sockets': 1,
                'cpu': 'host',
                'ostype': ostype,
                'scsihw': 'virtio-scsi-single',
                disk_dev: f'{disk_storage}:{disk_size}{disk_opts}',
                'net0': f'{net_model},bridge={bridge},firewall=1',
                'agent': 'enabled=1',
                'vga': 'std',
                'onboot': 1 if onboot else 0,
            }
            if iso_volid:
                params['ide2'] = f'{iso_volid},media=cdrom'
                params['boot'] = f'order=ide2;{disk_dev}'
            else:
                params['boot'] = f'order={disk_dev}'
            if extra_iso_volid:
                # ide0 — второй привод под ISO с драйверами (ide2 занят основным)
                params['ide0'] = f'{extra_iso_volid},media=cdrom'
            if bios == 'ovmf':
                params['bios'] = 'ovmf'
                params['machine'] = 'q35'
                # Ключи Secure Boot нужны Windows и мешают части Linux-установщиков
                pre_enrolled = 1 if ostype.startswith('win') else 0
                params['efidisk0'] = f'{disk_storage}:1,efitype=4m,pre-enrolled-keys={pre_enrolled}'
            if tpm:
                params['tpmstate0'] = f'{disk_storage}:1,version=v2.0'
            if description:
                params['description'] = description

            result = self.proxmox.nodes(node).qemu.post(**params)
            logger.info(f"Создание ВМ {vmid} ({name}) под установку с {iso_volid or 'без ISO'} на {node}, UPID: {result}")
            return result

        def attach_iso(self, node: str, vmid: int, iso_volid: str, device: str = 'ide2') -> bool:
            """Подключить ISO образ к VM (только KVM)."""
            if not self.proxmox:
                return False
            try:
                value = f"{iso_volid},media=cdrom"
                self.proxmox.nodes(node).qemu(vmid).config.put(**{device: value})
                return True
            except Exception as e:
                logger.error(f"Ошибка подключения ISO {iso_volid} к VM {vmid}: {e}")
                return False

        def detach_iso(self, node: str, vmid: int, device: str = 'ide2') -> bool:
            """Отключить ISO образ (CD-ROM) у VM."""
            if not self.proxmox:
                return False
            try:
                self.proxmox.nodes(node).qemu(vmid).config.put(**{device: 'none,media=cdrom'})
                return True
            except Exception as e:
                logger.error(f"Ошибка отключения ISO у VM {vmid}: {e}")
                return False

        def _ordered_boot_disks(self, cfg: Dict,
                                exclude_device: Optional[str] = None) -> List[str]:
            """Загрузочные диски ВМ (не CD-ROM, не пустые) в порядке текущего boot.

            Порядок между дисками берём из текущего boot=order=...; недостающие
            добавляем в конец. exclude_device исключается принудительно. efidisk/
            tpmstate не проходят regex дисковых устройств, поэтому не попадают.
            """
            disk_re = re.compile(r'^(?:scsi|virtio|sata|ide)\d+$')
            disks: List[str] = []
            for key, val in cfg.items():
                if not disk_re.match(key):
                    continue
                if exclude_device and key == exclude_device:
                    continue
                if not isinstance(val, str) or not val:
                    continue
                if 'media=cdrom' in val or val.startswith('none'):
                    continue
                disks.append(key)

            ordered: List[str] = []
            m = re.search(r'order=([^,]+)', str(cfg.get('boot') or ''))
            if m:
                for dev in m.group(1).split(';'):
                    if dev in disks and dev not in ordered:
                        ordered.append(dev)
            for dev in disks:
                if dev not in ordered:
                    ordered.append(dev)
            return ordered

        def set_boot_disk_first(self, node: str, vmid: int,
                                exclude_device: Optional[str] = None) -> bool:
            """Поставить дисковые устройства первыми в порядке загрузки, исключив CD-ROM.

            Используется после установки ОС: извлекли ISO — грузимся с диска.
            exclude_device (например отключаемый ide2) исключается из рассмотрения.
            """
            if not self.proxmox:
                return False
            try:
                cfg = self.proxmox.nodes(node).qemu(vmid).config.get() or {}
                ordered = self._ordered_boot_disks(cfg, exclude_device=exclude_device)
                if not ordered:
                    logger.warning(f"VM {vmid}: не найден загрузочный диск для boot order")
                    return False
                self.proxmox.nodes(node).qemu(vmid).config.put(boot=f"order={';'.join(ordered)}")
                logger.info(f"VM {vmid} на {node}: порядок загрузки → диск ({';'.join(ordered)})")
                return True
            except Exception as e:
                logger.error(f"Ошибка установки boot order (диск) у VM {vmid}: {e}")
                return False

        def set_boot_iso_first(self, node: str, vmid: int,
                               iso_device: str = 'ide2') -> bool:
            """Поставить CD-ROM (ISO) первым в порядке загрузки, диски — следом.

            Используется при монтировании ISO на работающую ВМ, когда нужно
            загрузиться именно с образа (live-CD, восстановление, переустановка).
            iso_device — привод с ISO (ide2 по умолчанию).
            """
            if not self.proxmox:
                return False
            try:
                cfg = self.proxmox.nodes(node).qemu(vmid).config.get() or {}
                disks = self._ordered_boot_disks(cfg)  # CD-ROM сюда не попадёт
                order = [iso_device] + [d for d in disks if d != iso_device]
                self.proxmox.nodes(node).qemu(vmid).config.put(boot=f"order={';'.join(order)}")
                logger.info(f"VM {vmid} на {node}: порядок загрузки → ISO ({';'.join(order)})")
                return True
            except Exception as e:
                logger.error(f"Ошибка установки boot order (ISO) у VM {vmid}: {e}")
                return False

        def force_stop_vm(self, node: str, vmid: int) -> bool:
            """Принудительно остановить ВМ (через SSH - аналог kill -9)"""
            if not self.proxmox or not self.host:
                return False
            
            try:
                # Пробуем остановить через SSH команду
                # Сначала получаем информацию о ВМ
                vm_info = self.proxmox.nodes(node).qemu(vmid).status.current.get()
                if vm_info.get('status') != 'running':
                    logger.info(f"VM {vmid} на {node} уже остановлена")
                    return True
                
                # Используем qm sendkey или qm stop с timeout=0
                try:
                    # Пробуем обычный stop - может сработать
                    self.proxmox.nodes(node).qemu(vmid).status.stop.post()
                    logger.info(f"Принудительная остановка VM {vmid} на {node} выполнена")
                    return True
                except Exception as api_error:
                    logger.warning(f"Прямой stop не сработал, ошибка: {api_error}")
                    # Если прямой stop не сработал, это просто значит что ВМ не бежит или API не поддерживает
                    return False
                    
            except Exception as e:
                logger.error(f"Ошибка принудительной остановки VM {vmid}: {e}")
                return False

        def get_vm_status(self, node: str, vmid: int) -> Optional[Dict]:
            """Получить статус конкретной VM"""
            if not self.proxmox:
                return None
            
            try:
                status = self.proxmox.nodes(node).qemu(vmid).status.current.get()
                return status
            except Exception as e:
                logger.error(f"Ошибка получения статуса VM {vmid} на {node}: {e}")
                return None

        def get_vm_stats(self, node: str, vmid: int) -> Optional[Dict]:
            """Получить статистику VM (CPU, память, диск)"""
            return self.get_vm_status(node, vmid)

        def get_vm_fsinfo(self, node: str, vmid: int) -> list:
            """Return per-filesystem info via QEMU guest agent (get-fsinfo).
            Returns [] if agent is not installed or unreachable."""
            if not self.proxmox:
                return []
            try:
                result = self.proxmox.nodes(node).qemu(vmid).agent('get-fsinfo').get()
                fslist = result if isinstance(result, list) else result.get('result', [])
                _SKIP_MOUNTPOINT_PREFIXES = ('/snap/', '/boot/')
                _SKIP_DISK_PREFIXES = ('loop',)

                disks = []
                seen_disks: set = set()
                for fs in fslist:
                    if not isinstance(fs, dict):
                        continue
                    total = fs.get('total-bytes', 0) or 0
                    if total == 0:
                        continue
                    mountpoint = fs.get('mountpoint', '/')
                    name = fs.get('name', '')
                    if any(mountpoint.startswith(p) for p in _SKIP_MOUNTPOINT_PREFIXES):
                        continue
                    if any(name.lower().startswith(p) for p in _SKIP_DISK_PREFIXES):
                        continue
                    disk_key = name or mountpoint
                    if disk_key in seen_disks:
                        continue
                    seen_disks.add(disk_key)
                    disks.append({
                        'name': name,
                        'mountpoint': mountpoint,
                        'used': fs.get('used-bytes', 0) or 0,
                        'total': total,
                    })
                return disks
            except Exception:
                return []

        def get_vm_rrddata(self, node: str, vmid: int, timeframe: str = "hour") -> Dict:
            """
            Получить исторические данные VM для графиков (CPU, Memory, Network, Disk IO)
            
            Args:
                node: Имя ноды
                vmid: ID виртуальной машины
                timeframe: Период времени (hour, day, week, month, year)
            
            Returns:
                Dict с временными рядами данных
            """
            if not self.proxmox:
                return {}
            
            try:
                rrddata = self.proxmox.nodes(node).qemu(vmid).rrddata.get(timeframe=timeframe)
                return {'data': rrddata, 'timeframe': timeframe}
            except Exception as e:
                logger.error(f"Ошибка получения RRD данных VM {vmid} на {node}: {e}")
                return {}

        def get_vm_vnc(self, node: str, vmid: int) -> Dict:
            """
            Получить данные для VNC подключения к VM
            
            Args:
                node: Имя ноды
                vmid: ID виртуальной машины
            
            Returns:
                Dict с данными VNC (port, ticket, cert, upid)
            """
            if not self.proxmox:
                return {}
            
            try:
                # Создать VNC прокси сессию
                vnc_data = self.proxmox.nodes(node).qemu(vmid).vncproxy.post(websocket=1)
                return vnc_data
            except Exception as e:
                logger.error(f"Ошибка получения VNC для VM {vmid} на {node}: {e}")
                return {}

        def resize_vm_disk(self, node: str, vmid: int, disk: str, size: str) -> bool:
            """
            Изменить размер диска VM
            
            Args:
                node: Имя ноды
                vmid: ID виртуальной машины
                disk: Имя диска (scsi0, virtio0 и т.д.)
                size: Новый размер (+10G, 50G)
            
            Returns:
                True при успехе
            """
            if not self.proxmox:
                return False
            
            resize_upid = self.proxmox.nodes(node).qemu(vmid).resize.put(disk=disk, size=size)
            # Дожидаемся завершения задачи и ПРОВЕРЯЕМ её результат: Proxmox
            # создаёт задачу даже на несуществующий диск, и она падает с
            # exitstatus вроде "disk 'scsi0' does not exist". Без этой проверки
            # упавший ресайз ошибочно считался успешным.
            if isinstance(resize_upid, str):
                if not self.wait_for_task(node, resize_upid, timeout=120):
                    status = self.get_task_status(node, resize_upid) or {}
                    reason = status.get('exitstatus') or 'resize task failed'
                    logger.error(f"Ресайз диска {disk} VM {vmid} провалился: {reason}")
                    raise RuntimeError(f"Proxmox: {reason}")
            logger.info(f"Размер диска {disk} VM {vmid} изменен на {size}")
            return True

        def move_vm_disk(self, node: str, vmid: int, disk: str, target_storage: str,
                         delete: bool = True, target_format: str = None) -> Dict:
            """Переместить диск VM в другое хранилище (POST qemu/{vmid}/move_disk).

            Args:
                disk: имя диска (scsi0, virtio0, ...)
                target_storage: целевое хранилище
                delete: удалить исходный диск после копирования
                target_format: raw|qcow2|vmdk (опционально)
            Returns:
                {"success": bool, "upid"?: str, "error"?: str}
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            try:
                params = {"disk": disk, "storage": target_storage, "delete": 1 if delete else 0}
                if target_format:
                    params["format"] = target_format
                upid = self.proxmox.nodes(node).qemu(vmid).move_disk.post(**params)
                if isinstance(upid, str):
                    if not self.wait_for_task(node, upid, timeout=3600):
                        status = self.get_task_status(node, upid) or {}
                        reason = status.get("exitstatus") or "move_disk task failed"
                        logger.error(f"Move диска {disk} VM {vmid} провалился: {reason}")
                        return {"success": False, "error": f"Proxmox: {reason}"}
                logger.info(f"Диск {disk} VM {vmid} перемещён в {target_storage}")
                return {"success": True, "upid": upid if isinstance(upid, str) else None}
            except Exception as e:
                logger.error(f"Ошибка перемещения диска {disk} VM {vmid}: {e}")
                return {"success": False, "error": str(e)}

        def add_vm_disk(self, node: str, vmid: int, disk: str, storage: str, size_gb: int,
                        ssd: bool = False, discard: bool = False, iothread: bool = False) -> Dict:
            """Добавить новый диск VM (config.put c аллокацией storage:size).

            Args:
                disk: имя устройства (scsi1, virtio1, ...) — должно быть свободно
                storage: хранилище для нового диска
                size_gb: размер в ГБ
                ssd/discard/iothread: опциональные флаги
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            try:
                spec = f"{storage}:{int(size_gb)}"
                if ssd:
                    spec += ",ssd=1"
                if discard:
                    spec += ",discard=on"
                if iothread:
                    spec += ",iothread=1"
                self.proxmox.nodes(node).qemu(vmid).config.post(**{disk: spec})
                logger.info(f"Добавлен диск {disk} ({spec}) к VM {vmid}")
                return {"success": True}
            except Exception as e:
                logger.error(f"Ошибка добавления диска {disk} к VM {vmid}: {e}")
                return {"success": False, "error": str(e)}

        def attach_vm_physical_disk(self, node: str, vmid: int, disk: str, devpath: str,
                                    aio: Optional[str] = None, discard: bool = False,
                                    ssd: bool = False, serial: Optional[str] = None) -> Dict:
            """Пробросить физический диск ноды в VM (raw device passthrough).

            В отличие от add_vm_disk, значение конфига — абсолютный путь устройства
            (`/dev/disk/by-id/...`), а не аллокация storage:size. Эквивалент
            `qm set <vmid> -<disk> /dev/disk/by-id/...`.

            Args:
                disk: имя устройства (scsi1, virtio1, sata1, ...) — должно быть свободно
                devpath: абсолютный путь блочного устройства (желательно /dev/disk/by-id/*)
                aio: io_uring | native | threads (опц.)
                discard/ssd: опциональные флаги
                serial: серийный номер для гостя (опц.)
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            # Защита от инъекции произвольного volid: пробрасываем только пути под /dev/.
            if not isinstance(devpath, str) or not devpath.startswith("/dev/"):
                return {"success": False, "error": "Недопустимый путь устройства (ожидается /dev/...)"}
            try:
                spec = devpath
                if aio in ("io_uring", "native", "threads"):
                    spec += f",aio={aio}"
                if discard:
                    spec += ",discard=on"
                if ssd:
                    spec += ",ssd=1"
                if serial:
                    spec += f",serial={serial}"
                self.proxmox.nodes(node).qemu(vmid).config.post(**{disk: spec})
                logger.info(f"Проброшен физический диск {disk} ({spec}) в VM {vmid}")
                return {"success": True}
            except Exception as e:
                logger.error(f"Ошибка проброса физического диска {disk} в VM {vmid}: {e}")
                return {"success": False, "error": str(e)}

        def detach_vm_disk(self, node: str, vmid: int, disk: str, destroy: bool = False) -> Dict:
            """Отключить диск VM. destroy=True — также физически удалить том.

            PVE переводит отключённый диск в unusedN (том сохраняется). Чтобы удалить
            данные, вторым шагом удаляем соответствующую unused-запись (её значение —
            volid исходного диска). Без destroy диск просто становится unused.
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            try:
                # volid исходного диска — по нему найдём unused-запись после отключения
                old_volid = None
                if destroy:
                    cfg = self.get_vm_config(node, vmid) or {}
                    spec = cfg.get(disk)
                    if isinstance(spec, str):
                        old_volid = spec.split(",", 1)[0]

                self.proxmox.nodes(node).qemu(vmid).config.put(delete=disk)

                if destroy and old_volid:
                    cfg2 = self.get_vm_config(node, vmid) or {}
                    unused_key = next(
                        (k for k, v in cfg2.items()
                         if k.startswith("unused") and isinstance(v, str) and old_volid in v),
                        None,
                    )
                    if unused_key:
                        self.proxmox.nodes(node).qemu(vmid).config.put(delete=unused_key)
                        logger.info(f"Том {old_volid} диска {disk} VM {vmid} удалён ({unused_key})")

                logger.info(f"Диск {disk} VM {vmid} отключён (destroy={destroy})")
                return {"success": True}
            except Exception as e:
                logger.error(f"Ошибка отключения диска {disk} VM {vmid}: {e}")
                return {"success": False, "error": str(e)}

        def unlock_vm(self, node: str, vmid: int) -> Dict:
            """Снять блокировку (lock) с VM — аналог `qm unlock`.

            Реализуется через config.put(delete='lock', skiplock=1). skiplock
            принимается Proxmox только для root@pam (в т.ч. API-токенов root@pam).
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            try:
                self.proxmox.nodes(node).qemu(vmid).config.put(delete="lock", skiplock=1)
                logger.info(f"С VM {vmid} снята блокировка")
                return {"success": True}
            except Exception as e:
                logger.error(f"Ошибка снятия блокировки VM {vmid}: {e}")
                return {"success": False, "error": str(e)}

        def grow_vm_filesystem(self, node: str, vmid: int, mountpoint: str = "/") -> Dict:
            """
            Расширить раздел и файловую систему внутри гостя после ресайза диска.

            Выполняется через QEMU guest agent (требуется qemu-guest-agent и
            cloud-guest-utils/growpart в гостевой ОС). Best-effort: возвращает
            результат, но не бросает исключений.

            Args:
                node: Имя ноды
                vmid: ID виртуальной машины
                mountpoint: Точка монтирования для расширения (по умолчанию корень)

            Returns:
                Dict с ключами success, stdout, stderr, exit_code (как execute_script)
            """
            # Скрипт находит блочное устройство, отвечающее за mountpoint,
            # расширяет его раздел через growpart и затем растягивает ФС под
            # её тип (ext*/xfs/btrfs).
            script = f"""#!/bin/bash
set -u
MP="{mountpoint}"
SRC="$(findmnt -nro SOURCE "$MP" 2>/dev/null)"
[ -z "$SRC" ] && SRC="$(awk -v m="$MP" '$2==m{{print $1}}' /proc/mounts | head -n1)"
# strip btrfs subvolume suffix like [/@]
SRC="${{SRC%%[*}}"
DEV="$(readlink -f "$SRC" 2>/dev/null || echo "$SRC")"
BASE="$(basename "$DEV")"
PK="$(lsblk -nro PKNAME "$DEV" 2>/dev/null | head -n1)"
PARTNUM="$(cat "/sys/class/block/$BASE/partition" 2>/dev/null)"
echo "target mount=$MP dev=$DEV disk=${{PK:-?}} part=${{PARTNUM:-?}}"
if [ -z "$PK" ] || [ -z "$PARTNUM" ]; then
  echo "ERROR: cannot resolve disk/partition for $MP" >&2
  exit 1
fi
DISK="/dev/$PK"
SIZE_BEFORE="$(blockdev --getsize64 "$DISK" 2>/dev/null || echo 0)"
echo "disk bytes before rescan: $SIZE_BEFORE"
# Force kernel to re-read disk capacity. Critical for SATA/SCSI where it
# is not updated live. Retry because rescan is asynchronous.
for i in 1 2 3 4 5; do
  echo 1 > "/sys/class/block/$PK/device/rescan" 2>/dev/null || true
  partprobe "$DISK" 2>/dev/null || true
  SIZE_NOW="$(blockdev --getsize64 "$DISK" 2>/dev/null || echo 0)"
  [ "$SIZE_NOW" != "$SIZE_BEFORE" ] && break
  sleep 1
done
echo "disk bytes after rescan: $(blockdev --getsize64 "$DISK" 2>/dev/null)"
if ! command -v growpart >/dev/null 2>&1; then
  echo "ERROR: growpart not installed (apt install cloud-guest-utils)" >&2
  exit 2
fi
growpart "$DISK" "$PARTNUM"; GP=$?
echo "growpart rc=$GP"
partx -u "$DISK" 2>/dev/null || true
FSTYPE="$(findmnt -nro FSTYPE "$MP" 2>/dev/null)"
echo "fstype=$FSTYPE"
case "$FSTYPE" in
  ext2|ext3|ext4) resize2fs "$DEV" ;;
  xfs) xfs_growfs "$MP" ;;
  btrfs) btrfs filesystem resize max "$MP" ;;
  *) echo "WARN: unknown fstype '$FSTYPE', skipping fs grow" >&2 ;;
esac
echo "new fs size: $(findmnt -nro SIZE "$MP" 2>/dev/null)"
echo "grow done"
"""
            try:
                result = self.execute_script(node, vmid, script, timeout=120)
                out = (result.get('stdout', '') or '') + (result.get('stderr', '') or '')
                # growpart печатает "CHANGED:" когда раздел реально вырос
                result['changed'] = 'CHANGED' in out
                logger.info(
                    f"growpart VM {vmid}: exit={result.get('exit_code')} "
                    f"changed={result['changed']}\n{out.strip()}"
                )
                return result
            except Exception as e:
                logger.warning(f"Не удалось выполнить growpart в VM {vmid}: {e}")
                return {'success': False, 'error': str(e), 'stdout': '', 'stderr': '', 'exit_code': -1}

