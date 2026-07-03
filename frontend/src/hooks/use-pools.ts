import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Pool {
  poolid: string;
  comment?: string;
}

export interface PoolMember {
  id: string;
  type: string;      // 'qemu' | 'lxc' | 'storage'
  vmid?: number;
  name?: string;
  node?: string;
  storage?: string;
  status?: string;
}

export interface PoolDetail {
  comment?: string;
  members?: PoolMember[];
}

export const poolKeys = {
  list: (s: number) => ['pools', s] as const,
  detail: (s: number, p: string) => ['pool', s, p] as const,
};

const base = (s: number) => `/proxmox/api/servers/${s}/pools`;

export function usePools(serverId: number, enabled = true) {
  return useQuery({
    queryKey: poolKeys.list(serverId),
    queryFn: () => apiClient.get<{ pools: Pool[] }>(base(serverId)),
    enabled: serverId > 0 && enabled,
  });
}

export function usePool(serverId: number, poolid: string, enabled = true) {
  return useQuery({
    queryKey: poolKeys.detail(serverId, poolid),
    queryFn: () => apiClient.get<{ pool: PoolDetail }>(`${base(serverId)}/${poolid}`),
    enabled: serverId > 0 && !!poolid && enabled,
  });
}

function useInvalidatePools(serverId: number) {
  const qc = useQueryClient();
  return (poolid?: string) => {
    qc.invalidateQueries({ queryKey: poolKeys.list(serverId) });
    if (poolid) qc.invalidateQueries({ queryKey: poolKeys.detail(serverId, poolid) });
  };
}

export function useCreatePool(serverId: number) {
  const invalidate = useInvalidatePools(serverId);
  return useMutation({
    mutationFn: (data: { poolid: string; comment?: string }) => apiClient.post(base(serverId), data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePool(serverId: number) {
  const invalidate = useInvalidatePools(serverId);
  return useMutation({
    mutationFn: ({ poolid, data }: { poolid: string; data: Record<string, unknown> }) =>
      apiClient.put(`${base(serverId)}/${poolid}`, data),
    onSuccess: (_r, v) => invalidate(v.poolid),
  });
}

export function useDeletePool(serverId: number) {
  const invalidate = useInvalidatePools(serverId);
  return useMutation({
    mutationFn: (poolid: string) => apiClient.delete(`${base(serverId)}/${poolid}`),
    onSuccess: () => invalidate(),
  });
}
