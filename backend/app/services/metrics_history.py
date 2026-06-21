"""Pure helpers + read query for instance metric history."""
from __future__ import annotations

import re
from datetime import timezone as _tz

_RD_OPS = re.compile(r"rd_operations=(\d+)")
_WR_OPS = re.compile(r"wr_operations=(\d+)")


def compute_rate(prev, cur, dt):
    """Per-second rate from cumulative counters. None if unknowable; 0 on reset."""
    if prev is None or cur is None or not dt or dt <= 0:
        return None
    delta = float(cur) - float(prev)
    if delta < 0:
        return 0.0
    return delta / dt


def parse_blockstats(text: str):
    """Sum rd_operations / wr_operations across all block devices in HMP output."""
    rd = sum(int(m) for m in _RD_OPS.findall(text or ""))
    wr = sum(int(m) for m in _WR_OPS.findall(text or ""))
    return rd, wr


def parse_netstat(rows, vmid: int):
    """Map dev -> (in_bytes, out_bytes) for the given vmid from /nodes/{node}/netstat."""
    out: dict[str, tuple[int, int]] = {}
    for r in rows or []:
        try:
            if int(r.get("vmid")) != int(vmid):
                continue
        except (TypeError, ValueError):
            continue
        dev = r.get("dev")
        if not dev:
            continue
        out[dev] = (int(float(r.get("in", 0) or 0)), int(float(r.get("out", 0) or 0)))
    return out


def aggregate_fsinfo(disks):
    """Sum used/total bytes across guest filesystems."""
    used = sum(int(d.get("used", 0) or 0) for d in disks or [])
    total = sum(int(d.get("total", 0) or 0) for d in disks or [])
    return used, total


_TIMEFRAME_SECONDS = {
    "hour": 3600,
    "day": 86400,
    "week": 7 * 86400,
    "month": 30 * 86400,
}


def timeframe_to_range(timeframe, now_ts):
    """Convert timeframe string to (from_ts, to_ts) tuple."""
    span = _TIMEFRAME_SECONDS.get(timeframe, 3600)
    return now_ts - span, now_ts


def pick_bucket_seconds(from_ts, to_ts, target_points=150, floor=15):
    """Calculate bucket size in seconds for time-series aggregation."""
    span = max(1, to_ts - from_ts)
    ideal = span // max(1, target_points)
    return max(floor, int(ideal))


def aggregate_series(rows, from_ts, bucket, fields):
    """Aggregate time-series data into buckets, averaging numeric fields."""
    if not rows:
        return []
    buckets: dict[int, dict] = {}
    order: list[int] = []
    for r in rows:
        b = from_ts + ((int(r["time"]) - from_ts) // bucket) * bucket
        if b not in buckets:
            buckets[b] = {f: [] for f in fields}
            order.append(b)
        for f in fields:
            v = r.get(f)
            if v is not None:
                buckets[b][f].append(float(v))
    out = []
    for b in order:
        point = {"time": b}
        for f in fields:
            vals = buckets[b][f]
            point[f] = (sum(vals) / len(vals)) if vals else None
        out.append(point)
    return out


_AGG_FIELDS = ["cpu", "mem", "maxmem", "netin", "netout",
               "diskread", "diskwrite", "diskpct", "iops_read", "iops_write"]


def _to_ts(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_tz.utc)
    return int(dt.timestamp())


def query_instance_metrics(db, server_id, vmid, from_ts, to_ts, nic="all"):
    from ..models import InstanceMetric, InstanceNicMetric
    from datetime import datetime

    start = datetime.fromtimestamp(from_ts, tz=_tz.utc)
    end = datetime.fromtimestamp(to_ts, tz=_tz.utc)

    base = (db.query(InstanceMetric)
              .filter(InstanceMetric.server_id == server_id,
                      InstanceMetric.vmid == vmid,
                      InstanceMetric.ts >= start, InstanceMetric.ts <= end)
              .order_by(InstanceMetric.ts.asc()).all())

    # Distinct NICs seen in the window (for the selector).
    if nic == "all":
        # Only fetch distinct dev names — avoids loading all NIC rows.
        dev_rows = (db.query(InstanceNicMetric.dev)
                      .filter(InstanceNicMetric.server_id == server_id,
                              InstanceNicMetric.vmid == vmid,
                              InstanceNicMetric.ts >= start, InstanceNicMetric.ts <= end)
                      .distinct().all())
        nics = sorted({r.dev for r in dev_rows})
        nic_by_ts: dict[int, tuple] = {}
    else:
        # Load full NIC rows for the requested dev to build per-ts override map.
        nic_rows = (db.query(InstanceNicMetric)
                      .filter(InstanceNicMetric.server_id == server_id,
                              InstanceNicMetric.vmid == vmid,
                              InstanceNicMetric.ts >= start, InstanceNicMetric.ts <= end)
                      .order_by(InstanceNicMetric.ts.asc()).all())
        nics = sorted({r.dev for r in nic_rows})
        nic_by_ts = {}
        for r in nic_rows:
            if r.dev == nic:
                nic_by_ts[_to_ts(r.ts)] = (r.in_rate, r.out_rate)

    rows = []
    for m in base:
        ts = _to_ts(m.ts)
        netin, netout = m.netin_rate, m.netout_rate
        if nic != "all":
            ov = nic_by_ts.get(ts)
            netin, netout = (ov if ov else (None, None))
        diskpct = (m.disk_used / m.disk_total * 100.0) if (m.disk_total or 0) > 0 else None
        rows.append({
            "time": ts,
            "cpu": (m.cpu * 100.0) if m.cpu is not None else None,
            "mem": m.mem, "maxmem": m.maxmem,
            "netin": netin, "netout": netout,
            "diskread": m.diskread_rate, "diskwrite": m.diskwrite_rate,
            "diskpct": diskpct,
            "iops_read": m.iops_read, "iops_write": m.iops_write,
        })

    bucket = pick_bucket_seconds(from_ts, to_ts)
    data = aggregate_series(rows, from_ts, bucket, _AGG_FIELDS)
    return {"data": data, "from": from_ts, "to": to_ts, "meta": {"nics": nics}}
