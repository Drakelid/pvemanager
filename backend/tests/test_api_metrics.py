"""Tests for /metrics read endpoints (Task 6)."""
from datetime import datetime, timezone
import time


def test_metrics_endpoint_returns_series(client, admin_headers, db_session):
    """Seeds InstanceMetric rows then reads them via the API.
    The endpoint reads only the DB — no Proxmox call required."""
    from app.models import InstanceMetric

    now = int(time.time())
    for i, cpu in enumerate((0.1, 0.3)):
        db_session.add(InstanceMetric(
            server_id=1, vmid=114, vm_type="qemu",
            ts=datetime.fromtimestamp(now - 10 + i, tz=timezone.utc),
            cpu=cpu, mem=100, maxmem=200, disk_used=10, disk_total=40,
            netin_rate=1.0, netout_rate=2.0, diskread_rate=0.0, diskwrite_rate=0.0,
            iops_read=5.0, iops_write=1.0))
    db_session.commit()

    r = client.get(
        "/proxmox/api/1/vm/114/metrics?timeframe=hour&node=prod",
        headers=admin_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body and "meta" in body
    assert body["data"], "expected at least one bucket"
    assert "nics" in body["meta"]


def test_container_metrics_endpoint_returns_series(client, admin_headers, db_session):
    """Same flow for container endpoint."""
    from app.models import InstanceMetric

    now = int(time.time())
    db_session.add(InstanceMetric(
        server_id=1, vmid=200, vm_type="lxc",
        ts=datetime.fromtimestamp(now - 5, tz=timezone.utc),
        cpu=0.2, mem=512, maxmem=1024, disk_used=20, disk_total=80,
        netin_rate=3.0, netout_rate=1.5, diskread_rate=0.0, diskwrite_rate=0.0,
        iops_read=2.0, iops_write=0.5))
    db_session.commit()

    r = client.get(
        "/proxmox/api/1/container/200/metrics?timeframe=hour&node=prod",
        headers=admin_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body and "meta" in body
    assert "nics" in body["meta"]


def test_metrics_explicit_from_to(client, admin_headers, db_session):
    """Explicit from_ts/to_ts take precedence over timeframe."""
    from app.models import InstanceMetric

    now = int(time.time())
    db_session.add(InstanceMetric(
        server_id=1, vmid=300, vm_type="qemu",
        ts=datetime.fromtimestamp(now - 30, tz=timezone.utc),
        cpu=0.5, mem=256, maxmem=512, disk_used=5, disk_total=20,
        netin_rate=0.5, netout_rate=0.5, diskread_rate=0.0, diskwrite_rate=0.0,
        iops_read=1.0, iops_write=1.0))
    db_session.commit()

    r = client.get(
        f"/proxmox/api/1/vm/300/metrics?from_ts={now - 60}&to_ts={now}",
        headers=admin_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body and "meta" in body
