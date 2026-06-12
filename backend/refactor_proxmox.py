import ast
import re
import os

source_file = 'app/proxmox_client.py'
with open(source_file, 'r', encoding='utf-8') as f:
    source_code = f.read()

lines = source_code.split('\n')

class Extractor(ast.NodeVisitor):
    def __init__(self):
        self.methods = {}
        self.module_funcs = []
        
    def visit_ClassDef(self, node):
        if node.name == 'ProxmoxClient':
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    start = item.lineno - 1
                    end = item.end_lineno
                    if item.decorator_list:
                        start = item.decorator_list[0].lineno - 1
                    code = '\n'.join(lines[start:end])
                    self.methods[item.name] = code
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        if node.col_offset == 0:  # Module-level function
            start = node.lineno - 1
            end = node.end_lineno
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            code = '\n'.join(lines[start:end])
            self.module_funcs.append(code)
        self.generic_visit(node)
        
    def visit_AsyncFunctionDef(self, node):
        if node.col_offset == 0:  # Module-level async function
            start = node.lineno - 1
            end = node.end_lineno
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            code = '\n'.join(lines[start:end])
            self.module_funcs.append(code)
        self.generic_visit(node)

tree = ast.parse(source_code)
extractor = Extractor()
extractor.visit(tree)

methods = extractor.methods
module_funcs = extractor.module_funcs

groups = {
    'vm': ['start_vm', 'stop_vm', 'restart_vm', 'shutdown_vm', 'clone_vm', 'change_vm_password', 
           'set_vm_notes', 'attach_iso', 'detach_iso', 'force_stop_vm', 'get_vm_status', 'get_vm_stats', 
           'get_vm_rrddata', 'get_vm_vnc', 'get_vm_spice', 'qemu_agent_exec', 'resize_vm_disk', 'reinstall_vm_from_template'],
    'lxc': ['start_container', 'stop_container', 'restart_container', 'shutdown_container', 'clone_container', 
            'change_container_password', 'set_container_notes', 'force_stop_container', 'get_container_status', 
            'get_container_stats', 'get_container_rrddata', 'get_container_vnc', 'get_container_spice', 'resize_lxc_disk', 'reinstall_lxc_from_template'],
    'cluster': ['is_cluster', 'get_ha_resources', 'get_ha_groups', 'is_in_ha', 'add_to_ha', 'remove_from_ha', 'get_ha_status', 
                'create_cluster', 'get_cluster_join_info', 'join_cluster', 'delete_cluster_node', '_delete_cluster_node_via_ssh'],
    'storage': ['get_node_isos', 'get_lxc_storage_templates', 'get_node_storages', 'vzdump_guest', 'get_backup_storages', 
                'get_backup_jobs', 'create_backup_job', 'update_backup_job', 'delete_backup_job', 'run_backup_job', 'get_backup_job_status'],
    'network': ['get_sdn_vnets', 'get_sdn_zones', 'get_sdn_controllers', 'get_sdn_ipams', 'get_sdn_dns', 
                'apply_sdn', 'create_sdn_zone', 'create_sdn_vnet', 'create_sdn_subnet', 'get_sdn_vnet_subnets',
                'get_node_interfaces'],
    'snapshot': ['get_vm_snapshots', 'create_vm_snapshot', 'rollback_vm_snapshot', 'delete_vm_snapshot',
                 'get_container_snapshots', 'create_container_snapshot', 'rollback_container_snapshot', 'delete_container_snapshot',
                 'get_guest_snapshots', 'create_guest_snapshot', 'rollback_guest_snapshot', 'delete_guest_snapshot']
}

mixins_code = {}

for group, group_methods in groups.items():
    mixin_name = group.capitalize() + 'Mixin'
    code = f"from typing import List, Dict, Optional, Union, Any\nimport time\nimport urllib3\nfrom loguru import logger\n\nclass {mixin_name}:\n"
    has_methods = False
    for m in group_methods:
        if m in methods:
            # indent
            method_code = '\n'.join(['    ' + l for l in methods[m].split('\n')])
            code += method_code + "\n\n"
            has_methods = True
    if has_methods:
        mixins_code[group] = code

os.makedirs('app/proxmox/mixins', exist_ok=True)
for group, code in mixins_code.items():
    with open(f'app/proxmox/mixins/{group}.py', 'w') as f:
        f.write(code)

print("Mixins created successfully.")

core_methods = []
for m, code in methods.items():
    found = False
    for group_methods in groups.values():
        if m in group_methods:
            found = True
            break
    if not found:
        core_methods.append(code)

imports = """import time
import urllib3
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Union, Any
from proxmoxer import ProxmoxAPI, AuthenticationError
from loguru import logger
import threading

from .mixins.vm import VmMixin
from .mixins.lxc import LxcMixin
from .mixins.cluster import ClusterMixin
from .mixins.storage import StorageMixin
from .mixins.network import NetworkMixin
from .mixins.snapshot import SnapshotMixin

proxmox_executor = ThreadPoolExecutor(max_workers=20, thread_name_prefix="proxmox_")

connection_cache = {}
connection_cache_lock = threading.Lock()
MAX_CACHE_SIZE = 50

"""

client_code = imports

for fcode in module_funcs:
    client_code += fcode + "\n\n"

client_code += "class ProxmoxClient(VmMixin, LxcMixin, ClusterMixin, StorageMixin, NetworkMixin, SnapshotMixin):\n"
for mcode in core_methods:
    client_code += '\n'.join(['    ' + l for l in mcode.split('\n')]) + "\n\n"

with open('app/proxmox/client.py', 'w') as f:
    f.write(client_code)

print("Client created successfully.")
