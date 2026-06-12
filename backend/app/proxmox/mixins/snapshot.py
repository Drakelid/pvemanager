from typing import List, Dict, Optional, Union, Any
import time
import urllib3
from loguru import logger

class SnapshotMixin:
        def get_vm_snapshots(self, node: str, vmid: int) -> List[Dict]:
            """
            Get all snapshots for a VM.
            
            Args:
                node: Node name
                vmid: VM ID
            
            Returns:
                List of snapshots
            """
            if not self.proxmox:
                return []
            
            try:
                snapshots = self.proxmox.nodes(node).qemu(vmid).snapshot.get()
                return snapshots if isinstance(snapshots, list) else []
            except Exception as e:
                logger.error(f"Error getting VM {vmid} snapshots: {e}")
                return []

        def create_vm_snapshot(self, node: str, vmid: int, snapname: str, 
                               description: str = None, vmstate: bool = False) -> Dict:
            """
            Create a snapshot of a VM.
            
            Args:
                node: Node name
                vmid: VM ID
                snapname: Snapshot name (alphanumeric, max 40 chars)
                description: Optional description
                vmstate: Include VM RAM state (requires more storage)
            
            Returns:
                Result dict with UPID or error
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {"snapname": snapname}
                if description:
                    params["description"] = description
                if vmstate:
                    params["vmstate"] = 1
                
                upid = self.proxmox.nodes(node).qemu(vmid).snapshot.post(**params)
                logger.info(f"Creating snapshot {snapname} for VM {vmid}")
                return {"success": True, "upid": upid, "snapname": snapname}
            except Exception as e:
                logger.error(f"Error creating VM {vmid} snapshot: {e}")
                return {"success": False, "error": str(e)}

        def rollback_vm_snapshot(self, node: str, vmid: int, snapname: str, start: bool = False) -> Dict:
            """
            Rollback a VM to a snapshot.
            
            Args:
                node: Node name
                vmid: VM ID
                snapname: Snapshot name to rollback to
                start: Start VM after rollback
            
            Returns:
                Result dict with UPID or error
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {}
                if start:
                    params["start"] = 1
                
                upid = self.proxmox.nodes(node).qemu(vmid).snapshot(snapname).rollback.post(**params)
                logger.info(f"Rolling back VM {vmid} to snapshot {snapname}")
                return {"success": True, "upid": upid}
            except Exception as e:
                logger.error(f"Error rolling back VM {vmid} to snapshot {snapname}: {e}")
                return {"success": False, "error": str(e)}

        def delete_vm_snapshot(self, node: str, vmid: int, snapname: str, force: bool = False) -> Dict:
            """
            Delete a VM snapshot.
            
            Args:
                node: Node name
                vmid: VM ID
                snapname: Snapshot name to delete
                force: Force deletion even if snapshot is locked
            
            Returns:
                Result dict with success status
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {}
                if force:
                    params["force"] = 1
                
                upid = self.proxmox.nodes(node).qemu(vmid).snapshot(snapname).delete(**params)
                logger.info(f"Deleting snapshot {snapname} for VM {vmid}")
                return {"success": True, "upid": upid}
            except Exception as e:
                logger.error(f"Error deleting VM {vmid} snapshot {snapname}: {e}")
                return {"success": False, "error": str(e)}

        def get_container_snapshots(self, node: str, vmid: int) -> List[Dict]:
            """
            Get all snapshots for a container.
            
            Args:
                node: Node name
                vmid: Container ID
            
            Returns:
                List of snapshots
            """
            if not self.proxmox:
                return []
            
            try:
                snapshots = self.proxmox.nodes(node).lxc(vmid).snapshot.get()
                return snapshots if isinstance(snapshots, list) else []
            except Exception as e:
                logger.error(f"Error getting container {vmid} snapshots: {e}")
                return []

        def create_container_snapshot(self, node: str, vmid: int, snapname: str, 
                                       description: str = None) -> Dict:
            """
            Create a snapshot of a container.
            
            Args:
                node: Node name
                vmid: Container ID
                snapname: Snapshot name
                description: Optional description
            
            Returns:
                Result dict with UPID or error
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {"snapname": snapname}
                if description:
                    params["description"] = description
                
                upid = self.proxmox.nodes(node).lxc(vmid).snapshot.post(**params)
                logger.info(f"Creating snapshot {snapname} for container {vmid}")
                return {"success": True, "upid": upid, "snapname": snapname}
            except Exception as e:
                logger.error(f"Error creating container {vmid} snapshot: {e}")
                return {"success": False, "error": str(e)}

        def rollback_container_snapshot(self, node: str, vmid: int, snapname: str, start: bool = False) -> Dict:
            """
            Rollback a container to a snapshot.
            
            Args:
                node: Node name
                vmid: Container ID
                snapname: Snapshot name to rollback to
                start: Start container after rollback
            
            Returns:
                Result dict with UPID or error
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {}
                if start:
                    params["start"] = 1
                
                upid = self.proxmox.nodes(node).lxc(vmid).snapshot(snapname).rollback.post(**params)
                logger.info(f"Rolling back container {vmid} to snapshot {snapname}")
                return {"success": True, "upid": upid}
            except Exception as e:
                logger.error(f"Error rolling back container {vmid} to snapshot {snapname}: {e}")
                return {"success": False, "error": str(e)}

        def delete_container_snapshot(self, node: str, vmid: int, snapname: str, force: bool = False) -> Dict:
            """
            Delete a container snapshot.
            
            Args:
                node: Node name
                vmid: Container ID
                snapname: Snapshot name to delete
                force: Force deletion
            
            Returns:
                Result dict with success status
            """
            if not self.proxmox:
                return {"success": False, "error": "Not connected"}
            
            try:
                params = {}
                if force:
                    params["force"] = 1
                
                upid = self.proxmox.nodes(node).lxc(vmid).snapshot(snapname).delete(**params)
                logger.info(f"Deleting snapshot {snapname} for container {vmid}")
                return {"success": True, "upid": upid}
            except Exception as e:
                logger.error(f"Error deleting container {vmid} snapshot {snapname}: {e}")
                return {"success": False, "error": str(e)}

