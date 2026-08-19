"""Parser for Proxmox ``netN`` guest NIC strings.

Proxmox stores every guest network card as one comma-separated key=value
string in the guest config (``net0``, ``net1``, …). Two dialects exist:

* QEMU — ``virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,tag=100,firewall=1``
  The NIC model is itself the key holding the MAC address.
* LXC  — ``name=eth0,bridge=vmbr0,hwaddr=AA:BB:CC:DD:EE:FF,ip=10.0.0.5/24,``
  ``gw=10.0.0.1,type=veth,firewall=1``

The repository only ever *builds* these strings (``api/proxmox/lxc.py``,
``proxmox/mixins/vm.py``); this module reads them back so callers can learn
which bridge/VLAN a guest actually sits on.

Deliberately free of any ``proxmoxer`` import so both the API layer and the
client mixins can use it. Parsing never raises: an unparsable token is skipped
rather than failing the whole request.
"""

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
import re

# NIC models QEMU accepts. The model name doubles as the key carrying the MAC,
# which is the only way to tell "virtio=AA:.." from an ordinary option.
QEMU_MODELS = {
    "virtio", "e1000", "e1000e", "e1000-82540em", "e1000-82544gc",
    "e1000-82545em", "rtl8139", "vmxnet3", "ne2k_pci", "ne2k_isa",
    "pcnet", "i82551", "i82557b", "i82559er",
}

_NET_KEY_RE = re.compile(r"^net(\d+)$")


@dataclass
class ParsedNic:
    """One guest network interface, normalised across the QEMU/LXC dialects."""

    key: str                       # "net0"
    index: int                     # 0
    model: Optional[str] = None    # virtio / e1000 / … (QEMU only)
    mac: Optional[str] = None      # uppercase, from model= or hwaddr=
    bridge: Optional[str] = None   # vmbr0 or an SDN vnet
    vlan_tag: Optional[int] = None
    trunks: List[int] = field(default_factory=list)
    firewall: bool = False
    link_down: bool = False
    name: Optional[str] = None     # LXC: name=eth0
    ip: Optional[str] = None       # LXC: "10.0.0.5/24" or "dhcp"
    ip6: Optional[str] = None
    gw: Optional[str] = None
    gw6: Optional[str] = None
    rate: Optional[float] = None   # MB/s
    mtu: Optional[int] = None
    queues: Optional[int] = None
    raw: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _as_int(value: str) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_bool(value: str) -> bool:
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def parse_net_string(key: str, value: str) -> ParsedNic:
    """Parse a single ``netN`` value. Never raises."""
    match = _NET_KEY_RE.match(key or "")
    nic = ParsedNic(key=key or "", index=int(match.group(1)) if match else 0, raw=value or "")

    for token in (value or "").split(","):
        token = token.strip()
        if not token or "=" not in token:
            # Bare tokens (rare, e.g. a stray flag) carry nothing we need.
            continue
        opt, _, raw_val = token.partition("=")
        opt = opt.strip().lower()
        raw_val = raw_val.strip()

        if opt in QEMU_MODELS:
            nic.model = opt
            nic.mac = raw_val.upper() or None
        elif opt == "hwaddr":
            nic.mac = raw_val.upper() or None
        elif opt == "bridge":
            nic.bridge = raw_val or None
        elif opt == "tag":
            nic.vlan_tag = _as_int(raw_val)
        elif opt == "trunks":
            nic.trunks = [v for v in (_as_int(p) for p in raw_val.split(";")) if v is not None]
        elif opt == "firewall":
            nic.firewall = _as_bool(raw_val)
        elif opt == "link_down":
            nic.link_down = _as_bool(raw_val)
        elif opt == "name":
            nic.name = raw_val or None
        elif opt == "ip":
            nic.ip = raw_val or None
        elif opt == "ip6":
            nic.ip6 = raw_val or None
        elif opt == "gw":
            nic.gw = raw_val or None
        elif opt == "gw6":
            nic.gw6 = raw_val or None
        elif opt == "rate":
            nic.rate = _as_float(raw_val)
        elif opt == "mtu":
            nic.mtu = _as_int(raw_val)
        elif opt == "queues":
            nic.queues = _as_int(raw_val)

    return nic


def parse_guest_nics(config: Dict[str, Any]) -> List[ParsedNic]:
    """Every ``netN`` entry of a QEMU/LXC config, ordered by interface index."""
    nics: List[ParsedNic] = []
    for key, value in (config or {}).items():
        if not isinstance(key, str) or not _NET_KEY_RE.match(key):
            continue
        if not isinstance(value, str):
            continue
        nics.append(parse_net_string(key, value))
    nics.sort(key=lambda n: n.index)
    return nics
