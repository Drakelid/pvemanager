"""
Async background workers for VM/LXC operations: reinstall, clone, change_password.

These run in the same `_deploy_executor` thread pool used by deploy, and report
progress through DeployTask records (with `kind` field) + WebSocket broadcast.
"""

from __future__ import annotations

import time
from typing import Optional

from loguru import logger

from ...db import SessionLocal
from ...models import ProxmoxServer, VMInstance, OSTemplate, DeployTask, User
from ...proxmox_client import ProxmoxClient
from ...logging_service import LoggingService
from ._helpers import _get_proxmox_client, get_next_vmid


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
        if not cached or not cached.template_id:
            _update_deploy_task(task_id, 'failed', 'Шаблон не привязан', 0,
                                error='У VM не сохранён шаблон, переустановка недоступна')
            return

        tpl = db.query(OSTemplate).filter(OSTemplate.id == cached.template_id).first()
        if not tpl or not tpl.vmid:
            _update_deploy_task(task_id, 'failed', 'Шаблон не найден', 0, error='Шаблон не найден или некорректен')
            return

        # Resolve template VMID & source node (cross-node aware)
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
        is_lxc = (cached.vm_type == 'lxc')
        memory_mb = int(memory) // (1024 * 1024) if memory else None

        _update_deploy_task(task_id, 'running', 'Подключение к Proxmox...', 10, vmid=vmid, node=node)
        client = _connect(server)
        if not client:
            _update_deploy_task(task_id, 'failed', 'Ошибка подключения к Proxmox', 10,
                                error='Не удалось подключиться к Proxmox серверу')
            return

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

        # 3) Clone from template
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

        LoggingService.log_proxmox_action(
            db=db, action='reinstall',
            resource_type='lxc' if is_lxc else 'vm', resource_id=vmid,
            username=username, resource_name=name,
            server_id=server_id, server_name=server.name, node_name=node,
            details={'template_id': tpl.id, 'template_vmid': template_vmid}, success=True,
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

def _do_clone_sync(task_id: int, server_id: int, src_vmid: int, node: str, vm_type: str,
                   new_name: str, full: bool, target_node: Optional[str],
                   target_storage: Optional[str], description: Optional[str],
                   user_id: int, username: str):
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
            client.wait_for_task(node, upid, timeout=600)
        except Exception:
            pass

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
