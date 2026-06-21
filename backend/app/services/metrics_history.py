"""Pure helpers + read query for instance metric history."""
from __future__ import annotations

import re

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
