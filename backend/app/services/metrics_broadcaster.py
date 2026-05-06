"""
Metrics Broadcaster — asyncio background tasks that push live metrics
to WebSocket channel subscribers.

Channels:
  dashboard_metrics                          — all servers / VMs overview (10 s)
  server_metrics:{server_id}_{node}          — single Proxmox node status (5 s)
  instance_metrics:{server_id}_{vmid}_{type}_{node}  — VM / LXC status (5 s)

On-demand:
  handle_rrd_request(ws, request_id, action, params, db_factory)
      action = "get_rrd"       → VM / container RRD data
      action = "get_node_rrd"  → node RRD data

NOTE: All Proxmox API calls are synchronous (proxmoxer / requests).  They are
always executed in a thread-pool via asyncio.to_thread() so they never block
the event loop.
"""

import asyncio
import json
import time
from typing import Any, Dict, Optional, Tuple

from loguru import logger

# ──────────────────────────────────────────────────────────────────────────────
# In-memory caches
# ──────────────────────────────────────────────────────────────────────────────

# Last payload broadcast on each channel — sent immediately to new subscribers
_metrics_cache: Dict[str, Any] = {}
# RRD data cache: key = "{server_id}_{node}", value = (timestamp, rrd_data_list)
_rrd_cache: Dict[str, Tuple[float, list]] = {}
_RRD_TTL = 30.0  # seconds between actual RRD fetches from Proxmox


def get_cached_metrics(channel: str) -> Optional[Any]:
    """Return the last cached payload for a channel, or None."""
    return _metrics_cache.get(channel)


# ──────────────────────────────────────────────────────────────────────────────
# Synchronous helpers (run inside a thread via asyncio.to_thread)
# ──────────────────────────────────────────────────────────────────────────────

def _get_ws_manager():
    from ..websocket_manager import ws_manager
    return ws_manager


def _get_all_servers(db_factory):
    """Return all ProxmoxServer rows (synchronous DB query)."""
    from ..models import ProxmoxServer
    db = db_factory()
    try:
        return db.query(ProxmoxServer).all()
    finally:
        db.close()


def _fetch_server_resources_with_nodes(server) -> dict:
    """
    Pull VMs + containers + per-node CPU/RAM/Disk status + cached RRD slices.
    Runs in a thread pool — safe to block.
    """
    from ..proxmox_client import get_proxmox_resources
    from ..api.proxmox._helpers import _get_proxmox_client

    base: dict = {
        "id": server.id,
        "name": server.name,
        "ip": server.ip_address,
        "vms": [],
        "containers": [],
        "vms_count": 0,
        "containers_count": 0,
        "nodes": [],
    }

    # ── VMs + containers ──────────────────────────────────────────────────
    try:
        if server.use_password:
            resources = get_proxmox_resources(
                host=server.ip_address,
                user=server.api_user,
                password=server.password,
                verify_ssl=server.verify_ssl,
            )
        else:
            resources = get_proxmox_resources(
                host=server.ip_address,
                user=server.api_user,
                token_name=server.api_token_name,
                token_value=server.api_token_value,
                verify_ssl=server.verify_ssl,
            )
        vms = resources.get("vms", [])
        containers = resources.get("containers", [])
        base["vms"] = vms
        base["containers"] = containers
        base["vms_count"] = len(vms)
        base["containers_count"] = len(containers)
    except Exception as exc:
        base["error"] = str(exc)
        return base

    # ── Node status + RRD mini-slices ─────────────────────────────────────
    try:
        client = _get_proxmox_client(server)
        if not client.is_connected():
            return base
        nodes_raw = client.get_nodes()
        now = time.monotonic()
        nodes_out = []
        for n in nodes_raw:
            node_name = n.get("node", "")
            if not node_name:
                continue
            st = client.get_node_status(node_name) or {}
            cpu_pct = round((st.get("cpu", 0) or 0) * 100, 1)
            mem = st.get("memory") or {}
            ram_pct = round((mem.get("used", 0) / mem.get("total", 1)) * 100, 1) if mem.get("total") else 0
            rootfs = st.get("rootfs") or {}
            disk_pct = round((rootfs.get("used", 0) / rootfs.get("total", 1)) * 100, 1) if rootfs.get("total") else 0

            # RRD: fetch only when cache is stale (> _RRD_TTL seconds old)
            cache_key = f"{server.id}_{node_name}"
            if cache_key not in _rrd_cache or now - _rrd_cache[cache_key][0] >= _RRD_TTL:
                try:
                    rrd_resp = client.get_node_rrddata(node_name, "hour")
                    rrd_data = rrd_resp.get("data", []) if isinstance(rrd_resp, dict) else (rrd_resp or [])
                    _rrd_cache[cache_key] = (now, rrd_data)
                except Exception:
                    rrd_data = _rrd_cache.get(cache_key, (0, []))[1]
            else:
                rrd_data = _rrd_cache[cache_key][1]

            # Build slim 24-point arrays for mini-charts
            tail = rrd_data[-24:] if len(rrd_data) > 24 else rrd_data
            rrd_cpu, rrd_ram, rrd_disk = [], [], []
            for pt in tail:
                rrd_cpu.append(round((pt.get("cpu", 0) or 0) * 100, 1))
                mt = pt.get("memtotal") or 0
                mu = pt.get("memused") or 0
                rrd_ram.append(round((mu / mt * 100) if mt > 0 else 0, 1))
                rt = pt.get("roottotal") or 0
                ru = pt.get("rootused") or 0
                rrd_disk.append(round((ru / rt * 100) if rt > 0 else 0, 1))

            nodes_out.append({
                "name": node_name,
                "cpu_pct": cpu_pct,
                "ram_pct": ram_pct,
                "disk_pct": disk_pct,
                "rrd_cpu": rrd_cpu,
                "rrd_ram": rrd_ram,
                "rrd_disk": rrd_disk,
            })
        base["nodes"] = nodes_out
    except Exception as exc:
        logger.debug(f"[metrics_broadcaster] node stats error for server {server.id}: {exc}")
    return base


