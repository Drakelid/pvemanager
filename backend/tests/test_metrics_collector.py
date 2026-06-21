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


def test_collect_once_evicts_stale_prev(db_session):
    """Keys for VMs absent from the current tick must be pruned from prev."""
    def _client_for(vmid_str):
        c = MagicMock()
        c.get_vm_status.return_value = {
            "cpu": 0.1, "mem": 50, "maxmem": 100,
            "netin": 0, "netout": 0, "diskread": 0, "diskwrite": 0,
        }
        c.get_vm_fsinfo.return_value = [{"used": 5, "total": 20}]
        c.get_vm_blockstats.return_value = ""
        c.get_node_netstat.return_value = [
            {"dev": f"tap{vmid_str}i0", "vmid": vmid_str, "in": "0", "out": "0"}
        ]
        return c

    prev = {}
    # Tick 1: only vmid 114 running
    items_114 = [{"server_id": 1, "vmid": 114, "type": "qemu", "node": "prod", "status": "running"}]
    clients_114 = {1: _client_for("114")}
    collect_once(db_session, items_114, clients_114, prev, _now=100.0)
    # After tick 1, prev must contain 114 keys
    assert any("114" in k for k in prev), "Expected 114 keys in prev after tick 1"

    # Tick 2: only vmid 115 running (114 is gone)
    items_115 = [{"server_id": 1, "vmid": 115, "type": "qemu", "node": "prod", "status": "running"}]
    clients_115 = {1: _client_for("115")}
    collect_once(db_session, items_115, clients_115, prev, _now=102.0)
    # 114 keys must be evicted; 115 keys must be present
    assert not any("114" in k for k in prev), "Expected 114 keys evicted from prev after tick 2"
    assert any("115" in k for k in prev), "Expected 115 keys in prev after tick 2"
