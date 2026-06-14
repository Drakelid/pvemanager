from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import timedelta

from ..db import get_db
from ..models import ProxmoxServer, AuditLog, User
from ..auth import PermissionChecker
from ..config import utcnow

router = APIRouter()


@router.get("/api/dashboard/alerts")
def get_dashboard_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("logs.view"))
):
    """Вернуть события error/critical за последние 24 ч для дашборда"""
    since_24h = utcnow() - timedelta(hours=24)
    alerts = db.query(AuditLog).filter(
        AuditLog.level.in_(['error', 'critical']),
        AuditLog.created_at >= since_24h
    ).order_by(AuditLog.created_at.desc()).limit(50).all()

    return JSONResponse(content={
        "alerts": [
            {
                "id": a.id,
                "level": a.level,
                "category": a.category,
                "action": a.action,
                "message": a.message,
                "username": a.username,
                "resource_name": a.resource_name,
                "server_name": a.server_name,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ],
        "total": len(alerts)
    })
