"""
Async background workers for VM/LXC operations: reinstall, clone, change_password.

These run in the same `_deploy_executor` thread pool used by deploy, and report
progress through DeployTask records (with `kind` field) + WebSocket broadcast.
"""

from __future__ import annotations

import re
import time
from typing import Optional

from loguru import logger

from ...db import SessionLocal
from ...models import ProxmoxServer, VMInstance, OSTemplate, DeployTask, User
from ...proxmox import ProxmoxClient
from ...logging_service import LoggingService
from ._helpers import _get_proxmox_client, get_next_vmid, save_vm_instance, save_vm_instance


# Re-use deploy executor and update helper
from ..templates import _deploy_executor, _update_deploy_task  # noqa: F401


def _connect(server: ProxmoxServer) -> Optional[ProxmoxClient]:
    """Return connected ProxmoxClient or None."""
    client = _get_proxmox_client(server)
    return client if client.is_connected() else None


# ==================== Reinstall ====================

def _do_reinstall_sync(task_id: int, server_id: int, vmid: int, node: str,
                       user_id: int, username: str):
    """Re-create VM/LXC from its saved template under the same VMID."""
    db = SessionLocal()
    server = None
    is_lxc = False
    try:
        _update_deploy_task(task_id, 'running', 'Подготовка...', 5, vmid=vmid, node=node)

        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            _update_deploy_task(task_id, 'failed', 'Сервер не найден', 0, error='Proxmox сервер не найден')
            return

        cached = db.query(VMInstance).filter(
            VMInstance.server_id == server_id,
            VMInstance.vmid == vmid,
            VMInstance.deleted_at.is_(None),
        ).first()
        if not cached:
            _update_deploy_task(task_id, 'failed', 'VM не найдена', 0,
                                error='Запись об инстансе не найдена')
            return

        is_lxc = (cached.vm_type == 'lxc')
        # Two reinstall modes:
        #   1) clone-from-template (cached.template_id → OSTemplate.vmid). Used by VM
        #      templates and LXC clones from a template VMID.
        #   2) ostemplate-file (LXC only, cached.template_name like "local:vztmpl/...tar.zst")
        tpl = None
        ostemplate_file = None
        if cached.template_id:
            tpl = db.query(OSTemplate).filter(OSTemplate.id == cached.template_id).first()
            if not tpl or not tpl.vmid:
                _update_deploy_task(task_id, 'failed', 'Шаблон не найден', 0,
                                    error='Шаблон не найден или некорректен')
                return
        elif is_lxc and cached.template_name and ':' in cached.template_name:
            ostemplate_file = cached.template_name
        else:
            _update_deploy_task(task_id, 'failed', 'Шаблон не привязан', 0,
                                error='У инстанса не сохранён шаблон, переустановка недоступна')
            return

        # Resolve template VMID & source node (cross-node aware) — only for clone mode
        template_source_node = node
        template_vmid = None
        if tpl is not None:
            local_template_vmid = tpl.get_vmid_for_node(node)
            if local_template_vmid:
                template_source_node = node
                template_vmid = local_template_vmid
            else:
                template_source_node = tpl.get_source_node() or tpl.node or node
                template_vmid = tpl.vmid

        name = cached.name
        cores = cached.cores
        memory = cached.memory
        description = cached.description
        memory_mb = int(memory) // (1024 * 1024) if memory else None

        _update_deploy_task(task_id, 'running', 'Подключение к Proxmox...', 10, vmid=vmid, node=node)
        client = _connect(server)
        if not client:
            _update_deploy_task(task_id, 'failed', 'Ошибка подключения к Proxmox', 10,
                                error='Не удалось подключиться к Proxmox серверу')
            return

        # Snapshot current container/VM config — needed for LXC ostemplate-recreate
        # (network, swap, storage, features, etc. aren't all stored in VMInstance)
        prev_cfg = {}
        try:
            if is_lxc:
                prev_cfg = client.get_container_config(node, vmid) or {}
            else:
                prev_cfg = client.get_vm_config(node, vmid) or {}
        except Exception as _ce:
            logger.warning(f"[REINSTALL #{task_id}] could not fetch current config: {_ce}")

        # 1) Stop
        _update_deploy_task(task_id, 'running', 'Остановка инстанса...', 20, vmid=vmid, node=node)
        try:
            if is_lxc:
                client.stop_container(node, vmid, force=False)
            else:
                client.stop_vm(node, vmid, force=False)
        except Exception:
            pass
        for _ in range(20):
            try:
                st = client.get_container_status(node, vmid) if is_lxc else client.get_vm_status(node, vmid)
                if not st or st.get('status') != 'running':
                    break
            except Exception:
                break
            time.sleep(0.5)

        # 2) Delete
        _update_deploy_task(task_id, 'running', 'Удаление старого инстанса...', 35, vmid=vmid, node=node)
        try:
            if is_lxc:
                client.delete_container(node, vmid, force=False)
            else:
                client.delete_vm(node, vmid, force=False)
        except Exception as e:
            _update_deploy_task(task_id, 'failed', 'Ошибка удаления', 35, error=f'Не удалось удалить инстанс: {e}')
            return
        for _ in range(30):
            st = client.get_container_status(node, vmid) if is_lxc else client.get_vm_status(node, vmid)
            if not st:
                break
            time.sleep(1)

        # 3) Re-create from template
        if ostemplate_file:
            # ---- LXC: re-create from CT template file with same VMID ----
            _update_deploy_task(task_id, 'running',
                                f'Создание контейнера из шаблона {ostemplate_file.split("/")[-1]}...',
                                50, vmid=vmid, node=node)

            # Extract storage/rootfs size from previous rootfs entry (e.g. "local-lvm:vm-118-disk-0,size=8G")
            storage = 'local-lvm'
            rootfs_size = 8
            try:
                rootfs_val = prev_cfg.get('rootfs', '')
                if rootfs_val:
                    storage = rootfs_val.split(':', 1)[0]
                    if 'size=' in rootfs_val:
                        sz = rootfs_val.split('size=')[1].split(',')[0].strip()
                        if sz.endswith('G'):
                            rootfs_size = int(float(sz[:-1]))
                        elif sz.endswith('M'):
                            rootfs_size = max(1, int(sz[:-1]) // 1024)
                        elif sz.endswith('T'):
                            rootfs_size = int(float(sz[:-1])) * 1024
            except Exception:
                pass

            # net0: prefer existing config (preserves bridge/ip/gateway/vlan/firewall)
            net0 = prev_cfg.get('net0')
            if not net0:
                ip_part = 'ip=dhcp'
                if cached.ip_address:
                    prefix = cached.ip_prefix or 24
                    ip_part = f'ip={cached.ip_address}/{prefix}'
                    if cached.gateway:
                        ip_part += f',gw={cached.gateway}'
                net0 = f'name=eth0,bridge=vmbr0,{ip_part},firewall=1'

            # Other params with sane fallbacks
            swap_mb = 512
            try:
                if 'swap' in prev_cfg:
                    swap_mb = int(prev_cfg['swap'])
            except Exception:
                pass

            unprivileged = True
            try:
                if 'unprivileged' in prev_cfg:
                    unprivileged = bool(int(prev_cfg['unprivileged']))
            except Exception:
                pass

            onboot = False
            try:
                if 'onboot' in prev_cfg:
                    onboot = bool(int(prev_cfg['onboot']))
            except Exception:
                pass

            features = prev_cfg.get('features')  # None → create_lxc_container will default to nesting=1
            nameserver = prev_cfg.get('nameserver') or cached.nameserver
            searchdomain = prev_cfg.get('searchdomain')

            try:
                upid = client.create_lxc_container(
                    node=node,
                    vmid=vmid,
                    ostemplate=ostemplate_file,
                    hostname=name,
                    cores=cores or 1,
                    memory=memory_mb or 512,
                    swap=swap_mb,
                    storage=storage,
                    rootfs_size=rootfs_size,
                    net0=net0,
                    nameserver=nameserver,
                    searchdomain=searchdomain,
                    password=cached.cloud_init_password,
                    ssh_public_keys=cached.ssh_keys,
                    unprivileged=unprivileged,
                    start_after_create=False,
                    onboot=onboot,
                    description=description or f'Reinstalled from {ostemplate_file}',
                    features=features,
                )
            except Exception as e:
                _update_deploy_task(task_id, 'failed', 'Ошибка создания контейнера', 50,
                                    error=f'Create failed: {e}')
                return
            if not upid:
                _update_deploy_task(task_id, 'failed', 'Ошибка создания контейнера', 50,
                                    error='Proxmox не вернул UPID задачи создания контейнера')
                return

            _update_deploy_task(task_id, 'running', 'Ожидание завершения создания...', 75,
                                vmid=vmid, node=node)
            try:
                client.wait_for_task(node, upid, timeout=600)
            except Exception:
                pass
        else:
            # ---- Clone-from-template (VM or LXC with template_id) ----
            _update_deploy_task(task_id, 'running', f'Клонирование из шаблона {tpl.name}...', 50, vmid=vmid, node=node)
            try:
                if is_lxc:
                    upid = client.clone_container(
                        node=template_source_node, vmid=template_vmid, new_vmid=vmid,
                        hostname=name, full=True, target_node=node,
                        description=description,
                    )
                else:
                    upid = client.clone_vm(
                        node=template_source_node, vmid=template_vmid, new_vmid=vmid,
                        name=name, full=True, target_node=node,
                        description=description,
                    )
            except Exception as e:
                _update_deploy_task(task_id, 'failed', 'Ошибка клонирования', 50, error=f'Clone failed: {e}')
                return
            if not upid:
                _update_deploy_task(task_id, 'failed', 'Ошибка клонирования', 50,
                                    error='Proxmox не вернул UPID задачи клонирования')
                return

            _update_deploy_task(task_id, 'running', 'Ожидание завершения клонирования...', 75, vmid=vmid, node=node)
            try:
                client.wait_for_task(template_source_node, upid, timeout=600)
            except Exception:
                pass

        # 4) Re-apply config
        _update_deploy_task(task_id, 'running', 'Применение конфигурации...', 90, vmid=vmid, node=node)
        try:
            cfg = {}
            if cores:
                cfg['cores'] = cores
            if memory_mb:
                cfg['memory'] = memory_mb
            if cfg:
                if is_lxc:
                    client.update_container_config(node, vmid, cfg)
                else:
                    client.update_vm_config(node, vmid, cfg)
        except Exception as _ce:
            logger.warning(f"[REINSTALL #{task_id}] re-apply config failed: {_ce}")

        # 5) Restore disk size
        disk_size_bytes = cached.disk_size
        if disk_size_bytes and disk_size_bytes > 0:
            _update_deploy_task(task_id, 'running', 'Восстановление размера диска...', 92, vmid=vmid, node=node)
            try:
                disk_size_gb = disk_size_bytes // (1024 ** 3)
                if is_lxc:
                    lxc_cfg = client.get_container_config(node, vmid)
                    current_size_gb = 0
                    if lxc_cfg and 'rootfs' in lxc_cfg:
                        rootfs_val = lxc_cfg['rootfs']
                        if 'size=' in rootfs_val:
                            size_part = rootfs_val.split('size=')[1].split(',')[0]
                            if size_part.endswith('G'):
                                current_size_gb = int(size_part[:-1])
                            elif size_part.endswith('M'):
                                current_size_gb = int(size_part[:-1]) // 1024
                    if disk_size_gb > current_size_gb:
                        client.resize_container_disk(node, vmid, 'rootfs', f'{disk_size_gb}G')
                        logger.info(f"[REINSTALL #{task_id}] LXC {vmid} rootfs resized from {current_size_gb}G to {disk_size_gb}G")
                    else:
                        logger.info(f"[REINSTALL #{task_id}] LXC {vmid} rootfs already {current_size_gb}G >= {disk_size_gb}G, skip resize")
                else:
                    vm_cfg = client.get_vm_config(node, vmid)
                    disk_key = None
                    current_size_gb = 0
                    if vm_cfg:
                        for key in ['scsi0', 'virtio0', 'sata0', 'scsi1', 'virtio1']:
                            if key in vm_cfg:
                                disk_val = vm_cfg[key]
                                if 'cdrom' in disk_val.lower() or 'cloudinit' in disk_val.lower() or 'media=cdrom' in disk_val.lower():
                                    continue
                                disk_key = key
                                if 'size=' in disk_val:
                                    size_part = disk_val.split('size=')[1].split(',')[0]
                                    if size_part.endswith('G'):
                                        current_size_gb = int(size_part[:-1])
                                    elif size_part.endswith('M'):
                                        current_size_gb = int(size_part[:-1]) // 1024
                                break
                    if disk_key and disk_size_gb > current_size_gb:
                        client.resize_vm_disk(node, vmid, disk_key, f'{disk_size_gb}G')
                        logger.info(f"[REINSTALL #{task_id}] VM {vmid} {disk_key} resized from {current_size_gb}G to {disk_size_gb}G")
                    elif disk_key:
                        logger.info(f"[REINSTALL #{task_id}] VM {vmid} {disk_key} already {current_size_gb}G >= {disk_size_gb}G, skip resize")
                    else:
                        logger.warning(f"[REINSTALL #{task_id}] VM {vmid} no main disk found for resize")
            except Exception as _re:
                logger.warning(f"[REINSTALL #{task_id}] disk resize failed: {_re}")

        # 6) Start VM/LXC
        _update_deploy_task(task_id, 'running', 'Запуск инстанса...', 96, vmid=vmid, node=node)
        try:
            if is_lxc:
                client.start_container(node, vmid)
            else:
                client.start_vm(node, vmid)
            logger.info(f"[REINSTALL #{task_id}] vmid={vmid} started after reinstall")
        except Exception as _se:
            logger.warning(f"[REINSTALL #{task_id}] start after reinstall failed: {_se}")

        LoggingService.log_proxmox_action(
            db=db, action='reinstall',
            resource_type='lxc' if is_lxc else 'vm', resource_id=vmid,
            username=username, resource_name=name,
            server_id=server_id, server_name=server.name, node_name=node,
            details={
                'template_id': tpl.id if tpl else None,
                'template_vmid': template_vmid,
                'ostemplate': ostemplate_file,
            }, success=True,
        )

        _update_deploy_task(task_id, 'completed', 'Переустановка завершена', 100, vmid=vmid, node=node)
        logger.info(f"[REINSTALL #{task_id}] vmid={vmid} reinstalled by {username}")
    except Exception as e:
        err = str(e)
        logger.error(f"[REINSTALL #{task_id}] failed: {err}")
        try:
            if server is not None:
                LoggingService.log_proxmox_action(
                    db=db, action='reinstall',
                    resource_type='lxc' if is_lxc else 'vm', resource_id=vmid,
                    username=username, server_id=server_id,
                    server_name=server.name, node_name=node,
                    success=False, error_message=err,
                )
        except Exception:
            pass
        _update_deploy_task(task_id, 'failed', f'Ошибка: {err[:150]}', 0, error=err)
    finally:
        db.close()


# ==================== Clone ====================

_PCT_RE = re.compile(r"\((\d{1,3}(?:\.\d+)?)\s*%\)")


def _wait_clone_with_progress(client, task_id: int, node: str, upid: str,
                              timeout: int = 600) -> bool:
    """Wait for a PVE clone task, mapping its disk-copy % to deploy progress 50→95.

    PVE reports copy progress only in the task log (e.g. "transferred 12.0 GiB of
    20.0 GiB (59.94%)"), so we tail the log and parse the last percentage seen.
    """
    start = time.time()
    log_pos = 0
    last_reported = -1
    while time.time() - start < timeout:
        # Tail new log lines and extract the most recent percentage.
        try:
            lines = client.get_task_log(node, upid, start=log_pos, limit=500) or []
        except Exception:
            lines = []
        pct = None
        for line in lines:
            log_pos = max(log_pos, line.get('n', log_pos) or log_pos)
            m = _PCT_RE.search(line.get('t', '') or '')
            if m:
                try:
                    pct = float(m.group(1))
                except ValueError:
                    pass
        if pct is not None:
            progress = 50 + int(min(pct, 100) * 0.45)  # 50..95
            if progress != last_reported:
                last_reported = progress
                _update_deploy_task(task_id, 'running',
                                    f'Копирование диска... {pct:.0f}%', progress)

        status = client.get_task_status(node, upid)
        if status and status.get('status') == 'stopped':
            exit_status = status.get('exitstatus')
            return exit_status == 'OK' or (
                isinstance(exit_status, str) and exit_status.startswith('WARNINGS:'))
        time.sleep(2)

    logger.warning(f"Таймаут ожидания задачи клонирования {upid}")
    return False


def _do_clone_sync(task_id: int, server_id: int, src_vmid: int, node: str, vm_type: str,
                   new_name: str, full: bool, target_node: Optional[str],
                   target_storage: Optional[str], description: Optional[str],
                   user_id: int, username: str, owner_id: Optional[int] = None):
    """Clone existing VM/LXC into a new VMID."""
    db = SessionLocal()
    server = None
    is_lxc = (vm_type == 'lxc')
    new_vmid: Optional[int] = None
    try:
        _update_deploy_task(task_id, 'running', 'Подключение к Proxmox...', 10, node=node)
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            _update_deploy_task(task_id, 'failed', 'Сервер не найден', 0, error='Proxmox сервер не найден')
            return
        client = _connect(server)
        if not client:
            _update_deploy_task(task_id, 'failed', 'Ошибка подключения к Proxmox', 10,
                                error='Не удалось подключиться к Proxmox серверу')
            return

        _update_deploy_task(task_id, 'running', 'Аллокация VMID...', 30, node=node)
        new_vmid = client.get_next_vmid() or get_next_vmid(db, server_id)
        if not new_vmid:
            _update_deploy_task(task_id, 'failed', 'Не удалось выделить VMID', 30, error='Failed to allocate new VMID')
            return

        _update_deploy_task(task_id, 'running', f'Клонирование → VMID {new_vmid}...', 50,
                            vmid=new_vmid, node=target_node or node)
        try:
            if is_lxc:
                upid = client.clone_container(
                    node=node, vmid=src_vmid, new_vmid=new_vmid, hostname=new_name,
                    full=full, target_node=target_node,
                    target_storage=target_storage, description=description,
                )
            else:
                upid = client.clone_vm(
                    node=node, vmid=src_vmid, new_vmid=new_vmid, name=new_name,
                    full=full, target_node=target_node,
                    target_storage=target_storage, description=description,
                )
        except Exception as e:
            _update_deploy_task(task_id, 'failed', 'Ошибка клонирования', 50, error=f'Clone failed: {e}')
            return
        if not upid:
            _update_deploy_task(task_id, 'failed', 'Ошибка клонирования', 50, error='Proxmox не вернул UPID')
            return

        _update_deploy_task(task_id, 'running', 'Ожидание завершения клонирования...', 70,
                            vmid=new_vmid, node=target_node or node)
        try:
            _wait_clone_with_progress(client, task_id, node, upid, timeout=600)
        except Exception:
            pass

        # Register the cloned instance locally so it gets an owner and is visible
        # to limited users (live list also picks it up from PVE, but without owner).
        try:
            save_vm_instance(
                db=db, server_id=server_id, vmid=new_vmid,
                node=target_node or node, vm_type=vm_type, name=new_name,
                description=description, owner_id=owner_id or user_id,
            )
        except Exception as reg_err:
            logger.warning(f"[CLONE #{task_id}] failed to register instance: {reg_err}")

        LoggingService.log_proxmox_action(
            db=db, action='clone',
            resource_type='lxc' if is_lxc else 'vm', resource_id=src_vmid,
            username=username, server_id=server_id,
            server_name=server.name, node_name=node,
            details={'new_vmid': new_vmid, 'name': new_name}, success=True,
        )

        _update_deploy_task(task_id, 'completed', f'Клонирование завершено (VMID {new_vmid})', 100,
                            vmid=new_vmid, node=target_node or node)
        logger.info(f"[CLONE #{task_id}] {src_vmid} -> {new_vmid} ({new_name}) by {username}")
    except Exception as e:
        err = str(e)
        logger.error(f"[CLONE #{task_id}] failed: {err}")
        _update_deploy_task(task_id, 'failed', f'Ошибка: {err[:150]}', 0, error=err)
    finally:
        db.close()


# ==================== Change Password ====================

def _do_change_password_sync(task_id: int, server_id: int, vmid: int, node: str, vm_type: str,
                             target_username: str, password: str,
                             user_id: int, username: str):
    """Change password inside VM (qemu-guest-agent) or LXC (pct exec)."""
    db = SessionLocal()
    server = None
    is_lxc = (vm_type == 'lxc')
    try:
        _update_deploy_task(task_id, 'running', 'Подключение к Proxmox...', 30, vmid=vmid, node=node)
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            _update_deploy_task(task_id, 'failed', 'Сервер не найден', 0, error='Proxmox сервер не найден')
            return
        client = _connect(server)
        if not client:
            _update_deploy_task(task_id, 'failed', 'Ошибка подключения к Proxmox', 30,
                                error='Не удалось подключиться к Proxmox серверу')
            return

        _update_deploy_task(task_id, 'running', f'Смена пароля для {target_username}...', 60,
                            vmid=vmid, node=node)
        if is_lxc:
            res = client.change_container_password(node, vmid, target_username, password)
        else:
            res = client.change_vm_password(node, vmid, target_username, password)

        if not res.get('success'):
            err = res.get('error') or 'Failed to change password'
            _update_deploy_task(task_id, 'failed', 'Ошибка смены пароля', 60, error=err)
            try:
                LoggingService.log_proxmox_action(
                    db=db, action='change-password',
                    resource_type='lxc' if is_lxc else 'vm', resource_id=vmid,
                    username=username, server_id=server_id,
                    server_name=server.name, node_name=node,
                    details={'target_user': target_username}, success=False, error_message=err,
                )
            except Exception:
                pass
            return

        LoggingService.log_proxmox_action(
            db=db, action='change-password',
            resource_type='lxc' if is_lxc else 'vm', resource_id=vmid,
            username=username, server_id=server_id,
            server_name=server.name, node_name=node,
            details={'target_user': target_username}, success=True,
        )

        _update_deploy_task(task_id, 'completed', 'Пароль успешно изменён', 100, vmid=vmid, node=node)
        logger.info(f"[CHPASS #{task_id}] vmid={vmid} target_user={target_username} by {username}")
    except Exception as e:
        err = str(e)
        logger.error(f"[CHPASS #{task_id}] failed: {err}")
        _update_deploy_task(task_id, 'failed', f'Ошибка: {err[:150]}', 0, error=err)
    finally:
        db.close()
