from fastapi import APIRouter
from .servers import router as servers_router
from .sdn import router as sdn_router
from .snapshots import router as snapshots_router
from .vms import router as vms_router
from .tasks import router as tasks_router
from .backup import router as backup_router
from .cluster import router as cluster_router
from ._helpers import get_next_vmid, save_vm_instance, get_vm_instance

router = APIRouter()
router.include_router(servers_router)
router.include_router(sdn_router)
router.include_router(snapshots_router)
router.include_router(vms_router)
router.include_router(tasks_router)
router.include_router(backup_router)
router.include_router(cluster_router)
