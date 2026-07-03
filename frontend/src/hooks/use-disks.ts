import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface NodeDisk {
  devpath: string;
  size?: number;
  model?: string;
  serial?: string;
  type?: string;        // 'ssd' | 'hdd' | 'nvme' | ...
  vendor?: string;
  used?: string;        // 'LVM' | 'ZFS' | 'partitions' | ... | undefined
  health?: string;      // 'PASSED' | 'OK' | 'FAILED' | ...
  wearout?: number | string;
  rpm?: number;
  gpt?: number;
}

export interface ZfsPool {
  name: string;
  size?: number;
  alloc?: number;
  free?: number;
  frag?: number;
  dedup?: number;
  health?: string;
}

export interface SmartAttribute {
  id?: number;
  name?: string;
  value?: number | string;
  worst?: number | string;
  threshold?: number | string;
  raw?: string;
  flags?: string;
}

export interface SmartData {
  health?: string;
  type?: string;
  text?: string;
  attributes?: SmartAttribute[];
  error?: string;
}

export const diskKeys = {
  disks: (s: number, n: string) => ['node-disks', s, n] as const,
  smart: (s: number, n: string, d: string) => ['disk-smart', s, n, d] as const,
  zfs: (s: number, n: string) => ['zfs-pools', s, n] as const,
};

const base = (s: number, n: string) => `/proxmox/api/servers/${s}/nodes/${n}/disks`;

export function useNodeDisks(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: diskKeys.disks(serverId, node),
    queryFn: () => apiClient.get<{ disks: NodeDisk[] }>(base(serverId, node)),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useDiskSmart(serverId: number, node: string, disk: string, enabled = true) {
  return useQuery({
    queryKey: diskKeys.smart(serverId, node, disk),
    queryFn: () => apiClient.get<{ smart: SmartData }>(`${base(serverId, node)}/smart?disk=${encodeURIComponent(disk)}`),
    enabled: serverId > 0 && !!node && !!disk && enabled,
  });
}

export function useZfsPools(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: diskKeys.zfs(serverId, node),
    queryFn: () => apiClient.get<{ pools: ZfsPool[] }>(`${base(serverId, node)}/zfs`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

function useInvalidate(serverId: number, node: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: diskKeys.zfs(serverId, node) });
    qc.invalidateQueries({ queryKey: diskKeys.disks(serverId, node) });
  };
}

export function useCreateZfsPool(serverId: number, node: string) {
  const invalidate = useInvalidate(serverId, node);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post(`${base(serverId, node)}/zfs`, data),
    onSuccess: () => invalidate(),
  });
}

export function useDestroyZfsPool(serverId: number, node: string) {
  const invalidate = useInvalidate(serverId, node);
  return useMutation({
    mutationFn: ({ name, cleanupDisks }: { name: string; cleanupDisks?: boolean }) =>
      apiClient.delete(`${base(serverId, node)}/zfs/${name}?cleanup_disks=${cleanupDisks ? 'true' : 'false'}`),
    onSuccess: () => invalidate(),
  });
}

export function useWipeDisk(serverId: number, node: string) {
  const invalidate = useInvalidate(serverId, node);
  return useMutation({
    mutationFn: (disk: string) => apiClient.put(`${base(serverId, node)}/wipe?disk=${encodeURIComponent(disk)}`, {}),
    onSuccess: () => invalidate(),
  });
}
