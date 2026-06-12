import ast
import os
import re

source_file = 'app/api/proxmox/vms.py'
with open(source_file, 'r', encoding='utf-8') as f:
    source_code = f.read()

lines = source_code.split('\n')

class RouterExtractor(ast.NodeVisitor):
    def __init__(self):
        self.routes = []
        self.models = []
        self.imports = []
        self.other = []

    def visit_Import(self, node):
        if node.col_offset == 0:
            start = node.lineno - 1
            end = node.end_lineno
            self.imports.append('\n'.join(lines[start:end]))
        self.generic_visit(node)
        
    def visit_ImportFrom(self, node):
        if node.col_offset == 0:
            start = node.lineno - 1
            end = node.end_lineno
            self.imports.append('\n'.join(lines[start:end]))
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        if node.col_offset == 0:
            start = node.lineno - 1
            end = node.end_lineno
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            code = '\n'.join(lines[start:end])
            self.models.append((node.name, code))
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        if node.col_offset == 0:
            start = node.lineno - 1
            end = node.end_lineno
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            code = '\n'.join(lines[start:end])
            
            # Check if it's a router
            is_router = False
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                    if hasattr(dec.func.value, 'id') and dec.func.value.id == 'router':
                        is_router = True
                        break
            
            if is_router:
                self.routes.append((node.name, code))
            else:
                self.other.append((node.name, code))
        self.generic_visit(node)
        
    def visit_AsyncFunctionDef(self, node):
        if node.col_offset == 0:
            start = node.lineno - 1
            end = node.end_lineno
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            code = '\n'.join(lines[start:end])
            
            is_router = False
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                    if hasattr(dec.func.value, 'id') and dec.func.value.id == 'router':
                        is_router = True
                        break
            
            if is_router:
                self.routes.append((node.name, code))
            else:
                self.other.append((node.name, code))
        self.generic_visit(node)

extractor = RouterExtractor()
tree = ast.parse(source_code)
extractor.visit(tree)

groups = {
    'crud': ['sync_vms', 'get_virtual_machines', 'delete_vm', 'delete_container'],
    'actions': ['clone_vm', 'clone_container', 'reinstall_vm', 'reinstall_lxc', 'vm_action', 'container_action', 'execute_vm_command', 'execute_vm_script', 'container_exec'],
    'ha': ['get_ha_status', 'get_ha_details', 'add_to_ha', 'remove_from_ha'],
    'console': ['get_vm_vnc', 'get_container_vnc', 'vnc_websocket', 'get_vm_terminal', 'get_container_terminal', 'terminal_websocket'],
    'config': ['change_vm_password', 'change_container_password', 'get_vm_config', 'update_vm_config', 'resize_vm_disk', 'resize_lxc_disk', 
               'get_container_config', 'update_container_config', 'get_vm_owner', 'update_vm_owner', 'update_vm_notes', 'attach_vm_iso', 'detach_vm_iso',
               'get_nodes', 'get_vm_status', 'get_container_status', 'get_vm_interfaces', 'get_container_interfaces', 'get_vm_rrddata', 'get_container_rrddata',
               'get_vm_saved_config'],
    'lxc': ['get_lxc_templates', 'get_all_lxc_templates', 'get_available_lxc_templates', 'download_lxc_template', 'create_lxc', 'create_lxc_smart', 'clone_lxc'],
    'bulk': ['bulk_operation']
}

mixins_code = {}

imports_code = '\n'.join(extractor.imports)
imports_code = re.sub(r'from \.\.\.api', 'from ....api', imports_code)
imports_code = re.sub(r'from \.\.\.models', 'from ....models', imports_code)
imports_code = re.sub(r'from \.\.\.services', 'from ....services', imports_code)
imports_code = re.sub(r'from \.\.\.db', 'from ....db', imports_code)
imports_code = re.sub(r'from \.\.\.auth', 'from ....auth', imports_code)
imports_code = re.sub(r'from \.\.\.proxmox', 'from ....proxmox', imports_code)
imports_code = re.sub(r'from \.\.\.logging', 'from ....logging', imports_code)
imports_code = re.sub(r'from \.\.\.ipam', 'from ....ipam', imports_code)
imports_code = imports_code.replace('from ._helpers', 'from .._helpers')

models_code = '\n\n'.join([m[1] for m in extractor.models])
other_code = '\n\n'.join([o[1] for o in extractor.other])

base_code = f"{imports_code}\n\nrouter = APIRouter()\n\n{models_code}\n\n{other_code}\n\n"

for group, methods in groups.items():
    code = base_code
    for r_name, r_code in extractor.routes:
        if r_name in methods:
            code += r_code + "\n\n"
    mixins_code[group] = code

for group, code in mixins_code.items():
    with open(f'app/api/proxmox/vms/{group}.py', 'w') as f:
        f.write(code)

init_code = "from fastapi import APIRouter\n"
for group in groups.keys():
    init_code += f"from .{group} import router as {group}_router\n"
init_code += "\nrouter = APIRouter()\n"
for group in groups.keys():
    init_code += f"router.include_router({group}_router)\n"

with open('app/api/proxmox/vms/__init__.py', 'w') as f:
    f.write(init_code)

print("VMS routes split successfully.")
