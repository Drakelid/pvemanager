// ==================== User Types ====================

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
  role_id?: number | null;
  role_name?: string;
  is_locked?: boolean;
  failed_login_attempts?: number;
  locked_until?: string | null;
  require_password_change?: boolean;
  two_factor_enabled?: boolean;
  // Map of "resource:action" -> granted. Admins receive every permission.
  permissions?: Record<string, boolean>;
}

export interface LoginRequest {
  username: string;
  password: string;
  code?: string;
}

export interface AuthResponse {
  access_token?: string;
  token_type: string;
  session_id?: string;
  two_factor_required?: boolean;
}

// ==================== Proxmox Server Types ====================

export interface ServerWorkspaceBrief {
  id: number;
  name: string;
  color?: string;
}

export interface ProxmoxServer {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  port: number;
  api_user: string;
  verify_ssl: boolean;
  cluster_name?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  last_check?: string;
  is_online?: boolean;
  last_error?: string;
  workspaces?: ServerWorkspaceBrief[];
}

export interface ProxmoxServerCreate {
  name: string;
  hostname: string;
  ip_address: string;
  port?: number;
  api_user?: string;
  api_token_name?: string;
  api_token_value?: string;
  use_password?: boolean;
  password?: string;
  verify_ssl?: boolean;
  description?: string;
}

// ==================== VM / Container Types ====================

export interface DiskInfo {
  name: string;
  mountpoint: string;
  used: number;
  total: number;
}

export type VMType = 'qemu' | 'lxc';
export type VMStatus = 'running' | 'stopped' | 'paused' | 'suspended' | 'unknown' | 'creating';

export interface VMInstance {
  vmid: number;
  name?: string;
  status: VMStatus;
  type: VMType;
  node: string;
  server_id?: number;
  server_name?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
  diskread_rate?: number;
  diskwrite_rate?: number;
  netin_rate?: number;
  netout_rate?: number;
  ip_address?: string;
  tags?: string;
  template?: boolean;
  description?: string;
  /** Configured vCPU count */
  cores?: number;
  /** Configured RAM in MB */
  memory?: number;
  /** Configured disk size in GB */
  disk_size?: number;
  /** OS name / template label */
  os?: string;
  os_template?: string;
  /** IPAM allocated_by string (legacy owner) */
  owner?: string;
  /** Actual owner user (VMInstance.owner_id → User) */
  owner_user?: { username: string; email: string; full_name?: string | null } | null;
  /** PVE lock state (e.g. 'clone', 'create', 'migrate') while an operation runs */
  lock?: string;
  /** Ghost row marker — present only for in-progress deploy tasks */
  _deployTaskId?: number;
}

export interface VMConfig {
  cores?: number;
  /** QEMU socket count; total vCPU = sockets * cores (defaults to 1) */
  sockets?: number;
  /** QEMU hotplugged vCPU count, when fewer than sockets * cores are online */
  vcpus?: number;
  memory?: number;
  disk?: string;
  name?: string;
  ostype?: string;
  net0?: string;
  boot?: string;
  agent?: number;
  onboot?: number;
  startup?: string;
  protection?: number;
  [key: string]: unknown;
}

export interface VMDeployRequest {
  template_id: number;
  name: string;
  vmid?: number;
  target_node?: string;
  cores?: number;
  memory?: number;
  disk?: number;
  target_storage?: string;
  start_after_create?: boolean;
  onboot?: boolean;
  enable_ha?: boolean;
  network_bridge?: string;
  ip_address?: string;
  gateway?: string;
  ipam_network_id?: number;
  ipam_pool_id?: number;
  cloud_init_user?: string;
  cloud_init_password?: string;
  ssh_keys?: string;
  ssh_key_ids?: number[];
  owner_id?: number;
}

// ==================== LXC CT Template Types ====================

export interface LXCTemplate {
  volid: string;
  storage: string;
  node: string;
  name: string;
  size: number;
}

