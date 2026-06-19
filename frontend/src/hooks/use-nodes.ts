import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ProxmoxServer, ProxmoxNode, ProxmoxServerCreate, NodeNetworkInterface } from '@/types';
import { vmKeys } from './use-instances';

export const nodeKeys = {
  servers: ['servers'] as const,
  server: (id: number) => ['servers', id] as const,
  nodes: (serverId: number) => ['nodes', serverId] as const,
  nodeStatus: (serverId: number, node: string) => ['node-status', serverId, node] as const,
  nodeRrd: (serverId: number, node: string, tf: string) => ['node-rrd', serverId, node, tf] as const,
  clusterInfo: (serverId: number) => ['cluster-info', serverId] as const,
  topology: ['cluster-topology'] as const,
  storages: (serverId: number, node: string) => ['storages', serverId, node] as const,
  networks: (serverId: number, node: string) => ['node-networks', serverId, node] as const,
};

export function useServers() {
  return useQuery({
    queryKey: nodeKeys.servers,
    queryFn: () => apiClient.get<ProxmoxServer[]>('/proxmox/api/servers'),
    refetchInterval: 30000,
  });
}

export function useServer(serverId: number) {
  return useQuery({
    queryKey: nodeKeys.server(serverId),
    queryFn: () => apiClient.get<ProxmoxServer>(`/proxmox/api/servers/${serverId}`),
    enabled: serverId > 0,
  });
}

export function useNodes(serverId: number) {
  return useQuery({
    queryKey: nodeKeys.nodes(serverId),
    queryFn: () => apiClient.get<{ nodes: ProxmoxNode[]; cluster_id: string }>(`/proxmox/api/${serverId}/nodes`),
    enabled: serverId > 0,
    refetchInterval: 30000,
  });
}

export function useNodeStatus(serverId: number, node: string) {
  return useQuery({
    queryKey: nodeKeys.nodeStatus(serverId, node),
    queryFn: () => apiClient.get<Record<string, unknown>>(`/proxmox/api/${serverId}/node/status?node=${node}`),
    enabled: serverId > 0 && !!node,
    refetchInterval: 10000,
  });
}

export function useNodeRrddata(serverId: number, node: string, timeframe = 'hour') {
  return useQuery({
    queryKey: nodeKeys.nodeRrd(serverId, node, timeframe),
    queryFn: () => apiClient.get<unknown[]>(`/proxmox/api/${serverId}/node/rrddata?node=${node}&timeframe=${timeframe}`),
    enabled: serverId > 0 && !!node,
  });
}

export function useClusterTopology() {
  return useQuery({
    queryKey: nodeKeys.topology,
    queryFn: () => apiClient.get<{ clusters: Record<string, unknown[]>; standalone: unknown[] }>('/proxmox/api/cluster/topology'),
    refetchInterval: 30000,
  });
}

export function useStorages(serverId: number, node: string) {
  return useQuery({
    queryKey: nodeKeys.storages(serverId, node),
    queryFn: () => apiClient
      .get<{ storages: unknown[] } | unknown[]>(`/proxmox/api/${serverId}/storages?node=${node}`)
      .then(r => Array.isArray(r) ? r : (r as { storages: unknown[] }).storages),
    enabled: serverId > 0 && !!node,
  });
}

export function useCreateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProxmoxServerCreate) =>
      apiClient.post<ProxmoxServer>('/proxmox/api/servers', data),
    onSuccess: () => {
      // Немедленно подтягиваем список серверов, VM и топологию кластера,
      // чтобы UI показал новый сервер со статусом и его инстансами без рефреша.
      qc.invalidateQueries({ queryKey: nodeKeys.servers });
      qc.invalidateQueries({ queryKey: nodeKeys.topology });
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

export function useUpdateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<ProxmoxServerCreate>) =>
      apiClient.put<ProxmoxServer>(`/proxmox/api/servers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeKeys.servers });
      qc.invalidateQueries({ queryKey: nodeKeys.topology });
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/proxmox/api/servers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeKeys.servers });
      qc.invalidateQueries({ queryKey: nodeKeys.topology });
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

export function useTestServer() {
  return useMutation({
    mutationFn: (id: number) => apiClient.post<{ success: boolean; status?: string; message?: string }>(`/proxmox/api/servers/${id}/test`, {}),
  });
}

export function useTestServerCredentials() {
  return useMutation({
    mutationFn: (data: ProxmoxServerCreate) =>
      apiClient.post<{ success: boolean; status?: string; message?: string }>(`/proxmox/api/servers/test`, data),
  });
}

export interface ClusterInfo {
  server_id: number;
  server_name: string;
  is_cluster: boolean;
  node_count?: number;
  nodes?: string[];
  error?: string;
}

export function useClusterInfo(serverId: number) {
  return useQuery({
    queryKey: nodeKeys.clusterInfo(serverId),
    queryFn: () => apiClient.get<ClusterInfo>(`/proxmox/api/servers/${serverId}/cluster-info`),
    enabled: serverId > 0,
  });
}

// ==================== Node network interfaces ====================

export function useNodeNetworks(serverId: number, node: string) {
  return useQuery({
    queryKey: nodeKeys.networks(serverId, node),
    queryFn: () =>
      apiClient.get<{ node: string; interfaces: NodeNetworkInterface[] }>(
        `/proxmox/api/servers/${serverId}/nodes/${node}/networks`,
      ),
    enabled: serverId > 0 && !!node,
  });
}

export function useCreateNodeNetwork(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`/proxmox/api/servers/${serverId}/nodes/${node}/networks`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.networks(serverId, node) }),
  });
}

export function useUpdateNodeNetwork(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ iface, ...data }: { iface: string } & Record<string, unknown>) =>
      apiClient.put(`/proxmox/api/servers/${serverId}/nodes/${node}/networks/${iface}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.networks(serverId, node) }),
  });
}

export function useDeleteNodeNetwork(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (iface: string) =>
      apiClient.delete(`/proxmox/api/servers/${serverId}/nodes/${node}/networks/${iface}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.networks(serverId, node) }),
  });
}

export function useApplyNodeNetwork(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post(`/proxmox/api/servers/${serverId}/nodes/${node}/networks/apply`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.networks(serverId, node) }),
  });
}

export function useRevertNodeNetwork(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post(`/proxmox/api/servers/${serverId}/nodes/${node}/networks/revert`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.networks(serverId, node) }),
  });
}
