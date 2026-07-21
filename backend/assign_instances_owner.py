#!/usr/bin/env python3
"""
Массовое назначение владельца (owner_id) инстансам vm_instances.

Инстансы, синхронизированные из Proxmox, создаются без владельца
(owner_id = NULL) и потому не видны обычным пользователям на странице
«Инстансы» (и, после закрытия утечек, на страницах нод/дашборде).
Этот скрипт назначает существующим инстансам конкретного пользователя.

Примеры (внутри контейнера app):
    # Все активные инстансы -> пользователю testuser
    python assign_instances_owner.py --user testuser --all

    # Только инстансы сервера 1
    python assign_instances_owner.py --user testuser --server 1

    # Конкретные VMID (на всех серверах или в связке с --server)
    python assign_instances_owner.py --user testuser --vmids 100,101,102

    # Снять владельца (сделать ничейными)
    python assign_instances_owner.py --clear --all

    # Предпросмотр без записи
    python assign_instances_owner.py --user testuser --all --dry-run

Запуск через docker compose:
    docker compose exec app python assign_instances_owner.py --user testuser --all
"""
import argparse
import sys

sys.path.insert(0, '/app')

from app.db import get_db
from app.models import User, VMInstance


def main() -> int:
    parser = argparse.ArgumentParser(description="Назначить владельца инстансам")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--user", help="Username, которому назначить инстансы")
    target.add_argument("--clear", action="store_true",
                        help="Снять владельца (owner_id = NULL)")

    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true",
                       help="Все активные инстансы")
    scope.add_argument("--vmids", help="Список VMID через запятую (напр. 100,101)")

    parser.add_argument("--server", type=int, default=None,
                        help="Ограничить конкретным Proxmox server_id")
    parser.add_argument("--include-deleted", action="store_true",
                        help="Также затронуть soft-deleted записи")
    parser.add_argument("--dry-run", action="store_true",
                        help="Показать, что будет изменено, без записи")
    args = parser.parse_args()

    db = next(get_db())
    try:
        owner_id = None
        if args.user:
            user = db.query(User).filter(User.username == args.user).first()
            if not user:
                print(f"❌ Пользователь '{args.user}' не найден")
                return 1
            owner_id = user.id

        query = db.query(VMInstance)
        if not args.include_deleted:
            query = query.filter(VMInstance.deleted_at.is_(None))
        if args.server is not None:
            query = query.filter(VMInstance.server_id == args.server)
        if args.vmids:
            try:
                vmids = [int(v.strip()) for v in args.vmids.split(",") if v.strip()]
            except ValueError:
                print("❌ --vmids должен быть списком чисел через запятую")
                return 1
            query = query.filter(VMInstance.vmid.in_(vmids))

        instances = query.order_by(VMInstance.server_id, VMInstance.vmid).all()
        if not instances:
            print("⚠️  Под указанные условия не попал ни один инстанс")
            return 0

        action = "снятие владельца" if args.clear else f"назначение владельца -> {args.user} (id={owner_id})"
        print(f"Найдено инстансов: {len(instances)}. Действие: {action}"
              f"{' [dry-run]' if args.dry_run else ''}")
        for inst in instances:
            print(f"  server={inst.server_id} vmid={inst.vmid} "
                  f"name={inst.name!r} owner_id: {inst.owner_id} -> "
                  f"{'NULL' if args.clear else owner_id}")

        if args.dry_run:
            print("Ничего не записано (--dry-run).")
            return 0

        for inst in instances:
            inst.owner_id = owner_id
        db.commit()
        print(f"✅ Обновлено записей: {len(instances)}")
        return 0
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