export interface LXCDeployRequest {
  server_id: number;
  ostemplate: string;
  node?: string;
  name: string;
  vmid?: number;
  cores: number;
  memory: number;
  swap: number;
  disk: number;
  storage: string;
  bridge: string;
  ip_address?: string;
  gateway?: string;
  ipam_network_id?: number;
  ipam_pool_id?: number;
  password?: string;
  ssh_keys?: string;
  ssh_key_ids?: number[];
  owner_id?: number;
  nameserver?: string;
  searchdomain?: string;
  unprivileged: boolean;
  start_after_create: boolean;
  onboot: boolean;
}

// ==================== Node Types ====================

export interface ProxmoxNode {
  node: string;
  status: 'online' | 'offline';
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  server_id: number;
  server_name?: string;
  vm_count?: number;
  ct_count?: number;
}

export interface NodeNetworkInterface {
  iface: string;
  type: string; // bridge, bond, eth, vlan, alias, OVSBridge, ...
  method?: string; // static, manual, dhcp
  method6?: string;
  address?: string;
  netmask?: string;
  cidr?: string;
  gateway?: string;
  bridge_ports?: string;
  bond_slaves?: string;
  bond_mode?: string;
  'vlan-id'?: number | string;
  'vlan-raw-device'?: string;
  autostart?: number;
  active?: number;
  exists?: number;
  comments?: string;
  // Enriched server-side with IPAM linkage when a matching network exists
  ipam_network_id?: number;
  ipam_cidr?: string;
  ipam_name?: string;
}

export interface HAResource {
  sid: string; // "vm:100" or "ct:101"
  type?: string; // "vm" | "ct"
  state?: string; // started, stopped, disabled, ignored
  group?: string;
  max_restart?: number;
  max_relocate?: number;
  comment?: string;
  digest?: string;
}

export interface HAGroup {
  group: string;
  nodes?: string;
  nofailback?: number;
  restricted?: number;
  comment?: string;
}

export interface HAStatus {
  server_id: number;
  is_cluster: boolean;
  ha_enabled: boolean;
  resources: HAResource[];
  groups: HAGroup[];
}

export interface SDNZone {
  zone: string;
  type: string; // simple, vlan, qinq, vxlan, evpn
  pending?: string | number;
  state?: string;
  mtu?: number;
  dns?: string;
  ipam?: string;
  nodes?: string;
  [k: string]: unknown;
}

export interface SDNVNet {
  vnet: string;
  zone: string;
  tag?: number;
  alias?: string;
  vlanaware?: number;
  type?: string;
  pending?: string | number;
  [k: string]: unknown;
}

export interface SDNSubnet {
  subnet: string; // PVE id, e.g. "zone-10.0.0.0-24"
  cidr?: string;
  gateway?: string;
  snat?: number;
  vnet?: string;
  [k: string]: unknown;
}

export interface SDNPendingChange {
  type: string;
  id: string;
  pending: unknown;
}

export interface SDNStatus {
  server_id: number;
  sdn_available: boolean;
  pending_changes: boolean;
  pending: SDNPendingChange[];
  error?: string;
}

// ==================== IPAM Types ====================

export interface IPAMNetwork {
  id: number;
  name: string;
  description?: string;
  network: string;
  gateway?: string;
  vlan_id?: number;
  dns_primary?: string;
  dns_secondary?: string;
  dns_domain?: string;
  proxmox_server_id?: number;
  proxmox_node?: string;
  proxmox_bridge?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_ips?: number;
  used_ips?: number;
  available_ips?: number;
  utilization_percent?: number;
  server_name?: string;
}

export interface IPAMPool {
  id: number;
  network_id: number;
  name: string;
  pool_type: 'static' | 'dhcp' | 'reserved';
  range_start: string;
  range_end: string;
  auto_assign: boolean;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_ips?: number;
  used_ips?: number;
  available_ips?: number;
}

