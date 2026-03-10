from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import datetime, timedelta

from ..db import get_db
from ..models import ProxmoxServer, AuditLog, User
from ..template_helpers import add_i18n_context
from ..auth import get_current_user, PermissionChecker

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
@router.get("/dashboard", response_class=HTMLResponse, include_in_schema=False)
def dashboard(request: Request, db: Session = Depends(get_db)):
    total_servers = db.query(ProxmoxServer).count()
    online_servers = db.query(ProxmoxServer).filter(ProxmoxServer.is_online == True).count()
    offline_servers = db.query(ProxmoxServer).filter(ProxmoxServer.is_online == False).count()

    # Count distinct clusters (non-null cluster_name counts as one cluster each)
    named_clusters = db.query(func.count(distinct(ProxmoxServer.cluster_name))).filter(
        ProxmoxServer.cluster_name.isnot(None),
        ProxmoxServer.cluster_name != ''
    ).scalar() or 0
    standalone_count = db.query(ProxmoxServer).filter(
        (ProxmoxServer.cluster_name == None) | (ProxmoxServer.cluster_name == '')
    ).count()
    total_clusters = named_clusters + standalone_count

    # Alerts in last 24 hours
    since_24h = datetime.utcnow() - timedelta(hours=24)
    total_alerts = db.query(AuditLog).filter(
        AuditLog.level.in_(['error', 'critical']),
        AuditLog.created_at >= since_24h
    ).count()
    critical_alerts = db.query(AuditLog).filter(
        AuditLog.level == 'critical',
        AuditLog.created_at >= since_24h
    ).count()

    # Recent audit events (last 5)
    recent_audit = db.query(AuditLog).order_by(
        AuditLog.created_at.desc()
    ).limit(5).all()

    recent_servers = db.query(ProxmoxServer).order_by(ProxmoxServer.id.desc()).limit(6).all()
    
    stats = {
        "total_servers": total_servers,
        "online_servers": online_servers,
        "offline_servers": offline_servers,
        "total_clusters": total_clusters,
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
    }
    
    lang = request.cookies.get("language", "en")
    from ..i18n import t
    
    context = {
        "request": request,
        "stats": stats,
        "recent_servers": recent_servers,
        "recent_audit": recent_audit,
        "page_title": t('nav_dashboard', lang),
    }
    context = add_i18n_context(request, context)
    
    return templates.TemplateResponse("dashboard.html", context)


@router.get("/api/dashboard/alerts")
def get_dashboard_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("logs.view"))
):
    """Вернуть события error/critical за последние 24 ч для дашборда"""
    since_24h = datetime.utcnow() - timedelta(hours=24)
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


@router.get("/containers", response_class=HTMLResponse, include_in_schema=False)
def containers(request: Request):
    lang = request.cookies.get("language", "en")
    from ..i18n import t
    
    context = {
        "request": request,
        "page_title": t('nav_docker', lang),
    }
    context = add_i18n_context(request, context)
    return templates.TemplateResponse("containers.html", context)
