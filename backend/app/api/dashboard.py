from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import timedelta

from ..db import get_db
from ..models import ProxmoxServer, AuditLog, User
from ..auth import PermissionChecker
from ..config import utcnow

router = APIRouter()


@router.get("/api/dashboard/stats")
def dashboard_stats(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("dashboard.view"))
):
    """Dashboard statistics API"""
    from .workspaces import get_workspace_server_ids

    server_ids = get_workspace_server_ids(request, db, current_user)

    from sqlalchemy import func, distinct

    base_q = db.query(ProxmoxServer)
    if server_ids is not None:
        base_q = base_q.filter(ProxmoxServer.id.in_(server_ids))

    total_servers = base_q.count()
    online_servers = base_q.filter(ProxmoxServer.is_online == True).count()
    offline_servers = base_q.filter(ProxmoxServer.is_online == False).count()

    cluster_q = db.query(func.count(distinct(ProxmoxServer.cluster_name))).filter(
        ProxmoxServer.cluster_name.isnot(None),
        ProxmoxServer.cluster_name != ''
    )
    if server_ids is not None:
        cluster_q = cluster_q.filter(ProxmoxServer.id.in_(server_ids))
    total_clusters = cluster_q.scalar() or 0

    since_24h = utcnow() - timedelta(hours=24)
    total_alerts = db.query(AuditLog).filter(
        AuditLog.level.in_(['error', 'critical']),
        AuditLog.created_at >= since_24h
    ).count()
    critical_alerts = db.query(AuditLog).filter(
        AuditLog.level == 'critical',
        AuditLog.created_at >= since_24h
    ).count()

    recent_audit = db.query(AuditLog).order_by(
        AuditLog.created_at.desc()
    ).limit(5).all()

    recent_servers_q = db.query(ProxmoxServer)
    if server_ids is not None:
        recent_servers_q = recent_servers_q.filter(ProxmoxServer.id.in_(server_ids))
    recent_servers = recent_servers_q.order_by(ProxmoxServer.id.desc()).limit(6).all()

    return {
        "stats": {
            "total_servers": total_servers,
            "online_servers": online_servers,
            "offline_servers": offline_servers,
            "total_clusters": total_clusters,
            "total_alerts": total_alerts,
            "critical_alerts": critical_alerts,
        },
        "recent_servers": [
            {"id": s.id, "name": s.name, "ip_address": s.ip_address, "is_online": s.is_online}
            for s in recent_servers
        ],
        "recent_audit": [
            {
                "id": a.id, "level": a.level, "category": a.category,
                "action": a.action, "message": a.message, "username": a.username,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in recent_audit
        ],
    }


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
