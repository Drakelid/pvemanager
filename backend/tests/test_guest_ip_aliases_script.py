"""Скрипт синхронизации alias-адресов: детект стека и содержимое конфигов.

Скрипт запускается настоящим /bin/sh в песочнице: PVEM_ROOT подменяет корень
файловой системы, а ip/nmcli/ifup подставляются заглушками через PATH. Так
проверяется именно shell-логика — то, что реально выполняется внутри гостя.
"""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "app" / "services" / "guest_ip" / "sync_aliases.sh"

FAKE_IP = """#!/bin/sh
echo "$*" >> "$FAKE_LOG/ip.log"
# 'addr show' печатает пустоту: считаем, что на интерфейсе адресов ещё нет
exit 0
"""

FAKE_NMCLI = """#!/bin/sh
echo "$*" >> "$FAKE_LOG/nmcli.log"
if [ "$1" = "-g" ]; then
    printf '%s' "$NM_CONNECTION"
fi
exit 0
"""

FAKE_IFUP = """#!/bin/sh
exit 0
"""

FAKE_SYSTEMCTL = """#!/bin/sh
echo "$*" >> "$FAKE_LOG/systemctl.log"
exit 0
"""


@pytest.fixture
def sandbox(tmp_path):
    """Песочница с фейковыми ip/nmcli/ifup и пустым «корнем» гостя."""
    root = tmp_path / "root"
    bindir = tmp_path / "bin"
    logdir = tmp_path / "log"
    for path in (root, bindir, logdir):
        path.mkdir(parents=True)

    for name, body in (("ip", FAKE_IP), ("nmcli", FAKE_NMCLI), ("ifup", FAKE_IFUP),
                       ("systemctl", FAKE_SYSTEMCTL)):
        target = bindir / name
        target.write_text(body)
        target.chmod(0o755)

    def run(addresses="", iface="eth0", nm_connection="", tools=("ip",)):
        """Запустить скрипт. tools — какие команды «установлены» в госте."""
        env = {
            "PATH": f"{bindir}:{os.environ['PATH']}",
            "PVEM_ROOT": str(root),
            "FAKE_LOG": str(logdir),
            "NM_CONNECTION": nm_connection,
            "IFACE": iface,
            "ADDRESSES": addresses,
        }
        # Прячем инструменты, которых в этом сценарии быть не должно
        for name in ("ip", "nmcli", "ifup", "systemctl"):
            path = bindir / name
            hidden = bindir / f"{name}.hidden"
            if name in tools and hidden.exists():
                hidden.rename(path)
            elif name not in tools and path.exists():
                path.rename(hidden)

        result = subprocess.run(
            ["/bin/sh", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=30
        )
        return result

    def persist_of(result) -> str:
        for line in result.stdout.splitlines():
            if line.startswith("PVEMANAGER_PERSIST="):
                return line.split("=", 1)[1]
        raise AssertionError(f"нет маркера persist: {result.stdout} {result.stderr}")

    def log(name: str) -> str:
        path = logdir / f"{name}.log"
        return path.read_text() if path.exists() else ""

    return {"root": root, "run": run, "persist_of": persist_of, "log": log}


def _mkdirs(root: Path, *relative: str):
    for item in relative:
        (root / item).mkdir(parents=True, exist_ok=True)


# --- sysconfig / network-scripts ----------------------------------------------

def test_sysconfig_branch_writes_ifcfg_alias(sandbox):
    """RHEL-based LXC: alias закрепляется отдельным ifcfg-файлом."""
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    result = sandbox["run"](addresses="10.10.10.90/24")

    assert sandbox["persist_of"](result) == "sysconfig"
    written = (root / "etc/sysconfig/network-scripts/ifcfg-eth0:1").read_text()
    assert "DEVICE=eth0:1" in written
    assert "IPADDR=10.10.10.90" in written
    assert "PREFIX=24" in written
    assert "BOOTPROTO=none" in written
    assert "ONBOOT=yes" in written
    assert "managed by PVEmanager" in written


def test_sysconfig_numbers_aliases_in_order(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24 10.10.10.91/24")

    scripts = root / "etc/sysconfig/network-scripts"
    assert "IPADDR=10.10.10.90" in (scripts / "ifcfg-eth0:1").read_text()
    assert "IPADDR=10.10.10.91" in (scripts / "ifcfg-eth0:2").read_text()


def test_sysconfig_drops_files_of_removed_addresses(sandbox):
    """Список сократился — лишний ifcfg удаляется, оставшийся переписывается."""
    root = sandbox["root"]
    scripts = root / "etc/sysconfig/network-scripts"
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24 10.10.10.91/24")
    sandbox["run"](addresses="10.10.10.91/24")

    assert not (scripts / "ifcfg-eth0:2").exists()
    assert "IPADDR=10.10.10.91" in (scripts / "ifcfg-eth0:1").read_text()


def test_sysconfig_removes_everything_on_empty_list(sandbox):
    root = sandbox["root"]
    scripts = root / "etc/sysconfig/network-scripts"
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24")
    result = sandbox["run"](addresses="")

    assert sandbox["persist_of"](result) == "sysconfig"
    assert list(scripts.glob("ifcfg-eth0:*")) == []


def test_sysconfig_keeps_foreign_ifcfg_files(sandbox):
    """Файлы, написанные не нами, остаются нетронутыми."""
    root = sandbox["root"]
    scripts = root / "etc/sysconfig/network-scripts"
    _mkdirs(root, "etc/sysconfig/network-scripts")
    foreign = scripts / "ifcfg-eth0:9"
    foreign.write_text("DEVICE=eth0:9\nIPADDR=10.10.10.250\n")

    sandbox["run"](addresses="10.10.10.90/24")

    assert foreign.exists()
    assert "10.10.10.250" in foreign.read_text()


def test_sysconfig_removes_alias_del_from_interface(sandbox):
    """Ушедший адрес снимается с интерфейса, а не только из конфига."""
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24")
    sandbox["run"](addresses="")

    assert "addr del 10.10.10.90/24 dev eth0" in sandbox["log"]("ip")


# --- порядок веток -------------------------------------------------------------

def test_networkmanager_without_connection_falls_through_to_sysconfig(sandbox):
    """nmcli установлен, но интерфейсом не управляет — частый случай в LXC."""
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    result = sandbox["run"](addresses="10.10.10.90/24", nm_connection="",
                            tools=("ip", "nmcli"))

    assert sandbox["persist_of"](result) == "sysconfig"
    assert (root / "etc/sysconfig/network-scripts/ifcfg-eth0:1").exists()


def test_networkmanager_with_connection_wins_over_sysconfig(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    result = sandbox["run"](addresses="10.10.10.90/24", nm_connection="System eth0",
                            tools=("ip", "nmcli"))

    assert sandbox["persist_of"](result) == "nm"
    assert "+ipv4.addresses 10.10.10.90/24" in sandbox["log"]("nmcli")
    assert list((root / "etc/sysconfig/network-scripts").glob("ifcfg-*")) == []


def test_networkmanager_drops_previous_address(sandbox):
    _mkdirs(sandbox["root"], "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24", nm_connection="System eth0",
                   tools=("ip", "nmcli"))
    sandbox["run"](addresses="10.10.10.91/24", nm_connection="System eth0",
                   tools=("ip", "nmcli"))

    assert "-ipv4.addresses 10.10.10.90/24" in sandbox["log"]("nmcli")


def test_ifupdown_wins_when_several_stacks_present(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/network/interfaces.d", "etc/netplan", "etc/sysconfig/network-scripts")
    (root / "etc/network/interfaces").write_text("auto eth0\niface eth0 inet dhcp\n")

    result = sandbox["run"](addresses="10.10.10.90/24", nm_connection="System eth0",
                            tools=("ip", "nmcli", "ifup"))

    assert sandbox["persist_of"](result) == "ifupdown"
    written = (root / "etc/network/interfaces.d/pvemanager-aliases-eth0").read_text()
    assert "iface eth0:1 inet static" in written
    assert "address 10.10.10.90/24" in written
    # source-строка дописывается, раз шаблон её не содержит
    assert "source /etc/network/interfaces.d/*" in (root / "etc/network/interfaces").read_text()


def test_ifupdown_needs_ifup_present(sandbox):
    """Каталог interfaces.d без ifupdown — не наш стек, уходим в sysconfig."""
    root = sandbox["root"]
    _mkdirs(root, "etc/network/interfaces.d", "etc/sysconfig/network-scripts")
    (root / "etc/network/interfaces").write_text("auto eth0\n")

    result = sandbox["run"](addresses="10.10.10.90/24", tools=("ip",))

    assert sandbox["persist_of"](result) == "sysconfig"


def test_netplan_branch_writes_yaml(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/netplan", "etc/sysconfig/network-scripts")

    result = sandbox["run"](addresses="10.10.10.90/24 10.10.10.91/24")

    assert sandbox["persist_of"](result) == "netplan"
    written = (root / "etc/netplan/99-pvemanager-aliases.yaml").read_text()
    assert "    eth0:" in written
    assert "        - 10.10.10.90/24" in written
    assert "        - 10.10.10.91/24" in written


def test_no_known_stack_reports_none_but_still_adds_address(sandbox):
    """Адрес поднимается всегда; не закрепился — об этом говорит persist=none."""
    result = sandbox["run"](addresses="10.10.10.90/24")

    assert sandbox["persist_of"](result) == "none"
    assert "addr add 10.10.10.90/24 dev eth0" in sandbox["log"]("ip")
    assert "PVEMANAGER_OK=1" in result.stdout


# --- общие инварианты ----------------------------------------------------------

def test_state_file_tracks_managed_addresses(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24 10.10.10.91/24")

    assert (root / "var/lib/pvemanager/aliases.eth0").read_text().strip() == \
        "10.10.10.90/24 10.10.10.91/24"


def test_second_run_is_idempotent(sandbox):
    """Повтор с тем же списком не должен ни удалять, ни добавлять заново."""
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24")
    before = sandbox["log"]("ip")
    sandbox["run"](addresses="10.10.10.90/24")
    added_again = sandbox["log"]("ip")[len(before):]

    assert "addr del" not in added_again


def test_other_interface_aliases_are_untouched(sandbox):
    root = sandbox["root"]
    scripts = root / "etc/sysconfig/network-scripts"
    _mkdirs(root, "etc/sysconfig/network-scripts")

    sandbox["run"](addresses="10.10.10.90/24", iface="eth0")
    sandbox["run"](addresses="10.10.10.91/24", iface="eth1")

    assert (scripts / "ifcfg-eth0:1").exists()
    assert (scripts / "ifcfg-eth1:1").exists()


def test_missing_iface_is_rejected(sandbox):
    result = sandbox["run"](addresses="10.10.10.90/24", iface="")

    assert result.returncode == 2
    assert "missing IFACE" in result.stdout


def test_script_is_ascii_only():
    """Скрипт уезжает в гостя через API Proxmox, который спотыкается на
    не-ASCII, и его маркер попадает в системные конфиги — держим файл в ASCII."""
    raw = SCRIPT.read_bytes()
    non_ascii = [b for b in raw if b > 127]
    assert not non_ascii, f"в скрипте {len(non_ascii)} не-ASCII байт"


# --- systemd-подстраховка ------------------------------------------------------

def test_systemd_unit_is_installed_alongside_native_stack(sandbox):
    """Proxmox переписывает сетевой конфиг гостя при каждом старте, поэтому
    адреса восстанавливает ещё и oneshot-юнит — /etc/systemd он не трогает."""
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts", "etc/systemd/system")

    result = sandbox["run"](addresses="10.10.10.90/24", tools=("ip", "systemctl"))

    assert sandbox["persist_of"](result) == "sysconfig+systemd"
    unit = (root / "etc/systemd/system/pvemanager-aliases.service").read_text()
    assert "After=network-online.target" in unit
    assert "ExecStart=/usr/local/sbin/pvemanager-aliases" in unit
    helper = root / "usr/local/sbin/pvemanager-aliases"
    assert "ip addr add" in helper.read_text()
    assert "enable pvemanager-aliases.service" in sandbox["log"]("systemctl")


def test_systemd_unit_alone_when_no_native_stack(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/systemd/system")

    result = sandbox["run"](addresses="10.10.10.90/24", tools=("ip", "systemctl"))

    assert sandbox["persist_of"](result) == "systemd"
    assert (root / "etc/systemd/system/pvemanager-aliases.service").exists()


def test_systemd_unit_removed_when_last_address_goes(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/systemd/system")

    sandbox["run"](addresses="10.10.10.90/24", tools=("ip", "systemctl"))
    result = sandbox["run"](addresses="", tools=("ip", "systemctl"))

    assert sandbox["persist_of"](result) == "none"
    assert not (root / "etc/systemd/system/pvemanager-aliases.service").exists()
    assert not (root / "usr/local/sbin/pvemanager-aliases").exists()
    assert "disable pvemanager-aliases.service" in sandbox["log"]("systemctl")


def test_systemd_unit_stays_while_another_interface_has_addresses(sandbox):
    """Опустошили eth0, но на eth1 адрес остался — юнит нужен дальше."""
    root = sandbox["root"]
    _mkdirs(root, "etc/systemd/system")

    sandbox["run"](addresses="10.10.10.90/24", iface="eth0", tools=("ip", "systemctl"))
    sandbox["run"](addresses="10.10.10.91/24", iface="eth1", tools=("ip", "systemctl"))
    sandbox["run"](addresses="", iface="eth0", tools=("ip", "systemctl"))

    assert (root / "etc/systemd/system/pvemanager-aliases.service").exists()


def test_without_systemd_persist_has_no_suffix(sandbox):
    root = sandbox["root"]
    _mkdirs(root, "etc/sysconfig/network-scripts", "etc/systemd/system")

    result = sandbox["run"](addresses="10.10.10.90/24", tools=("ip",))

    assert sandbox["persist_of"](result) == "sysconfig"
    assert not (root / "etc/systemd/system/pvemanager-aliases.service").exists()
