from typing import List, Dict, Optional
from loguru import logger


class FirewallMixin:
    """
    Datacenter-level Proxmox firewall: options, rules, security groups,
    IP sets and aliases. Все методы работают с /cluster/firewall/*.

    Геттеры возвращают списки/словари как есть, мутации — dict
    {"success": bool, "error"?: str}, по образцу SDN-миксина.
    """

    # ---------- Options ----------

    def get_cluster_firewall_options(self) -> Dict:
        """Опции датацентр-фаервола (enable, policy_in/out, log_ratelimit, …)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.cluster.firewall.options.get() or {})
        except Exception as e:
            logger.error(f"Error getting cluster firewall options: {e}")
            return {}

    def update_cluster_firewall_options(self, **opts) -> Dict:
        """Обновить опции датацентр-фаервола."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.options.put(**opts)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating cluster firewall options: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Datacenter rules ----------

    def get_cluster_firewall_rules(self) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.rules.get() or [])
        except Exception as e:
            logger.error(f"Error getting cluster firewall rules: {e}")
            return []

    def create_cluster_firewall_rule(self, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.rules.post(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error creating cluster firewall rule: {e}")
            return {"success": False, "error": str(e)}

    def update_cluster_firewall_rule(self, pos: int, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.rules(pos).put(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating cluster firewall rule {pos}: {e}")
            return {"success": False, "error": str(e)}

    def delete_cluster_firewall_rule(self, pos: int) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.rules(pos).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting cluster firewall rule {pos}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Security groups ----------

    def get_firewall_groups(self) -> List[Dict]:
        """Список security groups: [{group, comment, digest}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.groups.get() or [])
        except Exception as e:
            logger.error(f"Error getting firewall groups: {e}")
            return []

    def create_firewall_group(self, group: str, comment: Optional[str] = None) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {"group": group}
            if comment:
                params["comment"] = comment
            self.proxmox.cluster.firewall.groups.post(**params)
            return {"success": True, "group": group}
        except Exception as e:
            logger.error(f"Error creating firewall group {group}: {e}")
            return {"success": False, "error": str(e)}

    def delete_firewall_group(self, group: str) -> Dict:
        """Удалить security group целиком (должна быть пустой в PVE)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.groups(group).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting firewall group {group}: {e}")
            return {"success": False, "error": str(e)}

    def get_firewall_group_rules(self, group: str) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.groups(group).get() or [])
        except Exception as e:
            logger.error(f"Error getting rules for firewall group {group}: {e}")
            return []

    def create_firewall_group_rule(self, group: str, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.groups(group).post(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error creating rule in firewall group {group}: {e}")
            return {"success": False, "error": str(e)}

    def update_firewall_group_rule(self, group: str, pos: int, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.groups(group)(pos).put(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating rule {pos} in group {group}: {e}")
            return {"success": False, "error": str(e)}

    def delete_firewall_group_rule(self, group: str, pos: int) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.groups(group)(pos).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting rule {pos} in group {group}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- IP sets ----------

    def get_firewall_ipsets(self) -> List[Dict]:
        """Список IP set'ов: [{name, comment, digest}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.ipset.get() or [])
        except Exception as e:
            logger.error(f"Error getting firewall ipsets: {e}")
            return []

    def create_firewall_ipset(self, name: str, comment: Optional[str] = None) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {"name": name}
            if comment:
                params["comment"] = comment
            self.proxmox.cluster.firewall.ipset.post(**params)
            return {"success": True, "name": name}
        except Exception as e:
            logger.error(f"Error creating firewall ipset {name}: {e}")
            return {"success": False, "error": str(e)}

    def delete_firewall_ipset(self, name: str) -> Dict:
        """Удалить IP set целиком (должен быть пустым в PVE)."""
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.ipset(name).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting firewall ipset {name}: {e}")
            return {"success": False, "error": str(e)}

    def get_firewall_ipset_entries(self, name: str) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.ipset(name).get() or [])
        except Exception as e:
            logger.error(f"Error getting entries for ipset {name}: {e}")
            return []

    def add_firewall_ipset_entry(self, name: str, cidr: str,
                                 comment: Optional[str] = None,
                                 nomatch: bool = False) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {"cidr": cidr}
            if comment:
                params["comment"] = comment
            if nomatch:
                params["nomatch"] = 1
            self.proxmox.cluster.firewall.ipset(name).post(**params)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error adding entry {cidr} to ipset {name}: {e}")
            return {"success": False, "error": str(e)}

    def delete_firewall_ipset_entry(self, name: str, cidr: str) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.ipset(name)(cidr).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting entry {cidr} from ipset {name}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Aliases ----------

    def get_firewall_aliases(self) -> List[Dict]:
        """Список алиасов: [{name, cidr, comment, ipversion}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.aliases.get() or [])
        except Exception as e:
            logger.error(f"Error getting firewall aliases: {e}")
            return []

    def create_firewall_alias(self, name: str, cidr: str,
                              comment: Optional[str] = None) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {"name": name, "cidr": cidr}
            if comment:
                params["comment"] = comment
            self.proxmox.cluster.firewall.aliases.post(**params)
            return {"success": True, "name": name}
        except Exception as e:
            logger.error(f"Error creating firewall alias {name}: {e}")
            return {"success": False, "error": str(e)}

    def update_firewall_alias(self, name: str, cidr: str,
                              comment: Optional[str] = None,
                              rename: Optional[str] = None) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params = {"cidr": cidr}
            if comment is not None:
                params["comment"] = comment
            if rename:
                params["rename"] = rename
            self.proxmox.cluster.firewall.aliases(name).put(**params)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating firewall alias {name}: {e}")
            return {"success": False, "error": str(e)}

    def delete_firewall_alias(self, name: str) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.cluster.firewall.aliases(name).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting firewall alias {name}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Node-level: options ----------

    def get_node_firewall_options(self, node: str) -> Dict:
        """Опции фаервола ноды (enable, log_level_in/out, nosmurfs, …)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self.proxmox.nodes(node).firewall.options.get() or {})
        except Exception as e:
            logger.error(f"Error getting node {node} firewall options: {e}")
            return {}

    def update_node_firewall_options(self, node: str, **opts) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).firewall.options.put(**opts)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating node {node} firewall options: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Node-level: rules ----------

    def get_node_firewall_rules(self, node: str) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).firewall.rules.get() or [])
        except Exception as e:
            logger.error(f"Error getting node {node} firewall rules: {e}")
            return []

    def create_node_firewall_rule(self, node: str, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).firewall.rules.post(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error creating node {node} firewall rule: {e}")
            return {"success": False, "error": str(e)}

    def update_node_firewall_rule(self, node: str, pos: int, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).firewall.rules(pos).put(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating node {node} firewall rule {pos}: {e}")
            return {"success": False, "error": str(e)}

    def delete_node_firewall_rule(self, node: str, pos: int) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.nodes(node).firewall.rules(pos).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting node {node} firewall rule {pos}: {e}")
            return {"success": False, "error": str(e)}

    def get_node_firewall_log(self, node: str, limit: int = 100, start: int = 0) -> List[Dict]:
        """Строки firewall-лога ноды: [{n, t}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.nodes(node).firewall.log.get(limit=limit, start=start) or [])
        except Exception as e:
            logger.error(f"Error getting node {node} firewall log: {e}")
            return []

    # ---------- Guest-level (VM/LXC) ----------

    def _guest_fw(self, node: str, vm_type: str, vmid: int):
        """Ресурс /nodes/{node}/{qemu|lxc}/{vmid}/firewall для proxmoxer."""
        kind = "qemu" if vm_type in ("vm", "qemu") else "lxc"
        return self.proxmox.nodes(node)(kind)(vmid).firewall

    def get_guest_firewall_options(self, node: str, vm_type: str, vmid: int) -> Dict:
        """Опции фаервола VM/LXC (enable, dhcp, macfilter, ipfilter, policy_in/out, …)."""
        if not self.proxmox:
            return {}
        try:
            return dict(self._guest_fw(node, vm_type, vmid).options.get() or {})
        except Exception as e:
            logger.error(f"Error getting guest {vmid} firewall options: {e}")
            return {}

    def update_guest_firewall_options(self, node: str, vm_type: str, vmid: int, **opts) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self._guest_fw(node, vm_type, vmid).options.put(**opts)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating guest {vmid} firewall options: {e}")
            return {"success": False, "error": str(e)}

    def get_guest_firewall_rules(self, node: str, vm_type: str, vmid: int) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self._guest_fw(node, vm_type, vmid).rules.get() or [])
        except Exception as e:
            logger.error(f"Error getting guest {vmid} firewall rules: {e}")
            return []

    def create_guest_firewall_rule(self, node: str, vm_type: str, vmid: int, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self._guest_fw(node, vm_type, vmid).rules.post(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error creating guest {vmid} firewall rule: {e}")
            return {"success": False, "error": str(e)}

    def update_guest_firewall_rule(self, node: str, vm_type: str, vmid: int, pos: int, **rule) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self._guest_fw(node, vm_type, vmid).rules(pos).put(**rule)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating guest {vmid} firewall rule {pos}: {e}")
            return {"success": False, "error": str(e)}

    def delete_guest_firewall_rule(self, node: str, vm_type: str, vmid: int, pos: int) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self._guest_fw(node, vm_type, vmid).rules(pos).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting guest {vmid} firewall rule {pos}: {e}")
            return {"success": False, "error": str(e)}

    def get_guest_firewall_log(self, node: str, vm_type: str, vmid: int,
                               limit: int = 100, start: int = 0) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self._guest_fw(node, vm_type, vmid).log.get(limit=limit, start=start) or [])
        except Exception as e:
            logger.error(f"Error getting guest {vmid} firewall log: {e}")
            return []

    # ---------- Macros (read-only, для подсказок при создании правил) ----------

    def get_firewall_macros(self) -> List[Dict]:
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.cluster.firewall.macros.get() or [])
        except Exception as e:
            logger.error(f"Error getting firewall macros: {e}")
            return []
