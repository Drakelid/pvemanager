from datetime import datetime, timezone

def test_instance_metric_roundtrip(db_session):
    from app.models import InstanceMetric, InstanceNicMetric
    ts = datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)
    db_session.add(InstanceMetric(
        server_id=1, vmid=114, vm_type="qemu", ts=ts,
        cpu=0.25, mem=100, maxmem=200, disk_used=10, disk_total=40,
        netin_rate=1.0, netout_rate=2.0, diskread_rate=0.0, diskwrite_rate=3.0,
        iops_read=12.0, iops_write=4.0,
    ))
    db_session.add(InstanceNicMetric(
        server_id=1, vmid=114, ts=ts, dev="tap114i0", in_rate=5.0, out_rate=6.0))
    db_session.commit()
    m = db_session.query(InstanceMetric).one()
    assert m.vmid == 114
    assert m.iops_read == 12.0
    n = db_session.query(InstanceNicMetric).one()
    assert n.dev == "tap114i0"
    assert n.out_rate == 6.0
