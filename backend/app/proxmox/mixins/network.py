from typing import List, Dict, Optional, Union, Any
import time
import urllib3
from loguru import logger

class NetworkMixin:
        def get_sdn_vnets(self) -> List[Dict]:
            """
            Get all SDN VNets (Virtual Networks).
            
            Returns:
                List of VNets with vnet name, zone, alias, etc.
            """
            if not self.proxmox:
                return []
            
            try:
                vnets = self.proxmox.cluster.sdn.vnets.get()
                return vnets if isinstance(vnets, list) else []
            except Exception as e:
                logger.error(f"Error getting SDN vnets: {e}")
                return []

        def get_sdn_zones(self) -> List[Dict]:
            """
            Get all SDN zones.
            
            Returns:
                List of SDN zones with type, zone name, pending status
            """
            if not self.proxmox:
                return []
            
            try:
                zones = self.proxmox.cluster.sdn.zones.get()
                return zones if isinstance(zones, list) else []
            except Exception as e:
                logger.error(f"Error getting SDN zones: {e}")
                return []

        def get_sdn_dns(self) -> List[Dict]:
            """
            Get SDN DNS server entries (Datacenter -> SDN -> Options -> DNS).

            Returns:
                List of DNS entries with dns (id), type, url, etc.
            """
            if not self.proxmox:
                return []

            try:
                entries = self.proxmox.cluster.sdn.dns.get()
                return entries if isinstance(entries, list) else []
            except Exception as e:
                logger.error(f"Error getting SDN DNS entries: {e}")
                return []

        def create_sdn_zone(self, zone: str, zone_type: str = "simple", **kwargs) -> Dict:
            """
            Create a new SDN zone.
            
            Args:
                zone: Zone name (alphanumeric, max 8 chars)
                zone_type: Type of zone (simple, vlan, qinq, vxlan, evpn)
                **kwargs: Additional zone options (mtu, dns, reversedns, etc.)
            
            Returns:
                Result dict with success status
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {
                    "zone": zone,
                    "type": zone_type,
                }
                params.update(kwargs)
                
                self.proxmox.cluster.sdn.zones.post(**params)
                logger.info(f"Created SDN zone: {zone} (type={zone_type})")
                return {"success": True, "zone": zone}
            except Exception as e:
                logger.error(f"Error creating SDN zone {zone}: {e}")
                return {"success": False, "error": str(e)}

        def create_sdn_vnet(self, vnet: str, zone: str, tag: int = None, 
                            alias: str = None, vlanaware: bool = False) -> Dict:
            """
            Create a new SDN VNet.
            
            Args:
                vnet: VNet name (alphanumeric, max 8 chars)
                zone: Zone where to create the VNet
                tag: VLAN/VNI tag (optional)
                alias: Human-readable alias
                vlanaware: Enable VLAN-aware bridge
            
            Returns:
                Result dict with success status
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {
                    "vnet": vnet,
                    "zone": zone,
                }
                if tag is not None:
                    params["tag"] = tag
                if alias:
                    params["alias"] = alias
                if vlanaware:
                    params["vlanaware"] = 1
                
                self.proxmox.cluster.sdn.vnets.post(**params)
                logger.info(f"Created SDN vnet: {vnet} in zone {zone}")
                return {"success": True, "vnet": vnet}
            except Exception as e:
                logger.error(f"Error creating SDN vnet {vnet}: {e}")
                return {"success": False, "error": str(e)}

        def create_sdn_subnet(self, vnet: str, subnet: str, gateway: str = None,
                              snat: bool = False, dnszoneprefix: str = None) -> Dict:
            """
            Create a subnet in a VNet.
            
            Args:
                vnet: VNet name
                subnet: Subnet CIDR (e.g., "10.0.0.0/24")
                gateway: Gateway IP for the subnet
                snat: Enable SNAT for outgoing traffic
                dnszoneprefix: DNS zone prefix
            
            Returns:
                Result dict with success status
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {
                    "subnet": subnet,
                    "type": "subnet",
                }
                if gateway:
                    params["gateway"] = gateway
                if snat:
                    params["snat"] = 1
                if dnszoneprefix:
                    params["dnszoneprefix"] = dnszoneprefix
                
                self.proxmox.cluster.sdn.vnets(vnet).subnets.post(**params)
                logger.info(f"Created subnet {subnet} in vnet {vnet}")
                return {"success": True, "subnet": subnet}
            except Exception as e:
                logger.error(f"Error creating subnet {subnet} in vnet {vnet}: {e}")
                return {"success": False, "error": str(e)}

