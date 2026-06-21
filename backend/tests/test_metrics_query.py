# backend/tests/test_metrics_query.py
from datetime import datetime, timezone
from app.services.metrics_history import query_instance_metrics


def _row(db, InstanceMetric, ts, **kw):
    db.add(InstanceMetric(server_id=1, vmid=114, vm_type="qemu",
                          ts=datetime.fromtimestamp(ts, tz=timezone.utc), **kw))


def test_query_aggregate_all_nic(db_session):
    from app.models import InstanceMetric
    _row(db_session, InstanceMetric, 1000, cpu=0.10, mem=100, maxmem=200,
         disk_used=10, disk_total=40, netin_rate=1.0, netout_rate=2.0,
         diskread_rate=0.0, diskwrite_rate=0.0, iops_read=5.0, iops_write=1.0)
    _row(db_session, InstanceMetric, 1005, cpu=0.30, mem=140, maxmem=200,
         disk_used=20, disk_total=40, netin_rate=3.0, netout_rate=4.0,
         diskread_rate=0.0, diskwrite_rate=0.0, iops_read=7.0, iops_write=3.0)
    db_session.commit()
    out = query_instance_metrics(db_session, 1, 114, from_ts=1000, to_ts=1010, nic="all")
    assert out["from"] == 1000 and out["to"] == 1010
    pt = out["data"][0]
    assert pt["cpu"] == 20.0          # avg(10%,30%)
    assert pt["netin"] == 2.0         # avg(1,3)
    assert pt["diskpct"] == 37.5      # avg(25%,50%)
    assert pt["iops_read"] == 6.0


def test_query_specific_nic_overrides_net(db_session):
    from app.models import InstanceMetric, InstanceNicMetric
    _row(db_session, InstanceMetric, 1000, cpu=0.0, mem=0, maxmem=1,
         disk_used=0, disk_total=1, netin_rate=99.0, netout_rate=99.0,
         diskread_rate=0.0, diskwrite_rate=0.0, iops_read=0.0, iops_write=0.0)
    db_session.add(InstanceNicMetric(server_id=1, vmid=114,
        ts=datetime.fromtimestamp(1000, tz=timezone.utc), dev="tap114i0",
        in_rate=7.0, out_rate=8.0))
    db_session.commit()
    out = query_instance_metrics(db_session, 1, 114, 1000, 1010, nic="tap114i0")
    assert out["meta"]["nics"] == ["tap114i0"]
    assert out["data"][0]["netin"] == 7.0 and out["data"][0]["netout"] == 8.0


def test_query_empty(db_session):
    out = query_instance_metrics(db_session, 1, 999, 0, 10, nic="all")
    assert out["data"] == [] and out["meta"]["nics"] == []
