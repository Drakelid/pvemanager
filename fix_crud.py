import sys

with open('backend/app/api/proxmox/vms.py.bak', 'r') as f:
    lines = f.readlines()

cache_lines = lines[27:30]
func_lines = lines[55:277]

with open('backend/app/api/proxmox/vms/crud.py', 'r') as f:
    crud_content = f.read()

# Insert before the first route, or at the end. Let's insert after _get_client_or_503
insert_idx = crud_content.find('@router.delete("/api/{server_id}/vm/{vmid}")')

new_content = crud_content[:insert_idx] + "".join(cache_lines) + "\n" + "".join(func_lines) + "\n\n" + crud_content[insert_idx:]

with open('backend/app/api/proxmox/vms/crud.py', 'w') as f:
    f.write(new_content)

print("Fixed crud.py")
