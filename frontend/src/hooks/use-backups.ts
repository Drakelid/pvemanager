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

export function useBackupList(serverId: number, node: string, storage: string) {
  return useQuery({
    queryKey: backupKeys.list(serverId, node, storage),
    queryFn: () => apiClient.get<{ backups: unknown[] }>(`/proxmox/api/backups/list/${serverId}?node=${node}&storage=${storage}`),
    enabled: serverId > 0 && !!node && !!storage,
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
      apiClient.delete(`/proxmox/api/backups/${data.server_id}/backup`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (data: { server_id: number; node: string; vmid: number; archive: string; storage: string; vm_type: string; new_vmid?: number; start?: boolean }) =>
      apiClient.post<{ success: boolean; upid: string }>('/proxmox/api/backups/restore', data),
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
