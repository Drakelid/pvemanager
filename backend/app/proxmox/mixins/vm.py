from typing import List, Dict, Optional, Union, Any
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
                disks = []
                seen_disks: set = set()
                for fs in fslist:
                    if not isinstance(fs, dict):
                        continue
                    total = fs.get('total-bytes', 0) or 0
                    if total == 0:
                        continue
                    # Deduplicate by disk+partition key to avoid pseudo-filesystems
                    disk_key = fs.get('name', '') or fs.get('mountpoint', '')
                    if disk_key in seen_disks:
                        continue
                    seen_disks.add(disk_key)
                    disks.append({
                        'name': fs.get('name', ''),
                        'mountpoint': fs.get('mountpoint', '/'),
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

