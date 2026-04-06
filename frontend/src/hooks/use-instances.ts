import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { VMInstance, Snapshot, VMConfig } from '@/types';

// ==================== Query Keys ====================
export const vmKeys = {
  all: ['virtual-machines'] as const,
  resources: (serverId?: number) => ['resources', serverId] as const,
  resourcesAll: ['resources', 'all'] as const,
  detail: (serverId: number, vmid: number) => ['vm', serverId, vmid] as const,
  config: (serverId: number, vmid: number) => ['vm', serverId, vmid, 'config'] as const,
  status: (serverId: number, vmid: number) => ['vm', serverId, vmid, 'status'] as const,
  rrddata: (serverId: number, vmid: number, tf: string) => ['vm', serverId, vmid, 'rrddata', tf] as const,
  snapshots: (serverId: number, vmid: number) => ['vm', serverId, vmid, 'snapshots'] as const,
  interfaces: (serverId: number, vmid: number) => ['vm', serverId, vmid, 'interfaces'] as const,
};

// ==================== VM List ====================
export function useVirtualMachines() {
  return useQuery({
    queryKey: vmKeys.all,
    queryFn: () => apiClient.get<VMInstance[]>('/proxmox/api/virtual-machines'),
    refetchInterval: 30000,
  });
}

export function useAllResources() {
  return useQuery({
    queryKey: vmKeys.resourcesAll,
    queryFn: () => apiClient.get<Record<string, unknown>>('/proxmox/api/resources/all'),
    refetchInterval: 30000,
  });
}

// ==================== VM Detail ====================
interface VMStatusResponse {
  status: string;
  cpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  netin: number;
  netout: number;
  name?: string;
  pid?: number;
  [key: string]: unknown;
}

export function useVMStatus(serverId: number, vmid: number, type: string, node: string, enabled = true) {
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useQuery<VMStatusResponse>({
    queryKey: vmKeys.status(serverId, vmid),
    queryFn: () => apiClient.get(`/proxmox/api/${serverId}/${prefix}/${vmid}/status?node=${node}`),
    refetchInterval: 10000,
    enabled,
  });
}

export function useVMConfig(serverId: number, vmid: number, type: string, node: string, enabled = true) {
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useQuery<VMConfig>({
    queryKey: vmKeys.config(serverId, vmid),
    queryFn: () => apiClient.get(`/proxmox/api/${serverId}/${prefix}/${vmid}/config?node=${node}`),
    enabled,
  });
}

export function useVMRrddata(serverId: number, vmid: number, type: string, node: string, timeframe = 'hour') {
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useQuery({
    queryKey: vmKeys.rrddata(serverId, vmid, timeframe),
    queryFn: async () => {
      const res = await apiClient.get<{ data: unknown[]; timeframe: string }>(`/proxmox/api/${serverId}/${prefix}/${vmid}/rrddata?node=${node}&timeframe=${timeframe}`);
      return res.data ?? [];
    },
  });
}

interface InterfaceInfo {
  name: string;
  mac?: string;
  ips?: Array<{ address: string; prefix: number; type: string }>;
}

export function useVMInterfaces(serverId: number, vmid: number, type: string, node: string, enabled = true) {
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useQuery<{ interfaces: InterfaceInfo[] }>({
    queryKey: vmKeys.interfaces(serverId, vmid),
    queryFn: () => apiClient.get(`/proxmox/api/${serverId}/${prefix}/${vmid}/interfaces?node=${node}`),
    enabled,
    retry: 1,
  });
}

// ==================== Snapshots ====================
export function useSnapshots(serverId: number, vmid: number, type: string, node: string, enabled = true) {
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useQuery<{ snapshots: Snapshot[] }>({
    queryKey: vmKeys.snapshots(serverId, vmid),
    queryFn: () => apiClient.get(`/proxmox/api/${serverId}/${prefix}/${vmid}/snapshots?node=${node}`),
    enabled,
  });
}

export function useCreateSnapshot(serverId: number, vmid: number, type: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation({
    mutationFn: (body: { snapname: string; description?: string; vmstate?: boolean }) =>
      apiClient.post(`/proxmox/api/${serverId}/${prefix}/${vmid}/snapshots`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.snapshots(serverId, vmid) });
    },
  });
}

export function useDeleteSnapshot(serverId: number, vmid: number, type: string, node: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation({
    mutationFn: (snapname: string) =>
      apiClient.delete(`/proxmox/api/${serverId}/${prefix}/${vmid}/snapshots/${snapname}?node=${node}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.snapshots(serverId, vmid) });
    },
  });
}

export function useRollbackSnapshot(serverId: number, vmid: number, type: string, node: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation({
    mutationFn: (snapname: string) =>
      apiClient.post(`/proxmox/api/${serverId}/${prefix}/${vmid}/snapshots/${snapname}/rollback?node=${node}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.snapshots(serverId, vmid) });
      qc.invalidateQueries({ queryKey: vmKeys.status(serverId, vmid) });
    },
  });
}

// ==================== Power Actions ====================
interface PowerActionResult {
  status: string;
  action: string;
  vmid: number;
  node: string;
  upid?: string;
}

export function usePowerAction(serverId: number, vmid: number, type: string, node: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation<PowerActionResult, Error, { action: string; force?: boolean }>({
    mutationFn: ({ action, force }) => {
      const params = new URLSearchParams({ node });
      if (force) params.set('force', '1');
      return apiClient.post(`/proxmox/api/${serverId}/${prefix}/${vmid}/${action}?${params}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.status(serverId, vmid) });
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

// ==================== Delete VM ====================
export function useDeleteVM(serverId: number, vmid: number, type: string, node: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation({
    mutationFn: () => apiClient.delete(`/proxmox/api/${serverId}/${prefix}/${vmid}?node=${node}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

// ==================== Bulk Operations ====================
interface BulkItem {
  server_id: number;
  vmid: number;
  vm_type: string;
  name: string;
  node: string;
}

export function useBulkOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string; items: BulkItem[] }) =>
      apiClient.post('/proxmox/api/bulk-operation', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

// ==================== Disk Resize ====================
export function useResizeDisk(serverId: number, vmid: number, type: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation({
    mutationFn: (body: { disk: string; size: string }) =>
      apiClient.post(`/proxmox/api/${serverId}/${prefix}/${vmid}/disk/resize`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.config(serverId, vmid) });
      qc.invalidateQueries({ queryKey: vmKeys.status(serverId, vmid) });
    },
  });
}

// ==================== Config Update ====================
export function useUpdateConfig(serverId: number, vmid: number, type: string) {
  const qc = useQueryClient();
  const prefix = type === 'lxc' ? 'container' : 'vm';
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.put(`/proxmox/api/${serverId}/${prefix}/${vmid}/config`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vmKeys.config(serverId, vmid) });
    },
  });
}
