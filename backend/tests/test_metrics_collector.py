"""Tests for metrics_collector.collect_once (unit-testable core)."""
from unittest.mock import MagicMock
from app.services.metrics_collector import collect_once


def _client():
    c = MagicMock()
    # status/current
    c.get_vm_status.return_value = {
        "cpu": 0.5, "mem": 100, "maxmem": 200,
        "netin": 1000, "netout": 2000, "diskread": 0, "diskwrite": 500,
    }
    c.get_vm_fsinfo.return_value = [{"used": 10, "total": 40}]
    c.get_vm_blockstats.return_value = "drive-scsi0: rd_operations=100 wr_operations=50"
    c.get_node_netstat.return_value = [
        {"dev": "tap114i0", "vmid": "114", "in": "1000", "out": "2000"}]
    return c


def test_collect_once_first_tick_no_rates(db_session):
    from app.models import InstanceMetric
    items = [{"server_id": 1, "vmid": 114, "type": "qemu", "node": "prod", "status": "running"}]
    clients = {1: _client()}
    prev = {}
    collect_once(db_session, items, clients, prev, _now=100.0)
    db_session.commit()
    m = db_session.query(InstanceMetric).one()
    assert m.cpu == 0.5 and m.disk_used == 10 and m.disk_total == 40
    assert m.netin_rate is None          # no previous counter yet
    assert m.iops_read is None


def test_collect_once_second_tick_computes_rates(db_session):
    from app.models import InstanceMetric, InstanceNicMetric
    items = [{"server_id": 1, "vmid": 114, "type": "qemu", "node": "prod", "status": "running"}]
    c = _client()
    clients = {1: c}
    prev = {}
    collect_once(db_session, items, clients, prev, _now=100.0)
    # advance counters by 10 over 2 seconds
    c.get_vm_status.return_value = {"cpu": 0.5, "mem": 100, "maxmem": 200,
                                   "netin": 1020, "netout": 2040, "diskread": 0, "diskwrite": 500}
    c.get_vm_blockstats.return_value = "drive-scsi0: rd_operations=110 wr_operations=56"
    c.get_node_netstat.return_value = [{"dev": "tap114i0", "vmid": "114", "in": "1020", "out": "2040"}]
    collect_once(db_session, items, clients, prev, _now=102.0)
    db_session.commit()
    rows = db_session.query(InstanceMetric).order_by(InstanceMetric.id).all()
    assert rows[1].netin_rate == 10.0     # (1020-1000)/2
    assert rows[1].iops_read == 5.0       # (110-100)/2
    nic = db_session.query(InstanceNicMetric).order_by(InstanceNicMetric.id).all()[-1]
    assert nic.in_rate == 10.0            # (1020-1000)/2
