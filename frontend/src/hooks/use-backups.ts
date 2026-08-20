import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const backupKeys = {
  storages: (serverId: number) => ['backup-storages', serverId] as const,
  list: (serverId: number, node: string, storage: string) => ['backups', serverId, node, storage] as const,
  jobs: ['backup-jobs'] as const,
  proxmoxJobs: (serverId: number) => ['proxmox-backup-jobs', serverId] as const,
};

export function useBackupStorages(serverId: number) {
  return useQuery({
    queryKey: backupKeys.storages(serverId),
    queryFn: () => apiClient.get<{ storages: unknown[] }>(`/proxmox/api/backups/storages/${serverId}`),
    enabled: serverId > 0,
  });
}

export function useProxmoxBackupJobs(serverId: number) {
  return useQuery({
    queryKey: backupKeys.proxmoxJobs(serverId),
    queryFn: () => apiClient.get<{ jobs: unknown[]; server_name?: string; error?: string }>(`/proxmox/api/backups/proxmox-jobs/${serverId}`),
    enabled: serverId > 0,
  });
}

export type ProxmoxJobInput = {
  id?: string;
  schedule: string;
  storage: string;
  mode?: string;
  compress?: string;
  enabled?: boolean;
  selection_mode?: 'all' | 'vmid' | 'pool';
  vmid?: string;
  pool?: string;
  node?: string;
  keep_last?: number;
  keep_daily?: number;
  keep_weekly?: number;
  keep_monthly?: number;
  comment?: string;
  mailto?: string;
};

export function useCreateProxmoxJob(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProxmoxJobInput) =>
      apiClient.post<{ success: boolean }>(`/proxmox/api/backups/proxmox-jobs/${serverId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.proxmoxJobs(serverId) }),
  });
}

export function useUpdateProxmoxJob(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProxmoxJobInput }) =>
      apiClient.put<{ success: boolean }>(`/proxmox/api/backups/proxmox-jobs/${serverId}/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.proxmoxJobs(serverId) }),
  });
}

export function useDeleteProxmoxJob(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      apiClient.delete<{ success: boolean }>(`/proxmox/api/backups/proxmox-jobs/${serverId}/${jobId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.proxmoxJobs(serverId) }),
  });
}

export function useScanNfsExports(serverId: number) {
  return useMutation({
    mutationFn: (server: string) =>
      apiClient.get<{ exports: { path: string }[] }>(
        `/proxmox/api/backups/scan-nfs/${serverId}?server=${encodeURIComponent(server)}`
      ),
  });
}

export function useCreateStorage(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`/proxmox/api/backups/storages/${serverId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.storages(serverId) }),
  });
}

export function useUpdateStorage(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storage, ...data }: { storage: string } & Record<string, unknown>) =>
      apiClient.put(`/proxmox/api/backups/storages/${serverId}/${storage}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.storages(serverId) }),
  });
}

export function useDeleteStorage(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storage: string) =>
      apiClient.delete(`/proxmox/api/backups/storages/${serverId}/${storage}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.storages(serverId) }),
  });
}

export function useBackupList(serverId: number, node: string, storage: string) {
  return useQuery({
    queryKey: backupKeys.list(serverId, node, storage),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('storage', storage);
      if (node) params.set('node', node);
      return apiClient.get<{ backups: unknown[] }>(`/proxmox/api/backups/list/${serverId}?${params.toString()}`);
    },
    enabled: serverId > 0 && !!storage,
  });
}

export function useBackupJobs() {
  return useQuery({
    queryKey: backupKeys.jobs,
    queryFn: () => apiClient.get<{ jobs: unknown[] }>('/proxmox/api/backups/jobs'),
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { server_id: number; node: string; vmid: number; storage: string; mode?: string; compress?: string; notes?: string }) =>
      apiClient.post<{ success: boolean; upid: string }>('/proxmox/api/backups/create', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { server_id: number; node: string; storage: string; volid: string }) =>
      apiClient.delete(`/proxmox/api/backups/${data.server_id}/backup`, {
        node: data.node,
        storage: data.storage,
        volid: data.volid,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (data: { server_id: number; node: string; vmid: number; archive: string; storage?: string; vm_type: string; new_vmid?: number; start?: boolean; unique?: boolean }) =>
      apiClient.post<{ success: boolean; upid: string }>('/proxmox/api/backups/restore', data),
  });
}

export type BulkRestoreItem = { node: string; vmid: number; archive: string; vm_type: string };
export type BulkRestoreResult = {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: { vmid: number; target_vmid?: number; archive: string; success: boolean; upid?: string; error?: string }[];
};

export function useBulkRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { server_id: number; storage?: string; mode: 'in_place' | 'new_vmid'; start: boolean; items: BulkRestoreItem[] }) =>
      apiClient.post<BulkRestoreResult>('/proxmox/api/backups/restore-bulk', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });
}

export type BackupJobInput = {
  server_id: number;
  node: string;
  vmids: (number | string)[];
  storage: string;
  mode?: string;
  compress?: string;
  notes?: string;
  keep_last?: number;
  keep_daily?: number;
  keep_weekly?: number;
  keep_monthly?: number;
  cron_expression: string;
  enabled?: boolean;
};

export function useCreateBackupJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BackupJobInput) =>
      apiClient.post<{ success: boolean; job: unknown }>('/proxmox/api/backups/jobs', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.jobs }),
  });
}

export function useUpdateBackupJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BackupJobInput> }) =>
      apiClient.put<{ success: boolean; job: unknown }>(`/proxmox/api/backups/jobs/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.jobs }),
  });
}

export function useDeleteBackupJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => apiClient.delete<{ success: boolean }>(`/proxmox/api/backups/jobs/${jobId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.jobs }),
  });
}

export function useToggleBackupJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => apiClient.patch<{ success: boolean }>(`/proxmox/api/backups/jobs/${jobId}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.jobs }),
  });
}

export function useRunBackupJob() {
  return useMutation({
    mutationFn: (jobId: number) => apiClient.post<{ success: boolean }>(`/proxmox/api/backups/jobs/${jobId}/run-now`),
  });
}
