"""Scripts API package. Экспортирует агрегированный router для main.py."""

from fastapi import APIRouter

from .catalog import router as catalog_router
from .executions import router as executions_router

router = APIRouter()
router.include_router(catalog_router)
router.include_router(executions_router)
