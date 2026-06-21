from app.services import metrics_history as mh


def test_compute_rate_normal():
    assert mh.compute_rate(100, 160, 2.0) == 30.0

def test_compute_rate_no_prev():
    assert mh.compute_rate(None, 160, 2.0) is None

def test_compute_rate_counter_reset():
    assert mh.compute_rate(500, 10, 2.0) == 0.0

def test_compute_rate_zero_dt():
    assert mh.compute_rate(100, 200, 0) is None

def test_parse_blockstats_sums_devices():
    text = (
        "drive-scsi0: rd_bytes=10 wr_bytes=20 rd_operations=100 wr_operations=50 flush_operations=1\n"
        "drive-scsi1: rd_bytes=5 wr_bytes=5 rd_operations=7 wr_operations=3 flush_operations=0\n"
    )
    assert mh.parse_blockstats(text) == (107, 53)

def test_parse_blockstats_empty():
    assert mh.parse_blockstats("") == (0, 0)

def test_parse_netstat_filters_by_vmid():
    rows = [
        {"dev": "tap114i0", "vmid": "114", "in": "1000", "out": "2000"},
        {"dev": "tap114i1", "vmid": "114", "in": "10", "out": "20"},
        {"dev": "tap200i0", "vmid": "200", "in": "9", "out": "9"},
    ]
    out = mh.parse_netstat(rows, 114)
    assert out == {"tap114i0": (1000, 2000), "tap114i1": (10, 20)}

def test_aggregate_fsinfo_sums():
    disks = [{"used": 10, "total": 40}, {"used": 5, "total": 20}]
    assert mh.aggregate_fsinfo(disks) == (15, 60)

def test_aggregate_fsinfo_empty():
    assert mh.aggregate_fsinfo([]) == (0, 0)


def test_timeframe_to_range_hour():
    assert mh.timeframe_to_range("hour", 10_000) == (10_000 - 3600, 10_000)

def test_timeframe_to_range_month():
    assert mh.timeframe_to_range("month", 10_000_000) == (10_000_000 - 30 * 86400, 10_000_000)

def test_timeframe_to_range_unknown_defaults_hour():
    assert mh.timeframe_to_range("nonsense", 10_000) == (10_000 - 3600, 10_000)

def test_pick_bucket_respects_floor():
    # 1h window, target 150 -> 24s ideal, but floor 15 keeps >=15
    assert mh.pick_bucket_seconds(0, 3600, target_points=150, floor=15) == 24

def test_pick_bucket_floor_applied():
    assert mh.pick_bucket_seconds(0, 300, target_points=150, floor=15) == 15

def test_aggregate_series_averages_buckets():
    rows = [
        {"time": 0, "cpu": 10.0, "mem": 100},
        {"time": 5, "cpu": 20.0, "mem": 200},
        {"time": 20, "cpu": 40.0, "mem": None},
    ]
    out = mh.aggregate_series(rows, from_ts=0, bucket=10, fields=["cpu", "mem"])
    # bucket 0: times 0,5 -> cpu 15, mem 150 ; bucket 20: time 20 -> cpu 40, mem None
    assert out[0] == {"time": 0, "cpu": 15.0, "mem": 150.0}
    assert out[-1] == {"time": 20, "cpu": 40.0, "mem": None}

def test_aggregate_series_empty():
    assert mh.aggregate_series([], 0, 10, ["cpu"]) == []
