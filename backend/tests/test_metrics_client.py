from unittest.mock import MagicMock
from app.proxmox.client import ProxmoxClient


def _client_with_mock(proxmox):
    c = ProxmoxClient.__new__(ProxmoxClient)
    c.proxmox = proxmox
    return c


def test_get_vm_blockstats_returns_text():
    px = MagicMock()
    px.nodes.return_value.qemu.return_value.monitor.post.return_value = "drive-scsi0: rd_operations=5 wr_operations=2"
    c = _client_with_mock(px)
    assert "rd_operations=5" in c.get_vm_blockstats("prod", 114)
    px.nodes.return_value.qemu.return_value.monitor.post.assert_called_once_with(command="info blockstats")


def test_get_vm_blockstats_swallows_errors():
    px = MagicMock()
    px.nodes.return_value.qemu.return_value.monitor.post.side_effect = RuntimeError("nope")
    c = _client_with_mock(px)
    assert c.get_vm_blockstats("prod", 114) == ""


def test_get_node_netstat_returns_rows():
    px = MagicMock()
    px.nodes.return_value.netstat.get.return_value = [{"dev": "tap114i0", "vmid": "114", "in": "1", "out": "2"}]
    c = _client_with_mock(px)
    assert c.get_node_netstat("prod")[0]["dev"] == "tap114i0"


def test_get_node_netstat_swallows_errors():
    px = MagicMock()
    px.nodes.return_value.netstat.get.side_effect = RuntimeError("nope")
    c = _client_with_mock(px)
    assert c.get_node_netstat("prod") == []
