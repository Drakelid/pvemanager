import os

for root, dirs, files in os.walk('app'):
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # replace absolute imports
            new_content = content.replace('app.proxmox_client', 'app.proxmox')
            new_content = new_content.replace('backend.app.proxmox_client', 'backend.app.proxmox')
            
            # replace relative imports
            new_content = new_content.replace('..proxmox_client', '..proxmox')
            new_content = new_content.replace('...proxmox_client', '...proxmox')
            new_content = new_content.replace('from .proxmox_client', 'from .proxmox')
            
            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
