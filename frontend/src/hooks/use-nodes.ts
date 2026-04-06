import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ProxmoxServer, ProxmoxNode } from '@/types';

export const nodeKeys = {
  servers: ['servers'] as const,
  server: (id: number) => ['servers', id] as const,
  nodes: (serverId: number) => ['nodes', serverId] as const,
  nodeStatus: (serverId: number, node: string) => ['node-status', serverId, node] as const,
  nodeRrd: (serverId: number, node: string, tf: string) => ['node-rrd', serverId, node, tf] as const,
  clusterInfo: (serverId: number) => ['cluster-info', serverId] as const,
  topology: ['cluster-topology'] as const,
  storages: (serverId: number, node: string) => ['storages', serverId, node] as const,
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
    queryFn: () => apiClient.get<unknown[]>(`/proxmox/api/${serverId}/storages?node=${node}`),
    enabled: serverId > 0 && !!node,
  });
}
