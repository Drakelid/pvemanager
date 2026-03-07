from fastapi import APIRouter
from .servers import router as servers_router
from .sdn import router as sdn_router
from .snapshots import router as snapshots_router
from .vms import router as vms_router
from .tasks import router as tasks_router

router = APIRouter()
router.include_router(servers_router)
router.include_router(sdn_router)
router.include_router(snapshots_router)
router.include_router(vms_router)
router.include_router(tasks_router)
