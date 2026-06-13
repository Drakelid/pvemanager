# API routers
from . import auth
from . import dashboard
from . import proxmox
from . import templates
from . import ipam
from . import logs
from . import settings
from . import notifications
from . import users
from . import workspaces
from . import ssh_keys

__all__ = [
    "auth",
    "dashboard",
    "proxmox",
    "templates",
    "ipam",
    "logs",
    "settings",
    "notifications",
    "users",
    "workspaces",
    "ssh_keys",
]