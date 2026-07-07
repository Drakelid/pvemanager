"""App Store API package. Экспортирует агрегированный router для main.py."""

from fastapi import APIRouter

from .catalog import router as catalog_router
from .apps import router as apps_router

router = APIRouter()
router.include_router(catalog_router)
router.include_router(apps_router)
