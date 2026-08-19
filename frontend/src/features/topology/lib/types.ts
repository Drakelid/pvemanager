/** Shapes returned by GET /proxmox/api/network/topology (backend schemas.py). */

export interface TopologyNic {
  key: string;
  model?: string | null;
  mac?: string | null;
  bridge?: string | null;
  vlan_tag?: number | null;
  trunks: number[];
  firewall: boolean;
  link_down: boolean;
  name?: string | null;
  ip?: string | null;
  gw?: string | null;
  rate?: number | null;
  mtu?: number | null;
}

export interface TopologyBridge {
  name: string;
  type?: string | null;
  cidr?: string | null;
  vlan_aware: boolean;
  ports?: string | null;
  active: boolean;
  zone?: string | null;
  ipam_network_id?: number | null;
  ipam_cidr?: string | null;
  ipam_name?: string | null;
}

export interface TopologyGuest {
  id: string;
  server_id: number;
  node: string;
  vmid: number;
  type: 'qemu' | 'lxc' | string;
  name: string;
  status: string;
  is_template: boolean;
  lock?: string | null;
  cpu?: number | null;
  cores?: number | null;
  mem?: number | null;
  maxmem?: number | null;
  disk?: number | null;
  maxdisk?: number | null;
  uptime?: number | null;
  tags: string[];
  owner_id?: number | null;
  owner_username?: string | null;
  ip?: string | null;
  nics: TopologyNic[];
}

export interface TopologyNode {
  id: string;
  server_id: number;
  server_name: string;
  node: string;
  status: string;
  /** Rebuilt from the local VM cache because the connection is unreachable. */
  stale: boolean;
  cpu?: number | null;
  maxcpu?: number | null;
  mem?: number | null;
  maxmem?: number | null;
  uptime?: number | null;
  bridges: TopologyBridge[];
  guests: TopologyGuest[];
}

export interface TopologyCluster {
  id: string;
  name: string;
  kind: 'cluster' | 'standalone' | string;
  server_ids: number[];
  online: boolean;
  nodes: TopologyNode[];
}

export interface TopologyWarning {
  server_id?: number | null;
  server_name?: string | null;
  code: string;
  message: string;
}

export interface TopologyPanelSummary {
  name: string;
  cluster_count: number;
  node_count: number;
  guest_count: number;
}

export interface NetworkTopology {
  generated_at: string;
  panel: TopologyPanelSummary;
  clusters: TopologyCluster[];
  warnings: TopologyWarning[];
}

export type VmStatusFilter = 'all' | 'running' | 'stopped';

/** Grouping mode. Only `hierarchy` ships today; VLAN/tag views reuse this switch. */
export type GroupMode = 'hierarchy';

export interface TopologyFilters {
  serverId: number | 'all';
  vmStatus: VmStatusFilter;
  /** Collapse a node's guests into one badge above this count. 0 disables it. */
  groupThreshold: number;
  groupMode: GroupMode;
}

/** Data carried by each React Flow node type. */
export interface PanelNodeData extends Record<string, unknown> {
  panel: TopologyPanelSummary;
}
export interface ClusterNodeData extends Record<string, unknown> {
  cluster: TopologyCluster;
  nodeCount: number;
  guestCount: number;
}
export interface PveNodeData extends Record<string, unknown> {
  node: TopologyNode;
  guestCount: number;
}
export interface GuestNodeData extends Record<string, unknown> {
  guest: TopologyGuest;
}
export interface GuestGroupNodeData extends Record<string, unknown> {
  parentId: string;
  total: number;
  running: number;
  stopped: number;
}