export interface IPAMAllocation {
  id: number;
  network_id: number;
  pool_id?: number;
  ip_address: string;
  mac_address?: string;
  resource_type?: string;
  resource_id?: number;
  resource_name?: string;
  network_name?: string;
  proxmox_server_id?: number;
  proxmox_vmid?: number;
  proxmox_node?: string;
  status: 'allocated' | 'reserved' | 'available' | 'conflict';
  description?: string;
  hostname?: string;
  fqdn?: string;
  allocation_type?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ==================== Template Types ====================

export interface OSTemplateGroup {
  id: number;
  name: string;
  icon?: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OSTemplate {
  id: number;
  group_id: number;
  server_id: number;
  name: string;
  vmid: number | null;
  vm_type: 'qemu' | 'lxc';
  volid?: string | null;
  node: string;
  default_cores: number;
  default_memory: number;
  default_disk: number;
  min_cores: number;
  min_memory: number;
  min_disk: number;
  description?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  group_name?: string;
  group_icon?: string;
  server_name?: string;
}

// ==================== Image Catalog Types ====================

export type ImageKind = 'qcow2' | 'vztmpl';
export type ImageArch = 'amd64' | 'arm64';

export interface CatalogImage {
  id: string;
  source: 'builtin' | 'mirror';
  kind: ImageKind;
  os?: string;
  version?: string;
  arch: ImageArch | string;
  name: string;
  url?: string | null;
  template?: string | null;
  filename?: string;
  checksum?: string | null;
  checksum_algorithm?: string | null;
  icon?: string;
  description?: string;
}

export interface ImageCatalogResponse {
  builtin: CatalogImage[];
  mirrors: CatalogImage[];
}

export interface ImageMirrorItem {
  id: string;          // "mirror-<n>"
  mirror_id: number;
  source: 'mirror';
  kind: ImageKind;
  os?: string | null;
  version?: string | null;
  arch: string;
  name: string;
  url?: string | null;
  template?: string | null;
  checksum?: string | null;
  checksum_algorithm?: string | null;
  description?: string | null;
  enabled: boolean;
}

export interface ImageMirrorInput {
  name: string;
  kind: ImageKind;
  os?: string;
  version?: string;
  arch: string;
  url?: string;
  template?: string;
  checksum?: string;
  checksum_algorithm?: string;
  description?: string;
  enabled: boolean;
}

export interface ImageTargetStorage {
  storage: string;
  type: string;
  content: string;
  avail?: number;
  total?: number;
  active?: number;
}

// ==================== Workspace Types ====================

export interface Workspace {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  server_count?: number;
  user_count?: number;
  servers?: WorkspaceServer[];
  users?: WorkspaceUser[];
}

export interface WorkspaceServer {
  server_id: number;
  server_name: string;
}

export interface WorkspaceUser {
  user_id: number;
  username: string;
}

// ==================== Notification Types ====================

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  is_read: boolean;
  category?: string;
  resource_type?: string;
  resource_id?: string;
  created_at: string;
}

// ==================== Log Types ====================

export interface AuditLog {
  id: number;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  user_id?: number;
  username?: string;
  ip_address?: string;
  details?: Record<string, unknown>;
}

// ==================== Task Types ====================

export interface ProxmoxTask {
  upid: string;
  node: string;
  type: string;
  status?: string;
  exitstatus?: string;
  starttime: number;
  endtime?: number;
  user: string;
  server_id?: number;
  server_name?: string;
}

// ==================== Backup Types ====================

export interface BackupJob {
  id: number;
  server_id: number;
  vmid?: number;
  schedule?: string;
  storage: string;
  mode?: string;
  compress?: string;
  enabled: boolean;
  created_at: string;
}

// ==================== Snapshot Types ====================

export interface Snapshot {
  name: string;
  description?: string;
  snaptime?: number;
  parent?: string;
  vmstate?: boolean;
}

// ==================== Dashboard Types ====================

export interface DashboardStats {
  nodes_total: number;
  nodes_online: number;
  vms_total: number;
  vms_running: number;
  containers_total: number;
  containers_running: number;
  alerts_count: number;
}

export interface ResourceMetrics {
  cpu_percent: number;
  memory_used: number;
  memory_total: number;
  memory_percent: number;
  storage_used: number;
  storage_total: number;
  storage_percent: number;
}

// ==================== Common Types ====================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface ApiError {
  // Usually a string (HTTPException), but FastAPI 422 validation errors return
  // an array of { loc, msg, type } objects.
  detail: string | unknown[] | Record<string, unknown>;
  status_code?: number;
}