def _fetch_node_status(db_factory, server_id: int, node: str):
    """Return node status dict or None.  Runs in a thread pool."""
    from ..models import ProxmoxServer
    from ..api.proxmox._helpers import _get_proxmox_client
    db = db_factory()
    try:
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            return None
        client = _get_proxmox_client(server)
    finally:
        db.close()
    if not client.is_connected():
        return None
    return client.get_node_status(node)


def _fetch_instance_status(db_factory, server_id: int, vmid: int, inst_type: str, node: str):
    """Return VM/LXC current status dict or None.  Runs in a thread pool."""
    from ..models import ProxmoxServer
    from ..api.proxmox._helpers import _get_proxmox_client
    db = db_factory()
    try:
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            return None
        client = _get_proxmox_client(server)
    finally:
        db.close()
    if not client.is_connected():
        return None
    if inst_type == "qemu":
        return client.get_vm_status(node, vmid)
    return client.get_container_status(node, vmid)


def _fetch_rrd(db_factory, server_id: int, action: str, params: dict):
    """Fetch RRD time-series data.  Runs in a thread pool."""
    from ..models import ProxmoxServer
    from ..api.proxmox._helpers import _get_proxmox_client
    VALID_TIMEFRAMES = {"hour", "day", "week", "month", "year"}
    node: str = params.get("node", "")
    timeframe: str = params.get("timeframe", "hour")
    if timeframe not in VALID_TIMEFRAMES:
        timeframe = "hour"
    db = db_factory()
    try:
        server = db.query(ProxmoxServer).filter(ProxmoxServer.id == server_id).first()
        if not server:
            raise ValueError("Server not found")
        client = _get_proxmox_client(server)
    finally:
        db.close()
    if not client.is_connected():
        raise ValueError("Cannot connect to Proxmox server")
    if action == "get_node_rrd":
        return client.get_node_rrddata(node, timeframe)
    elif action == "get_rrd":
        vmid = int(params.get("vmid", 0))
        inst_type: str = params.get("inst_type", "qemu")
        if inst_type == "qemu":
            return client.get_vm_rrddata(node, vmid, timeframe)
        return client.get_container_rrddata(node, vmid, timeframe)
    raise ValueError(f"Unknown RRD action: {action}")


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard metrics loop  (push every 10 s)
# ──────────────────────────────────────────────────────────────────────────────

