from fastapi import APIRouter, Depends, Request, HTTPException, Query, Form, status, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from loguru import logger
from typing import List
import ssl
import asyncio
import httpx
import websockets

from ...db import get_db
from ...models import ProxmoxServer, VMInstance, User, IPAMAllocation, IPAMNetwork, VMSnapshotArchive
from ...schemas import ProxmoxServerCreate, ProxmoxServerUpdate, ProxmoxServerResponse
from ...proxmox_client import ProxmoxClient, get_proxmox_resources
from ...auth import get_current_user, PermissionChecker, require_permission, check_permission
from ...logging_service import LoggingService
from ...template_helpers import add_i18n_context
from ...ipam_service import IPAMService
from ._helpers import (check_vm_access, require_vm_access, _get_proxmox_client,
                        get_next_vmid, archive_and_delete_snapshots,
                        save_vm_instance, get_vm_instance, soft_delete_vm_instance,
                        templates)

router = APIRouter()


# ==================== SDN (Software Defined Networking) ====================

@router.get("/api/servers/{server_id}/sdn/status")
def get_sdn_status(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Check if SDN is available on the server"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        is_available = client.sdn_is_available()
        pending = client.get_sdn_pending() if is_available else []
        
        return JSONResponse(content={
            "server_id": server_id,
            "sdn_available": is_available,
            "pending_changes": len(pending) > 0,
            "pending": pending
        })
    except Exception as e:
        logger.error(f"Error checking SDN status for server {server_id}: {e}")
        return JSONResponse(content={
            "server_id": server_id,
            "sdn_available": False,
            "error": str(e)
        })


@router.get("/api/servers/{server_id}/sdn/zones")
def get_sdn_zones(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Get all SDN zones"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        zones = client.get_sdn_zones()
        return JSONResponse(content={"zones": zones})
    except Exception as e:
        logger.error(f"Error getting SDN zones for server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/sdn/zones")
async def create_sdn_zone(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.manage"))
):
    """Create a new SDN zone"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    data = await request.json()
    zone_name = data.get('zone')
    zone_type = data.get('type', 'simple')
    
    if not zone_name:
        raise HTTPException(status_code=400, detail="Zone name is required")
    
    try:
        client = _get_proxmox_client(server)
        
        # Pass additional options from request
        kwargs = {k: v for k, v in data.items() if k not in ['zone', 'type']}
        result = client.create_sdn_zone(zone_name, zone_type, **kwargs)
        
        if result.get('success'):
            logger.info(f"User {current_user.username} created SDN zone: {zone_name}")
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to create zone'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating SDN zone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/servers/{server_id}/sdn/zones/{zone}")
def delete_sdn_zone(
    server_id: int,
    zone: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.manage"))
):
    """Delete an SDN zone"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        result = client.delete_sdn_zone(zone)
        
        if result.get('success'):
            logger.info(f"User {current_user.username} deleted SDN zone: {zone}")
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to delete zone'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting SDN zone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/servers/{server_id}/sdn/vnets")
def get_sdn_vnets(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Get all SDN VNets"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        vnets = client.get_sdn_vnets()
        return JSONResponse(content={"vnets": vnets})
    except Exception as e:
        logger.error(f"Error getting SDN vnets for server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/sdn/vnets")
async def create_sdn_vnet(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.manage"))
):
    """Create a new SDN VNet"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    data = await request.json()
    vnet_name = data.get('vnet')
    zone = data.get('zone')
    tag = data.get('tag')
    alias = data.get('alias')
    vlanaware = data.get('vlanaware', False)
    
    if not vnet_name or not zone:
        raise HTTPException(status_code=400, detail="VNet name and zone are required")
    
    try:
        client = _get_proxmox_client(server)
        
        result = client.create_sdn_vnet(vnet_name, zone, tag=tag, alias=alias, vlanaware=vlanaware)
        
        if result.get('success'):
            logger.info(f"User {current_user.username} created SDN vnet: {vnet_name} in zone {zone}")
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to create vnet'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating SDN vnet: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/servers/{server_id}/sdn/vnets/{vnet}")
def delete_sdn_vnet(
    server_id: int,
    vnet: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.manage"))
):
    """Delete an SDN VNet"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        result = client.delete_sdn_vnet(vnet)
        
        if result.get('success'):
            logger.info(f"User {current_user.username} deleted SDN vnet: {vnet}")
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to delete vnet'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting SDN vnet: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/servers/{server_id}/sdn/vnets/{vnet}/subnets")
def get_sdn_subnets(
    server_id: int,
    vnet: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.view"))
):
    """Get subnets for a VNet"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        subnets = client.get_sdn_subnets(vnet)
        return JSONResponse(content={"subnets": subnets})
    except Exception as e:
        logger.error(f"Error getting SDN subnets for vnet {vnet}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/sdn/vnets/{vnet}/subnets")
async def create_sdn_subnet(
    server_id: int,
    vnet: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.manage"))
):
    """Create a subnet in a VNet"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    data = await request.json()
    subnet = data.get('subnet')
    gateway = data.get('gateway')
    snat = data.get('snat', False)
    dnszoneprefix = data.get('dnszoneprefix')
    
    if not subnet:
        raise HTTPException(status_code=400, detail="Subnet CIDR is required")
    
    try:
        client = _get_proxmox_client(server)
        
        result = client.create_sdn_subnet(vnet, subnet, gateway=gateway, snat=snat, dnszoneprefix=dnszoneprefix)
        
        if result.get('success'):
            logger.info(f"User {current_user.username} created subnet {subnet} in vnet {vnet}")
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to create subnet'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating SDN subnet: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/servers/{server_id}/sdn/apply")
def apply_sdn_changes(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("proxmox.manage"))
):
    """Apply pending SDN changes"""
    server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Proxmox server not found")
    
    try:
        client = _get_proxmox_client(server)
        
        result = client.apply_sdn_changes()
        
        if result.get('success'):
            logger.info(f"User {current_user.username} applied SDN changes on server {server.name}")
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to apply SDN changes'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying SDN changes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
