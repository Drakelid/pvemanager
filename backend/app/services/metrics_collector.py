"""Background collector that persists instance telemetry to our own tables."""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

from loguru import logger

from .metrics_history import (
    compute_rate, parse_blockstats, parse_netstat, aggregate_fsinfo,
)


def _status(client, inst_type, node, vmid):
    if inst_type == "qemu":
        return client.get_vm_status(node, vmid)
    return client.get_container_status(node, vmid)


def collect_once(db, items, clients, prev, _now=None):
    """One collection tick. Mutates `prev` to carry counters between ticks."""
    from ..models import InstanceMetric, InstanceNicMetric
    now = _now if _now is not None else time.monotonic()
    ts = datetime.now(tz=timezone.utc)

    # netstat is one call per (server_id, node); cache per tick.
    netstat_cache: dict[tuple, list] = {}
    # Track which prev keys are touched this tick so stale entries can be evicted.
    seen: set = set()

    for it in items:
        if it.get("status") != "running":
            continue
        sid, vmid = it["server_id"], it["vmid"]
        inst_type, node = it.get("type"), it.get("node")
        client = clients.get(sid)
        if client is None or not node:
            continue
        try:
            status = _status(client, inst_type, node, vmid)
            if not status:
                continue

            # disk fill
            if inst_type == "qemu":
                used, total = aggregate_fsinfo(client.get_vm_fsinfo(node, vmid))
            else:
                used = int(status.get("disk", 0) or 0)
                total = int(status.get("maxdisk", 0) or 0)

            # cumulative counters → rates
            key = f"{sid}:{vmid}"
            cur = {
                "netin": float(status.get("netin", 0) or 0),
                "netout": float(status.get("netout", 0) or 0),
                "diskread": float(status.get("diskread", 0) or 0),
                "diskwrite": float(status.get("diskwrite", 0) or 0),
            }
            if inst_type == "qemu":
                rd_ops, wr_ops = parse_blockstats(client.get_vm_blockstats(node, vmid))
                cur["rd_ops"], cur["wr_ops"] = float(rd_ops), float(wr_ops)

            pkey = prev.get(key)
            dt = (now - pkey[0]) if pkey else 0
            pc = pkey[1] if pkey else {}

            def rate(name):
                return compute_rate(pc.get(name), cur.get(name), dt)

            db.add(InstanceMetric(
                server_id=sid, vmid=vmid, vm_type=inst_type, ts=ts,
                cpu=status.get("cpu"), mem=status.get("mem"), maxmem=status.get("maxmem"),
                disk_used=used, disk_total=total,
                netin_rate=rate("netin"), netout_rate=rate("netout"),
                diskread_rate=rate("diskread"), diskwrite_rate=rate("diskwrite"),
                iops_read=rate("rd_ops") if inst_type == "qemu" else None,
                iops_write=rate("wr_ops") if inst_type == "qemu" else None,
            ))
            prev[key] = (now, cur)
            seen.add(key)

            # per-NIC
            ck = (sid, node)
            if ck not in netstat_cache:
                netstat_cache[ck] = client.get_node_netstat(node)
            per_dev = parse_netstat(netstat_cache[ck], vmid)
            for dev, (din, dout) in per_dev.items():
                nkey = f"{sid}:{vmid}:{dev}"
                npkey = prev.get(nkey)
                ndt = (now - npkey[0]) if npkey else 0
                npc = npkey[1] if npkey else {}
                db.add(InstanceNicMetric(
                    server_id=sid, vmid=vmid, ts=ts, dev=dev,
                    in_rate=compute_rate(npc.get("in"), float(din), ndt),
                    out_rate=compute_rate(npc.get("out"), float(dout), ndt),
                ))
                prev[nkey] = (now, {"in": float(din), "out": float(dout)})
                seen.add(nkey)
        except Exception as e:
            logger.debug(f"[metrics_collector] {sid}:{vmid} error: {e}")

    # Evict stale keys from prev (VMs/NICs not seen this tick).
    for k in list(prev):
        if k not in seen:
            del prev[k]


async def metrics_collector_loop(db_factory) -> None:
    from ..config import settings
    from .metrics_broadcaster import _enumerate_instances_for_list
    prev: dict = {}
    while True:
        start = time.monotonic()
        try:
            items, clients = await asyncio.to_thread(_enumerate_instances_for_list, db_factory)
            db = db_factory()
            try:
                await asyncio.to_thread(collect_once, db, items, clients, prev)
                db.commit()
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[metrics_collector] tick error: {e}")
        await asyncio.sleep(max(1.0, settings.METRICS_COLLECT_INTERVAL - (time.monotonic() - start)))


async def metrics_retention_loop(db_factory) -> None:
    from ..config import settings
    from ..models import InstanceMetric, InstanceNicMetric
    from datetime import timedelta
    while True:
        try:
            cutoff = datetime.now(tz=timezone.utc) - timedelta(days=settings.METRICS_RETENTION_DAYS)
            db = db_factory()
            try:
                db.query(InstanceMetric).filter(InstanceMetric.ts < cutoff).delete()
                db.query(InstanceNicMetric).filter(InstanceNicMetric.ts < cutoff).delete()
                db.commit()
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[metrics_collector] retention error: {e}")
        await asyncio.sleep(3600)