async def dashboard_metrics_loop(db_factory) -> None:
    """Push aggregated VM / container counts + node stats to 'dashboard_metrics' subscribers."""
    wsman = _get_ws_manager()
    while True:
        await asyncio.sleep(2)
        if not wsman.has_channel_subscribers("dashboard_metrics"):
            continue
        try:
            servers = await asyncio.to_thread(_get_all_servers, db_factory)

            results = await asyncio.gather(
                *[asyncio.to_thread(_fetch_server_resources_with_nodes, srv) for srv in servers],
                return_exceptions=True,
            )

            all_resources: dict = {"servers": [], "total_vms": 0, "total_containers": 0}
            for r in results:
                if isinstance(r, Exception):
                    continue
                all_resources["servers"].append(r)
                all_resources["total_vms"] += r.get("vms_count", 0)
                all_resources["total_containers"] += r.get("containers_count", 0)

            payload = {
                "type": "metrics_update",
                "channel": "dashboard_metrics",
                "data": all_resources,
            }
            _metrics_cache["dashboard_metrics"] = payload
            await wsman.broadcast_to_channel("dashboard_metrics", payload)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning(f"[metrics_broadcaster] dashboard loop error: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# Server / node metrics loop  (push every 5 s)
# ──────────────────────────────────────────────────────────────────────────────

async def server_metrics_loop(db_factory) -> None:
    """Push node status to 'server_metrics:{server_id}_{node}' subscribers."""
    wsman = _get_ws_manager()
    while True:
        await asyncio.sleep(2)
        channels = wsman.get_channels_matching("server_metrics:")
        if not channels:
            continue

        async def _push_node(channel: str) -> None:
            try:
                # channel format: server_metrics:{server_id}_{node}
                suffix = channel.split(":", 1)[1]
                sep = suffix.index("_")
                server_id = int(suffix[:sep])
                node = suffix[sep + 1:]
                if not node:
                    return
                status = await asyncio.to_thread(
                    _fetch_node_status, db_factory, server_id, node
                )
                if not status:
                    return
                payload = {
                    "type": "metrics_update",
                    "channel": channel,
                    "data": {"status": status},
                }
                _metrics_cache[channel] = payload
                await wsman.broadcast_to_channel(channel, payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug(f"[metrics_broadcaster] server metrics error on '{channel}': {exc}")

        await asyncio.gather(*[_push_node(ch) for ch in channels], return_exceptions=True)


# ──────────────────────────────────────────────────────────────────────────────
# Instance metrics loop  (push every 5 s)
# ──────────────────────────────────────────────────────────────────────────────

async def instance_metrics_loop(db_factory) -> None:
    """Push VM/LXC status to 'instance_metrics:{server_id}_{vmid}_{type}_{node}'."""
    wsman = _get_ws_manager()
    while True:
        await asyncio.sleep(2)
        channels = wsman.get_channels_matching("instance_metrics:")
        if not channels:
            continue

        async def _push_instance(channel: str) -> None:
            try:
                # channel format: instance_metrics:{server_id}_{vmid}_{type}_{node}
                suffix = channel.split(":", 1)[1]
                parts = suffix.split("_", 3)
                if len(parts) != 4:
                    return
                server_id_str, vmid_str, inst_type, node = parts
                if not node:
                    return
                vmid = int(vmid_str)
                status = await asyncio.to_thread(
                    _fetch_instance_status, db_factory, int(server_id_str), vmid, inst_type, node
                )
                if not status:
                    return
                payload = {
                    "type": "metrics_update",
                    "channel": channel,
                    "data": status,
                }
                _metrics_cache[channel] = payload
                await wsman.broadcast_to_channel(channel, payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug(f"[metrics_broadcaster] instance metrics error on '{channel}': {exc}")

        await asyncio.gather(*[_push_instance(ch) for ch in channels], return_exceptions=True)


# ──────────────────────────────────────────────────────────────────────────────
# Instances list metrics loop  (push every 5 s)
# Pushes a slim list of live VM/LXC metrics from cluster/resources for the
# instances table page. One channel for all clients: 'instances_list_metrics'.
# ──────────────────────────────────────────────────────────────────────────────

def _fetch_all_instances_metrics(db_factory) -> list:
    """Pull live metrics for all VMs/LXC across all online servers via cluster/resources."""
    from ..models import ProxmoxServer
    from ..api.proxmox._helpers import _get_proxmox_client
    db = db_factory()
    try:
        servers = db.query(ProxmoxServer).filter(ProxmoxServer.is_online == True).all()
    finally:
        db.close()

    out: list = []
    for server in servers:
        try:
            client = _get_proxmox_client(server)
            # Skip is_connected() check (makes extra HTTP call); just try and catch
            for res in client.get_cluster_resources(type_='vm'):
                vmid = res.get('vmid')
                if vmid is None:
                    continue
                out.append({
                    "server_id": server.id,
                    "vmid": vmid,
                    "node": res.get('node'),
                    "status": res.get('status'),
                    "cpu": res.get('cpu'),
                    "mem": res.get('mem'),
                    "maxmem": res.get('maxmem'),
                    "disk": res.get('disk'),
                    "maxdisk": res.get('maxdisk'),
                    "uptime": res.get('uptime'),
                    "netin": res.get('netin'),
                    "netout": res.get('netout'),
                })
        except Exception as exc:
            logger.debug(f"[metrics_broadcaster] instances list metrics error for server {server.id}: {exc}")
    return out


async def instances_list_metrics_loop(db_factory) -> None:
    """Push live VM/LXC metrics list to 'instances_list_metrics' subscribers (~1 s)."""
    wsman = _get_ws_manager()
    channel = "instances_list_metrics"
    while True:
        await asyncio.sleep(1)
        if not wsman.has_channel_subscribers(channel):
            continue
        try:
            items = await asyncio.to_thread(_fetch_all_instances_metrics, db_factory)
            if not items:
                continue
            payload = {
                "type": "metrics_update",
                "channel": channel,
                "data": {"items": items},
            }
            _metrics_cache[channel] = payload
            await wsman.broadcast_to_channel(channel, payload)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning(f"[metrics_broadcaster] instances list loop error: {exc}")



# ──────────────────────────────────────────────────────────────────────────────
# On-demand RRD request handler
# ──────────────────────────────────────────────────────────────────────────────

async def handle_rrd_request(
    websocket,
    request_id: str,
    action: str,
    params: dict,
    db_factory,
) -> None:
    """
    Handle a client-initiated RRD data request and reply directly to the
    requesting WebSocket connection.  The actual Proxmox call runs in a thread.

    Expected params keys:
      server_id   — int
      node        — str
      timeframe   — "hour" | "day" | "week" | "month" | "year"
      vmid        — int  (for get_rrd only)
      inst_type   — "qemu" | "lxc"  (for get_rrd only)
    """
    error_msg = None
    data = None
    try:
        server_id = int(params.get("server_id", 0))
        data = await asyncio.to_thread(_fetch_rrd, db_factory, server_id, action, params)
    except Exception as exc:
        logger.debug(f"[metrics_broadcaster] RRD request error ({action}): {exc}")
        error_msg = str(exc)

    try:
        payload: dict = {"type": "rrd_response", "request_id": request_id, "data": data}
        if error_msg:
            payload["error"] = error_msg
        await websocket.send_text(json.dumps(payload, default=str))
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# Entry-point — call from lifespan
# ──────────────────────────────────────────────────────────────────────────────

def start_metrics_broadcaster(db_factory) -> None:
    """
    Schedule all metrics broadcasting coroutines as asyncio Tasks.
    Must be called from within a running asyncio event loop (e.g. lifespan).
    """
    asyncio.create_task(dashboard_metrics_loop(db_factory), name="metrics:dashboard")
    asyncio.create_task(server_metrics_loop(db_factory), name="metrics:servers")
    asyncio.create_task(instance_metrics_loop(db_factory), name="metrics:instances")
    asyncio.create_task(instances_list_metrics_loop(db_factory), name="metrics:instances_list")
    logger.info("[metrics_broadcaster] Metrics broadcasting tasks started")
