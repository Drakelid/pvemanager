from unittest.mock import MagicMock

from app.proxmox.client import ProxmoxClient


def _client_with_mock(proxmox):
    c = ProxmoxClient.__new__(ProxmoxClient)
    c.proxmox = proxmox
    return c


def _lxc_mock(config=None, interfaces=None):
    """MagicMock whose nodes(..).lxc(..).config/.interfaces behave like Proxmox."""
    px = MagicMock()
    lxc = px.nodes.return_value.lxc.return_value
    if isinstance(config, Exception):
        lxc.config.get.side_effect = config
    else:
        lxc.config.get.return_value = config or {}
    if isinstance(interfaces, Exception):
        lxc.interfaces.get.side_effect = interfaces
    else:
        lxc.interfaces.get.return_value = interfaces or []
    return px, lxc


def test_static_ip_comes_from_net0_not_ipconfig():
    px, lxc = _lxc_mock(config={
        "hostname": "gitea",
        "net0": "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:AA:BB:CC,ip=10.10.10.9/24,gw=10.10.10.1,type=veth",
    })
    ifaces = _client_with_mock(px).get_container_interfaces("pve1", 109)

    assert ifaces == [{
        "name": "eth0",
        "hardware_address": "BC:24:11:AA:BB:CC",
        "ips": [{"address": "10.10.10.9", "type": "ipv4", "prefix": 24}],
    }]
    # Static address is authoritative — no extra call to the live endpoint.
    lxc.interfaces.get.assert_not_called()


def test_dhcp_container_falls_back_to_live_interfaces():
    px, _ = _lxc_mock(
        config={"net0": "name=eth0,bridge=vmbr0,hwaddr=BC:24:11:00:11:22,ip=dhcp,type=veth"},
        interfaces=[
            {"name": "lo", "inet": "127.0.0.1/8"},
            {"name": "eth0", "hwaddr": "bc:24:11:00:11:22", "inet": "10.10.10.55/24",
             "inet6": "fe80::be24:11ff:fe00:1122/64"},
        ],
    )
    ifaces = _client_with_mock(px).get_container_interfaces("pve1", 120)

    assert ifaces == [{
        "name": "eth0",
        "hardware_address": "BC:24:11:00:11:22",
        "ips": [{"address": "10.10.10.55", "type": "ipv4", "prefix": 24}],
    }]


def test_stopped_dhcp_container_yields_nothing():
    px, _ = _lxc_mock(
        config={"net0": "name=eth0,bridge=vmbr0,ip=dhcp,type=veth"},
        interfaces=RuntimeError("500 CT is not running"),
    )
    assert _client_with_mock(px).get_container_interfaces("pve1", 120) == []


def test_multiple_nics_and_ipv6_static():
    px, _ = _lxc_mock(config={
        "net0": "name=eth0,bridge=vmbr0,ip=10.10.10.9/24,gw=10.10.10.1",
        "net1": "name=eth1,bridge=vmbr1,ip=192.168.50.4/24,ip6=2001:db8::4/64",
    })
    ifaces = _client_with_mock(px).get_container_interfaces("pve1", 121)

    assert [i["name"] for i in ifaces] == ["eth0", "eth1"]
    assert ifaces[1]["ips"] == [
        {"address": "192.168.50.4", "type": "ipv4", "prefix": 24},
        {"address": "2001:db8::4", "type": "ipv6", "prefix": 64},
    ]


def test_unreadable_config_still_tries_live_interfaces():
    px, _ = _lxc_mock(
        config=RuntimeError("permission denied"),
        interfaces=[{"name": "eth0", "hwaddr": "aa:bb:cc:dd:ee:ff", "inet": "10.0.0.7/24"}],
    )
    ifaces = _client_with_mock(px).get_container_interfaces("pve1", 122)
    assert ifaces[0]["ips"] == [{"address": "10.0.0.7", "type": "ipv4", "prefix": 24}]


def test_no_proxmox_connection():
    c = ProxmoxClient.__new__(ProxmoxClient)
    c.proxmox = None
    assert c.get_container_interfaces("pve1", 100) == []


def test_include_live_false_skips_live_endpoint():
    px, lxc = _lxc_mock(
        config={"net0": "name=eth0,bridge=vmbr0,ip=dhcp,type=veth"},
        interfaces=[{"name": "eth0", "inet": "10.0.0.8/24"}],
    )
    # Stopped container: querying /interfaces would only produce a 500.
    assert _client_with_mock(px).get_container_interfaces("pve1", 130, include_live=False) == []
    lxc.interfaces.get.assert_not_called()
