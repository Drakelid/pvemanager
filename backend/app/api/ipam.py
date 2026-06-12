"""
IPAM API Routes
IP Address Management endpoints for networks, pools, and allocations.
"""

import logging
import ipaddress as ipaddress_module
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import IPAMNetwork, IPAMPool, IPAMAllocation, IPAMHistory, ProxmoxServer, User, VMInstance
from ..proxmox import ProxmoxClient
from ..schemas import (
    IPAMNetworkCreate, IPAMNetworkUpdate, IPAMNetworkResponse, IPAMNetworkStats,
    IPAMPoolCreate, IPAMPoolUpdate, IPAMPoolResponse,
    IPAMAllocationCreate, IPAMAllocationUpdate, IPAMAllocationResponse,
    IPAMHistoryResponse, IPAMAutoAllocateRequest
)
from ..ipam_service import IPAMService
from ..auth import get_current_user, PermissionChecker

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Network API ====================

@router.get("/api/networks", response_model=List[IPAMNetworkResponse])
def get_networks(
    is_active: Optional[bool] = None,
    proxmox_server_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get all IPAM networks"""
    query = db.query(IPAMNetwork)
    
    if is_active is not None:
        query = query.filter(IPAMNetwork.is_active == is_active)
    
    if proxmox_server_id:
        query = query.filter(IPAMNetwork.proxmox_server_id == proxmox_server_id)
    
    networks = query.order_by(IPAMNetwork.name).all()
    
    # Get server names for networks
    server_ids = [n.proxmox_server_id for n in networks if n.proxmox_server_id]
    servers = {}
    if server_ids:
        server_records = db.query(ProxmoxServer).filter(ProxmoxServer.id.in_(server_ids)).all()
        servers = {s.id: s.name for s in server_records}
    
    # Add computed stats to each network
    ipam = IPAMService(db)
    result = []
    for network in networks:
        stats = ipam.get_network_stats(network.id)
        network_dict = {
            **network.__dict__,
            'total_ips': stats.get('total_ips', 0),
            'used_ips': stats.get('allocated_ips', 0) + stats.get('reserved_ips', 0),
            'available_ips': stats.get('available_ips', 0),
            'utilization_percent': stats.get('utilization_percent', 0),
            'server_name': servers.get(network.proxmox_server_id) if network.proxmox_server_id else None
        }
        result.append(network_dict)
    
    return result


@router.get("/api/networks/{network_id}", response_model=IPAMNetworkResponse)
def get_network(
    network_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get a specific IPAM network"""
    network = db.query(IPAMNetwork).filter(IPAMNetwork.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    ipam = IPAMService(db)
    stats = ipam.get_network_stats(network_id)
    
    return {
        **network.__dict__,
        'total_ips': stats.get('total_ips', 0),
        'used_ips': stats.get('allocated_ips', 0) + stats.get('reserved_ips', 0),
        'available_ips': stats.get('available_ips', 0),
        'utilization_percent': stats.get('utilization_percent', 0)
    }


@router.get("/api/networks/{network_id}/stats", response_model=IPAMNetworkStats)
def get_network_stats(
    network_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get detailed statistics for a network"""
    ipam = IPAMService(db)
    stats = ipam.get_network_stats(network_id)
    
    if not stats:
        raise HTTPException(status_code=404, detail="Network not found")
    
    return stats


@router.get("/api/networks/{network_id}/ip-map")
def get_network_ip_map(
    network_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get IP address map for visualization"""
    ipam = IPAMService(db)
    ip_map = ipam.get_network_ip_map(network_id)
    
    if not ip_map:
        network = db.query(IPAMNetwork).filter(IPAMNetwork.id == network_id).first()
        if not network:
            raise HTTPException(status_code=404, detail="Network not found")
    
    return {"network_id": network_id, "ip_map": ip_map}


@router.post("/api/networks", response_model=IPAMNetworkResponse)
def create_network(
    network_data: IPAMNetworkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Create a new IPAM network"""
    # Check for duplicate network CIDR
    existing = db.query(IPAMNetwork).filter(IPAMNetwork.network == network_data.network).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Network {network_data.network} already exists")
    
    network = IPAMNetwork(**network_data.model_dump())
    db.add(network)
    db.commit()
    db.refresh(network)
    
    logger.info(f"User {current_user.username} created network {network.name} ({network.network})")
    return network


@router.put("/api/networks/{network_id}", response_model=IPAMNetworkResponse)
def update_network(
    network_id: int,
    network_data: IPAMNetworkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Update an IPAM network"""
    network = db.query(IPAMNetwork).filter(IPAMNetwork.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    update_data = network_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(network, field, value)
    
    db.commit()
    db.refresh(network)
    
    logger.info(f"User {current_user.username} updated network {network.name}")
    return network


@router.delete("/api/networks/{network_id}")
def delete_network(
    network_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Delete an IPAM network"""
    network = db.query(IPAMNetwork).filter(IPAMNetwork.id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    # Check for existing allocations
    alloc_count = db.query(IPAMAllocation).filter(IPAMAllocation.network_id == network_id).count()
    if alloc_count > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"Network has {alloc_count} allocations. Use force=true to delete anyway."
        )
    
    # Delete related data
    db.query(IPAMAllocation).filter(IPAMAllocation.network_id == network_id).delete()
    db.query(IPAMPool).filter(IPAMPool.network_id == network_id).delete()
    db.query(IPAMHistory).filter(IPAMHistory.network_id == network_id).delete()
    db.delete(network)
    db.commit()
    
    logger.info(f"User {current_user.username} deleted network {network.name}")
    return {"message": f"Network {network.name} deleted"}


# ==================== Pool API ====================

@router.get("/api/pools", response_model=List[IPAMPoolResponse])
def get_pools(
    network_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get all IP pools"""
    query = db.query(IPAMPool)
    
    if network_id:
        query = query.filter(IPAMPool.network_id == network_id)
    
    if is_active is not None:
        query = query.filter(IPAMPool.is_active == is_active)
    
    pools = query.order_by(IPAMPool.network_id, IPAMPool.range_start).all()
    
    # Add stats to each pool
    ipam = IPAMService(db)
    result = []
    for pool in pools:
        stats = ipam.get_pool_stats(pool.id)
        pool_dict = {
            **pool.__dict__,
            'total_ips': stats.get('total_ips', 0),
            'used_ips': stats.get('used_ips', 0),
            'available_ips': stats.get('available_ips', 0)
        }
        result.append(pool_dict)
    
    return result


@router.post("/api/pools", response_model=IPAMPoolResponse)
def create_pool(
    pool_data: IPAMPoolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Create a new IP pool"""
    # Validate network exists
    network = db.query(IPAMNetwork).filter(IPAMNetwork.id == pool_data.network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    # Validate range
    ipam = IPAMService(db)
    is_valid, error = ipam.validate_pool_range(
        pool_data.network_id, 
        pool_data.range_start, 
        pool_data.range_end
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    pool = IPAMPool(**pool_data.model_dump())
    db.add(pool)
    db.commit()
    db.refresh(pool)
    
    logger.info(f"User {current_user.username} created pool {pool.name} in network {network.name}")
    return pool


@router.put("/api/pools/{pool_id}", response_model=IPAMPoolResponse)
def update_pool(
    pool_id: int,
    pool_data: IPAMPoolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Update an IP pool"""
    pool = db.query(IPAMPool).filter(IPAMPool.id == pool_id).first()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    # Validate new range if provided
    update_data = pool_data.model_dump(exclude_unset=True)
    if 'range_start' in update_data or 'range_end' in update_data:
        ipam = IPAMService(db)
        is_valid, error = ipam.validate_pool_range(
            pool.network_id,
            update_data.get('range_start', pool.range_start),
            update_data.get('range_end', pool.range_end),
            exclude_pool_id=pool_id
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error)
    
    for field, value in update_data.items():
        setattr(pool, field, value)
    
    db.commit()
    db.refresh(pool)
    
    logger.info(f"User {current_user.username} updated pool {pool.name}")
    return pool


@router.delete("/api/pools/{pool_id}")
def delete_pool(
    pool_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Delete an IP pool"""
    pool = db.query(IPAMPool).filter(IPAMPool.id == pool_id).first()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    # Update allocations to remove pool reference
    db.query(IPAMAllocation).filter(IPAMAllocation.pool_id == pool_id).update({IPAMAllocation.pool_id: None})
    db.delete(pool)
    db.commit()
    
    logger.info(f"User {current_user.username} deleted pool {pool.name}")
    return {"message": f"Pool {pool.name} deleted"}


# ==================== Allocation API ====================

@router.get("/api/allocations", response_model=List[IPAMAllocationResponse])
def get_allocations(
    network_id: Optional[int] = None,
    pool_id: Optional[int] = None,
    status: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get IP allocations with filtering"""
    query = db.query(IPAMAllocation)
    
    if network_id:
        query = query.filter(IPAMAllocation.network_id == network_id)
    
    if pool_id:
        query = query.filter(IPAMAllocation.pool_id == pool_id)
    
    if status:
        query = query.filter(IPAMAllocation.status == status)
    
    if resource_type:
        query = query.filter(IPAMAllocation.resource_type == resource_type)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (IPAMAllocation.ip_address.like(search_filter)) |
            (IPAMAllocation.resource_name.like(search_filter)) |
            (IPAMAllocation.hostname.like(search_filter))
        )
    
    allocations = query.order_by(IPAMAllocation.ip_address).offset(offset).limit(limit).all()

    # Resolve network/pool names with targeted queries (only IDs present in results)
    network_ids = {a.network_id for a in allocations if a.network_id}
    pool_ids = {a.pool_id for a in allocations if a.pool_id}

    networks = {}
    if network_ids:
        networks = {
            n.id: n.name for n in
            db.query(IPAMNetwork.id, IPAMNetwork.name)
              .filter(IPAMNetwork.id.in_(network_ids)).all()
        }

    pools = {}
    if pool_ids:
        pools = {
            p.id: p.name for p in
            db.query(IPAMPool.id, IPAMPool.name)
              .filter(IPAMPool.id.in_(pool_ids)).all()
        }

    result = []
    for alloc in allocations:
        alloc_dict = {
            **alloc.__dict__,
            'network_name': networks.get(alloc.network_id),
            'pool_name': pools.get(alloc.pool_id) if alloc.pool_id else None
        }
        result.append(alloc_dict)

    return result


@router.get("/api/allocations/{allocation_id}", response_model=IPAMAllocationResponse)
def get_allocation(
    allocation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get a specific allocation"""
    allocation = db.query(IPAMAllocation).filter(IPAMAllocation.id == allocation_id).first()
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    network = db.query(IPAMNetwork).filter(IPAMNetwork.id == allocation.network_id).first()
    pool = db.query(IPAMPool).filter(IPAMPool.id == allocation.pool_id).first() if allocation.pool_id else None
    
    return {
        **allocation.__dict__,
        'network_name': network.name if network else None,
        'pool_name': pool.name if pool else None
    }


@router.post("/api/allocations", response_model=IPAMAllocationResponse)
def create_allocation(
    alloc_data: IPAMAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Manually create an IP allocation"""
    ipam = IPAMService(db)
    allocation, error = ipam.allocate_ip(
        ip_address=alloc_data.ip_address,
        network_id=alloc_data.network_id,
        pool_id=alloc_data.pool_id,
        resource_type=alloc_data.resource_type,
        resource_id=alloc_data.resource_id,
        resource_name=alloc_data.resource_name,
        hostname=alloc_data.hostname,
        fqdn=alloc_data.fqdn,
        mac_address=alloc_data.mac_address,
        proxmox_server_id=alloc_data.proxmox_server_id,
        proxmox_vmid=alloc_data.proxmox_vmid,
        proxmox_node=alloc_data.proxmox_node,
        allocation_type=alloc_data.allocation_type,
        status=alloc_data.status,
        allocated_by=current_user.username,
        notes=alloc_data.notes
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return allocation


@router.post("/api/allocations/auto", response_model=IPAMAllocationResponse)
def auto_allocate_ip(
    request: IPAMAutoAllocateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Automatically allocate the next available IP"""
    ipam = IPAMService(db)
    allocation, error = ipam.auto_allocate_ip(
        network_id=request.network_id,
        pool_id=request.pool_id,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        resource_name=request.resource_name,
        hostname=request.hostname,
        allocated_by=current_user.username,
        notes=request.notes
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return allocation


@router.put("/api/allocations/{allocation_id}", response_model=IPAMAllocationResponse)
def update_allocation(
    allocation_id: int,
    alloc_data: IPAMAllocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Update an allocation"""
    allocation = db.query(IPAMAllocation).filter(IPAMAllocation.id == allocation_id).first()
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    ipam = IPAMService(db)
    updated, error = ipam.update_allocation(
        allocation.ip_address,
        updated_by=current_user.username,
        **alloc_data.model_dump(exclude_unset=True)
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return updated


@router.delete("/api/allocations/{allocation_id}")
def delete_allocation(
    allocation_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """Release/delete an IP allocation"""
    allocation = db.query(IPAMAllocation).filter(IPAMAllocation.id == allocation_id).first()
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    ipam = IPAMService(db)
    success, error = ipam.release_ip(
        allocation.ip_address,
        released_by=current_user.username,
        reason=reason
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=error)
    
    return {"message": f"IP {allocation.ip_address} released"}


@router.get("/api/allocations/next-available/{network_id}")
def get_next_available_ip(
    network_id: int,
    pool_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get the next available IP in a network (without allocating)"""
    ipam = IPAMService(db)
    ip = ipam.get_next_available_ip(network_id, pool_id)
    
    if not ip:
        raise HTTPException(status_code=404, detail="No available IP addresses")
    
    return {"next_available_ip": ip}


# ==================== History API ====================

@router.get("/api/history", response_model=List[IPAMHistoryResponse])
def get_history(
    network_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get IPAM history"""
    query = db.query(IPAMHistory)
    
    if network_id:
        query = query.filter(IPAMHistory.network_id == network_id)
    
    if ip_address:
        query = query.filter(IPAMHistory.ip_address == ip_address)
    
    if action:
        query = query.filter(IPAMHistory.action == action)
    
    return query.order_by(IPAMHistory.performed_at.desc()).limit(limit).all()


@router.get("/api/history/ip/{ip_address}", response_model=List[IPAMHistoryResponse])
def get_ip_history(
    ip_address: str,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get history for a specific IP address"""
    ipam = IPAMService(db)
    return ipam.get_ip_history(ip_address, limit)


# ==================== Utility API ====================

@router.get("/api/conflicts")
def detect_conflicts(
    network_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Detect IP address conflicts"""
    ipam = IPAMService(db)
    conflicts = ipam.detect_conflicts(network_id)
    return {"conflicts": conflicts, "count": len(conflicts)}


@router.get("/api/summary")
def get_ipam_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.view"))
):
    """Get overall IPAM summary"""
    networks_count = db.query(IPAMNetwork).filter(IPAMNetwork.is_active == True).count()
    pools_count = db.query(IPAMPool).filter(IPAMPool.is_active == True).count()
    
    total_allocated = db.query(IPAMAllocation).filter(IPAMAllocation.status == 'allocated').count()
    total_reserved = db.query(IPAMAllocation).filter(IPAMAllocation.status == 'reserved').count()
    
    # Count by resource type
    vm_count = db.query(IPAMAllocation).filter(IPAMAllocation.resource_type == 'vm').count()
    lxc_count = db.query(IPAMAllocation).filter(IPAMAllocation.resource_type == 'lxc').count()
    physical_count = db.query(IPAMAllocation).filter(IPAMAllocation.resource_type == 'physical').count()
    
    # Recent activity
    recent_allocations = db.query(IPAMHistory).filter(
        IPAMHistory.action == 'allocated'
    ).order_by(IPAMHistory.performed_at.desc()).limit(5).all()
    
    return {
        'networks_count': networks_count,
        'pools_count': pools_count,
        'total_allocated': total_allocated,
        'total_reserved': total_reserved,
        'vm_count': vm_count,
        'lxc_count': lxc_count,
        'physical_count': physical_count,
        'recent_allocations': [
            {
                'ip': h.ip_address,
                'resource': h.resource_name,
                'by': h.performed_by,
                'at': h.performed_at.isoformat() if h.performed_at else None
            } for h in recent_allocations
        ]
    }


# ==================== Maintenance API ====================

@router.get("/api/orphans")
def get_orphan_allocations(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """
    Get orphan IPAM allocations - IPs allocated to VMs that no longer exist.
    """
    orphans = []
    
    # 1. Allocations with proxmox_vmid but VM doesn't exist or is deleted
    allocations_with_vmid = db.query(IPAMAllocation).filter(
        IPAMAllocation.proxmox_vmid.isnot(None),
        IPAMAllocation.proxmox_server_id.isnot(None),
        IPAMAllocation.status.in_(['allocated', 'reserved'])
    ).all()
    
    for alloc in allocations_with_vmid:
        vm = db.query(VMInstance).filter(
            VMInstance.vmid == alloc.proxmox_vmid,
            VMInstance.server_id == alloc.proxmox_server_id,
            VMInstance.deleted_at.is_(None)
        ).first()
        
        if not vm:
            orphans.append({
                'id': alloc.id,
                'ip_address': alloc.ip_address,
                'resource_name': alloc.resource_name,
                'resource_type': alloc.resource_type,
                'proxmox_vmid': alloc.proxmox_vmid,
                'proxmox_server_id': alloc.proxmox_server_id,
                'reason': 'VM/LXC not found or deleted'
            })
    
    # 2. Allocations to non-existent servers
    allocations_with_server = db.query(IPAMAllocation).filter(
        IPAMAllocation.proxmox_server_id.isnot(None),
        IPAMAllocation.status.in_(['allocated', 'reserved'])
    ).all()
    
    server_ids = {a.proxmox_server_id for a in allocations_with_server}
    existing_servers = {s.id for s in db.query(ProxmoxServer.id).filter(ProxmoxServer.id.in_(server_ids)).all()}
    
    for alloc in allocations_with_server:
        if alloc.proxmox_server_id not in existing_servers:
            # Check if not already in orphans
            if not any(o['id'] == alloc.id for o in orphans):
                orphans.append({
                    'id': alloc.id,
                    'ip_address': alloc.ip_address,
                    'resource_name': alloc.resource_name,
                    'resource_type': alloc.resource_type,
                    'proxmox_vmid': alloc.proxmox_vmid,
                    'proxmox_server_id': alloc.proxmox_server_id,
                    'reason': f'Server {alloc.proxmox_server_id} not found'
                })
    
    return {
        'orphans': orphans,
        'count': len(orphans)
    }


@router.post("/api/cleanup-orphans")
async def cleanup_orphan_allocations(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """
    Clean up orphan IPAM allocations - release IPs for VMs that no longer exist.
    """
    ipam = IPAMService(db)
    released = []
    errors = []
    
    # Get orphans
    orphans_result = get_orphan_allocations(db, current_user)
    orphans = orphans_result['orphans']
    
    for orphan in orphans:
        try:
            success, error = ipam.release_ip(
                ip_address=orphan['ip_address'],
                released_by=current_user.username,
                reason=f"Orphan cleanup: {orphan['reason']}"
            )
            if success:
                released.append(orphan['ip_address'])
                logger.info(f"Released orphan IP {orphan['ip_address']} by {current_user.username}")
            else:
                errors.append({'ip': orphan['ip_address'], 'error': error})
        except Exception as e:
            errors.append({'ip': orphan['ip_address'], 'error': str(e)})
    
    return {
        'released': released,
        'released_count': len(released),
        'errors': errors,
        'error_count': len(errors)
    }


def _build_proxmox_client(server: ProxmoxServer) -> ProxmoxClient:
    """Build ProxmoxClient from ProxmoxServer model."""
    host = server.ip_address or server.hostname
    if server.port and server.port != 8006:
        host = f"{host}:{server.port}"
    if server.use_password and server.password:
        return ProxmoxClient(host=host, user=server.api_user, password=server.password, verify_ssl=server.verify_ssl)
    return ProxmoxClient(host=host, user=server.api_user, token_name=server.api_token_name, token_value=server.api_token_value, verify_ssl=server.verify_ssl)


def _extract_primary_ipv4(interfaces: list, parsed_networks: list):
    """Extract first IPv4 that belongs to any IPAM network from interface list."""
    for iface in interfaces:
        for ip_info in iface.get('ips', []):
            if ip_info.get('type') != 'ipv4':
                continue
            addr = ip_info.get('address', '')
            try:
                ip_obj = ipaddress_module.ip_address(addr)
            except ValueError:
                continue
            if ip_obj.is_loopback or ip_obj.is_link_local:
                continue
            for net, net_obj in parsed_networks:
                if ip_obj in net_obj:
                    return addr, net
    return None, None


@router.get("/api/unlinked")
def get_unlinked_allocations(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """
    Return VM instances that have no IPAM allocation linked to them (by vmid+server_id).
    """
    unlinked = []

    # All live VMs
    vms = db.query(VMInstance).filter(VMInstance.deleted_at.is_(None)).all()

    # Pre-load all linked (proxmox_server_id, proxmox_vmid) pairs for fast lookup
    linked_pairs = set(
        (a.proxmox_server_id, a.proxmox_vmid)
        for a in db.query(IPAMAllocation.proxmox_server_id, IPAMAllocation.proxmox_vmid).filter(
            IPAMAllocation.proxmox_vmid.isnot(None)
        ).all()
    )

    servers_map = {s.id: s for s in db.query(ProxmoxServer).all()}

    for vm in vms:
        if (vm.server_id, vm.vmid) in linked_pairs:
            continue
        server = servers_map.get(vm.server_id)
        unlinked.append({
            'id': None,
            'ip_address': vm.ip_address or '?',
            'resource_name': vm.name,
            'resource_type': vm.vm_type,
            'can_link': True,
            'suggested_vmid': vm.vmid,
            'suggested_server_id': vm.server_id,
            'suggested_server_name': server.name if server else None
        })

    return {
        'unlinked': unlinked,
        'count': len(unlinked),
        'linkable_count': len(unlinked)
    }


class LinkAllocationsRequest(BaseModel):
    server_id: Optional[int] = None   # If set, only process this server's VMs
    network_id: Optional[int] = None  # If set, only match against this IPAM network


@router.post("/api/link-allocations")
def link_allocations_to_vms(
    body: LinkAllocationsRequest = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("ipam.manage"))
):
    """
    Scan Proxmox servers, get VM IP addresses via QEMU guest agent / LXC config,
    and create/update IPAM allocations for each VM whose IP belongs to a known IPAM network.

    When body.server_id is given: only process that server.
    When body.network_id is given: only match against that specific network.
    In auto mode (no params): each VM is matched only against networks whose
      proxmox_server_id equals the VM's server (or networks without a server binding).
    """
    if body is None:
        body = LinkAllocationsRequest()

    linked = []
    not_found = []

    service = IPAMService(db)
    synced_by = current_user.username if hasattr(current_user, 'username') else 'system'

    # Parse all active IPAM networks once (or just the requested one)
    net_query = db.query(IPAMNetwork).filter(IPAMNetwork.is_active == True)
    if body.network_id:
        net_query = net_query.filter(IPAMNetwork.id == body.network_id)
    networks = net_query.all()

    parsed_networks = []
    for net in networks:
        try:
            parsed_networks.append((net, ipaddress_module.ip_network(net.network, strict=False)))
        except ValueError:
            pass

    if not parsed_networks:
        return {'linked': [], 'linked_count': 0, 'not_found': [], 'not_found_count': 0,
                'message': 'No active IPAM networks configured'}

    # Pre-build set of already-linked (server_id, vmid) pairs
    linked_pairs = set(
        (a.proxmox_server_id, a.proxmox_vmid)
        for a in db.query(IPAMAllocation.proxmox_server_id, IPAMAllocation.proxmox_vmid).filter(
            IPAMAllocation.proxmox_vmid.isnot(None)
        ).all()
    )

    # All live VMs cached in DB (optionally filtered by server)
    vm_query = db.query(VMInstance).filter(VMInstance.deleted_at.is_(None))
    if body.server_id:
        vm_query = vm_query.filter(VMInstance.server_id == body.server_id)
    vms = vm_query.all()

    # Group VMs by server_id for efficient client reuse
    vms_by_server: dict = {}
    for vm in vms:
        vms_by_server.setdefault(vm.server_id, []).append(vm)

    for server_id, server_vms in vms_by_server.items():
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            continue

        # Determine which networks apply for this server.
        # If a specific network_id was requested, only use that (already filtered above).
        # Otherwise restrict to networks that belong to this server OR are "global" (no server binding).
        if body.network_id:
            server_networks = parsed_networks  # already filtered to the one network
        else:
            server_networks = [
                (n, p) for n, p in parsed_networks
                if n.proxmox_server_id == server_id or n.proxmox_server_id is None
            ]

        if not server_networks:
            logger.info(f"[IPAM link] Server {server.name} has no matching IPAM networks, skipping")
            continue

        try:
            client = _build_proxmox_client(server)
            if not client.is_connected():
                logger.warning(f"[IPAM link] Server {server.name} not reachable, skipping")
                for vm in server_vms:
                    if (server_id, vm.vmid) not in linked_pairs:
                        not_found.append({'ip_address': '-', 'resource_name': vm.name,
                                          'reason': 'server_unreachable'})
                continue
        except Exception as e:
            logger.error(f"[IPAM link] Cannot build client for server {server.name}: {e}")
            continue

        for vm in server_vms:
            # Skip already linked
            if (server_id, vm.vmid) in linked_pairs:
                continue

            # For this VM, further filter networks by proxmox_node if set
            # (e.g. network tagged to pve1 should not match VMs on pve2)
            vm_networks = [
                (n, p) for n, p in server_networks
                if not n.proxmox_node or n.proxmox_node == vm.node
            ]
            if not vm_networks:
                not_found.append({'ip_address': '-', 'resource_name': vm.name,
                                  'reason': 'no_network_for_node'})
                continue

            # Get interfaces from Proxmox
            try:
                if vm.vm_type == 'qemu':
                    interfaces = client.get_vm_interfaces(vm.node, vm.vmid)
                else:
                    interfaces = client.get_container_interfaces(vm.node, vm.vmid)
            except Exception as e:
                logger.debug(f"[IPAM link] Cannot get interfaces for {vm.name}/{vm.vmid}: {e}")
                interfaces = []

            # Find first IPv4 in one of this VM's applicable IPAM networks
            ip_found, matching_network = _extract_primary_ipv4(interfaces, vm_networks)

            if not ip_found:
                not_found.append({'ip_address': '-', 'resource_name': vm.name,
                                  'reason': 'no_ip_in_ipam_network'})
                continue

            alloc, error = service.sync_from_proxmox_vm(
                network_id=matching_network.id,
                proxmox_server_id=server_id,
                vmid=vm.vmid,
                vm_name=vm.name,
                vm_type=vm.vm_type,
                ip_address=ip_found,
                node=vm.node,
                synced_by=synced_by
            )

            if alloc:
                # Update the cached ip_address in vm_instances as well
                vm.ip_address = ip_found
                linked_pairs.add((server_id, vm.vmid))  # avoid double-linking
                linked.append({
                    'ip_address': ip_found,
                    'resource_name': vm.name,
                    'vmid': vm.vmid,
                    'server_id': server_id
                })
                logger.info(f"[IPAM link] Linked {ip_found} -> VM {vm.vmid} ({vm.name}) on {server.name}")
            else:
                not_found.append({'ip_address': ip_found, 'resource_name': vm.name,
                                  'reason': error or 'sync_error'})
                logger.warning(f"[IPAM link] Failed {ip_found} for {vm.name}: {error}")

    if linked:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"[IPAM link] Commit failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return {
        'linked': linked,
        'linked_count': len(linked),
        'not_found': not_found,
        'not_found_count': len(not_found)
    }

