import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const taskKeys = {
  all: (params?: Record<string, unknown>) => ['all-tasks', params] as const,
  activeCount: ['tasks-active-count'] as const,
  bulk: (limit?: number) => ['bulk-tasks', limit] as const,
};

export interface TaskItem {
  id?: number;
  upid?: string;
  type: string;
  kind?: 'bulk' | 'proxmox' | 'deploy';
  status: string;
  action?: string;
  description?: string;
  progress_percent?: number;
  current_step?: string;
  name?: string;
  items_count?: number;
  completed_count?: number;
  failed_count?: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  node?: string;
  server_id?: number;
  server_name?: string;
  vmid?: number;
  vm_type?: string;
  exitstatus?: string;
  exit_status?: string;
  starttime?: number;
  endtime?: number;
  user?: string;
  [key: string]: unknown;
}

export function useAllTasks(params?: { limit?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  return useQuery({
    queryKey: taskKeys.all(params),
    queryFn: () => apiClient.get<{ tasks: TaskItem[] }>(`/proxmox/api/all-tasks?${qs}`),
    refetchInterval: 5000,
  });
}

export function useActiveTaskCount() {
  return useQuery({
    queryKey: taskKeys.activeCount,
    queryFn: () => apiClient.get<{ count: number }>('/proxmox/api/all-tasks/active-count'),
    refetchInterval: 5000,
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => apiClient.post<{ success: boolean }>(`/proxmox/api/tasks/${taskId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-tasks'] }),
  });
}

export function useClearCompletedTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete('/proxmox/api/all-tasks/completed'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-tasks'] }),
  });
}
