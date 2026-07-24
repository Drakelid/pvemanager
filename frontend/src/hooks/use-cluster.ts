import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { nodeKeys } from './use-nodes';
import { vmKeys } from './use-instances';

// ==================== Types ====================

export interface ClusterServerEntry {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  port: number;
  is_online: boolean;
  last_error_kind?: 'auth' | 'connection' | null;
  cluster_name: string | null;
}

export interface ClusterTopology {
  clusters: Record<string, ClusterServerEntry[]>;
  standalone: ClusterServerEntry[];
}

export interface PreJoinGuest {
  vmid: number;
  name: string;
  status: string;
  type: 'qemu' | 'lxc';
  maxdisk: number;
  mem: number;
}

export interface PreJoinStorage {
  storage: string;
  type: string;
  avail: number;
  total: number;
}

export interface PreJoinCheck {
  server_id: number;
  server_name: string;
  node_name: string;
  guests_count: number;
  guests: PreJoinGuest[];
  backup_storages: PreJoinStorage[];
  ready_for_join: boolean;
  warning: string | null;
}

export interface PrepareJoinResult {
  backed_up: number[];
  deleted: number[];
  errors: { vmid: number; phase: string; error: string }[];
  ready_for_join: boolean;
  message: string;
}

export interface ClusterActionResult {
  success: boolean;
  cluster_name?: string;
  upid?: string;
  message: string;
  confirmed?: boolean;
}

export interface ImportClusterNode {
  name: string | null;
  address: string | null;
  matched_server_id: number | null;
  matched_server_name: string | null;
  already_linked: boolean;
  linked_elsewhere: boolean;
}

export interface ImportClusterInfo {
  server_id: number;
  is_cluster: boolean;
  cluster_name: string | null;
  nodes: ImportClusterNode[];
  message?: string;
}

export interface ImportClusterResult {
  success: boolean;
  cluster_name: string;
  applied: number[];
  errors: { server_id: number; error: string }[];
  message: string;
}

// ==================== Queries ====================

export function useClusterTopology() {
  return useQuery({
    queryKey: nodeKeys.topology,
    queryFn: () => apiClient.get<ClusterTopology>('/proxmox/api/cluster/topology'),
    refetchInterval: 30000,
  });
}

// ==================== Mutations ====================

function useInvalidateCluster() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: nodeKeys.topology });
    qc.invalidateQueries({ queryKey: nodeKeys.servers });
    qc.invalidateQueries({ queryKey: vmKeys.all });
  };
}

export function useCreateCluster() {
  const invalidate = useInvalidateCluster();
  return useMutation({
    mutationFn: (body: { server_id: number; cluster_name: string; link0_ip?: string; rootpw?: string }) =>
      apiClient.post<ClusterActionResult>('/proxmox/api/cluster/create', body),
    onSuccess: () => invalidate(),
  });
}

/** On-demand pre-join inspection of a standalone node (lists guests + backup storages). */
export function usePreJoinCheck() {
  return useMutation({
    mutationFn: (serverId: number) =>
      apiClient.get<PreJoinCheck>(`/proxmox/api/cluster/${serverId}/pre-join-check`),
  });
}

/** Back up and delete all guests on a node so it can join a cluster. Long-running. */
export function usePrepareJoin() {
  return useMutation({
    mutationFn: (body: { node_server_id: number; backup_storage: string; compress?: string }) =>
      apiClient.post<PrepareJoinResult>('/proxmox/api/cluster/prepare-join', body),
  });
}

export function useJoinCluster() {
  const invalidate = useInvalidateCluster();
  return useMutation({
    mutationFn: (body: { node_server_id: number; cluster_server_id: number; rootpw: string; link0?: string; cluster_host?: string }) =>
      apiClient.post<ClusterActionResult>('/proxmox/api/cluster/join', body),
    onSuccess: () => invalidate(),
  });
}

/** On-demand detection of a real Proxmox cluster formed outside the panel, matched against known servers. */
export function useClusterImportInfo() {
  return useMutation({
    mutationFn: (serverId: number) =>
      apiClient.get<ImportClusterInfo>(`/proxmox/api/cluster/${serverId}/import-info`),
  });
}

/** Link existing panel server entries to a cluster detected via useClusterImportInfo (DB-only, no Proxmox changes). */
export function useImportCluster() {
  const invalidate = useInvalidateCluster();
  return useMutation({
    mutationFn: (body: { server_id: number; server_ids: number[] }) =>
      apiClient.post<ImportClusterResult>('/proxmox/api/cluster/import', body),
    onSuccess: () => invalidate(),
  });
}

export function useEjectNode() {
  const invalidate = useInvalidateCluster();
  return useMutation({
    mutationFn: ({ serverId, ...body }: { serverId: number; node_name: string; rootpw?: string; clear_panel_entry?: boolean; panel_only?: boolean }) =>
      apiClient.post<{ success: boolean; ejected_node: string; message: string }>(
        `/proxmox/api/cluster/${serverId}/eject-node`,
        body,
      ),
    onSuccess: () => invalidate(),
  });
}
