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

export interface IPAMIPMapEntry {
  ip_address: string;
  status: 'gateway' | 'allocated' | 'reserved' | 'available' | string;
  resource_name?: string | null;
  resource_type?: string | null;
  hostname?: string | null;
  proxmox_vmid?: number | null;
  is_gateway?: boolean;
  allocation_id?: number | null;
  last_seen?: string | null;
}

export function useIPAMIPMap(id: number) {
  return useQuery({
    queryKey: ipamKeys.ipMap(id),
    queryFn: () => apiClient.get<{ network_id: number; ip_map: IPAMIPMapEntry[] }>(`/ipam/api/networks/${id}/ip-map`),
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
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      apiClient.delete(`/ipam/api/networks/${id}${force ? '?force=true' : ''}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ipamKeys.networks }),
  });
}

// ==================== Pools ====================

export function useCreatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IPAMPool>) => apiClient.post<IPAMPool>('/ipam/api/pools', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ipam-pools'] });
      qc.invalidateQueries({ queryKey: ['ipam-network-stats'] });
      qc.invalidateQueries({ queryKey: ipamKeys.summary });
    },
  });
}

export function useUpdatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<IPAMPool> & { id: number }) =>
      apiClient.put<IPAMPool>(`/ipam/api/pools/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ipam-pools'] });
      qc.invalidateQueries({ queryKey: ['ipam-network-stats'] });
    },
  });
}

export function useDeletePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/ipam/api/pools/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ipam-pools'] });
      qc.invalidateQueries({ queryKey: ['ipam-network-stats'] });
    },
  });
}

export function useCreateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IPAMAllocation>) => apiClient.post<IPAMAllocation>('/ipam/api/allocations', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ipam-allocations'] });
      qc.invalidateQueries({ queryKey: ipamKeys.summary });
      qc.invalidateQueries({ queryKey: ['ipam-network-stats'] });
    },
  });
}

export function useUpdateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<IPAMAllocation> & { id: number }) =>
      apiClient.put<IPAMAllocation>(`/ipam/api/allocations/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ipam-allocations'] }),
  });
}

export function useDeleteAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/ipam/api/allocations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ipam-allocations'] });
      qc.invalidateQueries({ queryKey: ipamKeys.summary });
      qc.invalidateQueries({ queryKey: ['ipam-network-stats'] });
    },
  });
}

// ==================== Tools / maintenance ====================

export interface IPAMConflict { ip_address: string; [k: string]: unknown }
export interface IPAMOrphan {
  id: number; ip_address: string; resource_name?: string; resource_type?: string;
  proxmox_vmid?: number; proxmox_server_id?: number; reason: string;
}
export interface IPAMUnlinked {
  id: number | null; ip_address: string; resource_name?: string; resource_type?: string;
  can_link: boolean; suggested_vmid?: number; suggested_server_id?: number; suggested_server_name?: string | null;
}

export function useIPAMConflicts() {
  return useQuery({
    queryKey: ipamKeys.conflicts,
    queryFn: () => apiClient.get<{ conflicts: IPAMConflict[]; count: number }>('/ipam/api/conflicts'),
  });
}

export function useIPAMOrphans() {
  return useQuery({
    queryKey: ['ipam-orphans'],
    queryFn: () => apiClient.get<{ orphans: IPAMOrphan[]; count: number }>('/ipam/api/orphans'),
  });
}

export function useIPAMUnlinked() {
  return useQuery({
    queryKey: ['ipam-unlinked'],
    queryFn: () => apiClient.get<{ unlinked: IPAMUnlinked[]; count: number; linkable_count: number }>('/ipam/api/unlinked'),
  });
}

// Invalidate everything that orphan/link/auto operations can affect.
function useInvalidateIPAM() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['ipam-allocations'] });
    qc.invalidateQueries({ queryKey: ['ipam-orphans'] });
    qc.invalidateQueries({ queryKey: ['ipam-unlinked'] });
    qc.invalidateQueries({ queryKey: ipamKeys.summary });
    qc.invalidateQueries({ queryKey: ipamKeys.conflicts });
    qc.invalidateQueries({ queryKey: ipamKeys.networks });
  };
}

export function useCleanupOrphans() {
  const invalidate = useInvalidateIPAM();
  return useMutation({
    mutationFn: () => apiClient.post<{ released: string[]; released_count: number; errors: unknown[]; error_count: number }>('/ipam/api/cleanup-orphans', {}),
    onSuccess: () => invalidate(),
  });
}

export function useLinkAllocations() {
  const invalidate = useInvalidateIPAM();
  return useMutation({
    mutationFn: (body?: { server_id?: number; network_id?: number }) =>
      apiClient.post<{ linked: unknown[]; not_found: unknown[] }>('/ipam/api/link-allocations', body ?? {}),
    onSuccess: () => invalidate(),
  });
}

export function useAutoAllocate() {
  const invalidate = useInvalidateIPAM();
  return useMutation({
    mutationFn: (data: { network_id: number; pool_id?: number; resource_type?: string; resource_name?: string; hostname?: string; notes?: string }) =>
      apiClient.post<IPAMAllocation>('/ipam/api/allocations/auto', data),
    onSuccess: () => invalidate(),
  });
}

export function useNextAvailableIP() {
  return useMutation({
    mutationFn: ({ networkId, poolId }: { networkId: number; poolId?: number }) => {
      const qs = poolId ? `?pool_id=${poolId}` : '';
      return apiClient.get<{ next_available_ip: string }>(`/ipam/api/allocations/next-available/${networkId}${qs}`);
    },
  });
}

export function useIPHistoryLookup() {
  return useMutation({
    mutationFn: (ip: string) => apiClient.get<unknown[]>(`/ipam/api/history/ip/${encodeURIComponent(ip)}`),
  });
}
