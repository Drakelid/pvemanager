import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { IPAMNetwork, IPAMPool, IPAMAllocation } from '@/types';

export const ipamKeys = {
  networks: ['ipam-networks'] as const,
  network: (id: number) => ['ipam-network', id] as const,
  networkStats: (id: number) => ['ipam-network-stats', id] as const,
  ipMap: (id: number) => ['ipam-ip-map', id] as const,
  pools: (networkId?: number) => ['ipam-pools', networkId] as const,
  allocations: (params?: Record<string, unknown>) => ['ipam-allocations', params] as const,
  history: (params?: Record<string, unknown>) => ['ipam-history', params] as const,
  summary: ['ipam-summary'] as const,
  conflicts: ['ipam-conflicts'] as const,
};

export function useIPAMNetworks() {
  return useQuery({
    queryKey: ipamKeys.networks,
    queryFn: () => apiClient.get<IPAMNetwork[]>('/ipam/api/networks'),
  });
}

export function useIPAMNetwork(id: number) {
  return useQuery({
    queryKey: ipamKeys.network(id),
    queryFn: () => apiClient.get<IPAMNetwork>(`/ipam/api/networks/${id}`),
    enabled: id > 0,
  });
}

export function useIPAMNetworkStats(id: number) {
  return useQuery({
    queryKey: ipamKeys.networkStats(id),
    queryFn: () => apiClient.get<{ total_ips: number; allocated_ips: number; reserved_ips: number; available_ips: number; utilization_percent: number }>(`/ipam/api/networks/${id}/stats`),
    enabled: id > 0,
  });
}

export function useIPAMIPMap(id: number) {
  return useQuery({
    queryKey: ipamKeys.ipMap(id),
    queryFn: () => apiClient.get<{ network_id: number; ip_map: unknown[] }>(`/ipam/api/networks/${id}/ip-map`),
    enabled: id > 0,
  });
}

export function useIPAMPools(networkId?: number) {
  const qs = networkId ? `?network_id=${networkId}` : '';
  return useQuery({
    queryKey: ipamKeys.pools(networkId),
    queryFn: () => apiClient.get<IPAMPool[]>(`/ipam/api/pools${qs}`),
  });
}

export function useIPAMAllocations(params?: { network_id?: number; pool_id?: number; status?: string; search?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.network_id) qs.set('network_id', String(params.network_id));
  if (params?.pool_id) qs.set('pool_id', String(params.pool_id));
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return useQuery({
    queryKey: ipamKeys.allocations(params),
    queryFn: () => apiClient.get<IPAMAllocation[]>(`/ipam/api/allocations?${qs}`),
  });
}

export function useIPAMHistory(params?: { network_id?: number; ip_address?: string; action?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.network_id) qs.set('network_id', String(params.network_id));
  if (params?.ip_address) qs.set('ip_address', params.ip_address);
  if (params?.action) qs.set('action', params.action);
  if (params?.limit) qs.set('limit', String(params.limit));
  return useQuery({
    queryKey: ipamKeys.history(params),
    queryFn: () => apiClient.get<any[]>(`/ipam/api/history?${qs}`),
  });
}

export function useIPAMSummary() {
  return useQuery({
    queryKey: ipamKeys.summary,
    queryFn: () => apiClient.get<Record<string, unknown>>('/ipam/api/summary'),
  });
}

export function useCreateNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IPAMNetwork>) => apiClient.post<IPAMNetwork>('/ipam/api/networks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ipamKeys.networks }),
  });
}

export function useUpdateNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<IPAMNetwork> & { id: number }) =>
      apiClient.put<IPAMNetwork>(`/ipam/api/networks/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ipam-network'] });
      qc.invalidateQueries({ queryKey: ipamKeys.networks });
    },
  });
}

export function useDeleteNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/ipam/api/networks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ipamKeys.networks }),
  });
}

export function useCreateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IPAMAllocation>) => apiClient.post<IPAMAllocation>('/ipam/api/allocations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ipam-allocations'] }),
  });
}

export function useDeleteAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/ipam/api/allocations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ipam-allocations'] }),
  });
}
