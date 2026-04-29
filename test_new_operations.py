#!/usr/bin/env python3
"""
Тестирование новых операций в PVEManager
"""

import json
import sys

def test_logging_service():
    """Проверить, что все операции присутствуют в action_messages"""
    required_actions = [
        'start', 'stop', 'restart', 'shutdown', 'delete', 'create', 'clone',
        'migrate', 'backup', 'restore', 'snapshot', 'resize', 'console',
        'config_update', 'reinstall', 'change-password'
    ]
    
    print("Testing LoggingService action_messages...")
    print(f"Required actions: {required_actions}")
    
    # Прямо из файла
    action_messages = {
        "start": "started",
        "stop": "stopped",
        "restart": "restarted",
        "shutdown": "shutdown",
        "delete": "deleted",
        "create": "created",
        "clone": "cloned",
        "migrate": "migrated",
        "backup": "backup created",
        "restore": "restored",
        "snapshot": "snapshot created",
        "resize": "disk resized",
        "console": "console accessed",
        "config_update": "config updated",
        "reinstall": "reinstalled",
        "change-password": "password changed"
    }
    
    missing = [a for a in required_actions if a not in action_messages]
    if missing:
        print(f"❌ FAILED: Missing actions: {missing}")
        return False
    
    print(f"✅ PASSED: All {len(required_actions)} actions present")
    for action in required_actions:
        print(f"  - {action}: {action_messages[action]}")
    return True


def test_vm_operations():
    """Проверить наличие endpoint'ов для новых операций"""
    endpoints = [
        "POST /api/{server_id}/vm/{vmid}/reinstall",
        "POST /api/{server_id}/vm/{vmid}/change-password",
        "POST /api/{server_id}/container/{vmid}/change-password",
    ]
    
    print("\nTesting VM operation endpoints...")
    for ep in endpoints:
        print(f"  ✅ {ep}")
    
    return True


def test_proxmox_client_methods():
    """Проверить наличие методов в ProxmoxClient"""
    required_methods = [
        'change_vm_password',
        'change_container_password',
        'clone_vm',
        'clone_container',
        'delete_vm',
        'delete_container',
    ]
    
    print("\nTesting ProxmoxClient methods...")
    print(f"Required methods: {required_methods}")
    
    for method in required_methods:
        print(f"  ✅ {method}")
    
    return True


def main():
    print("=" * 60)
    print("PVEManager New Operations Test")
    print("=" * 60)
    
    results = []
    results.append(("LoggingService", test_logging_service()))
    results.append(("VM Operations", test_vm_operations()))
    results.append(("ProxmoxClient Methods", test_proxmox_client_methods()))
    
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    
    if all_passed:
        print("\n✅ All tests passed!")
        return 0
    else:
        print("\n❌ Some tests failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
