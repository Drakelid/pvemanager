import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Workspace } from '@/types';
import { nodeKeys } from './use-nodes';
import { vmKeys } from './use-instances';

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (id: number) => ['workspace', id] as const,
};

interface WorkspaceDetail extends Omit<Workspace, 'servers' | 'users'> {
  servers: { id: number; name: string; ip_address: string; is_online: boolean; cluster_name?: string }[];
  users: { id: number; username: string; email: string; full_name?: string }[];
}

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.all,
    queryFn: () => apiClient.get<Workspace[]>('/api/workspaces'),
  });
}

export function useWorkspace(id: number) {
  return useQuery({
    queryKey: workspaceKeys.detail(id),
    queryFn: () => apiClient.get<WorkspaceDetail>(`/api/workspaces/${id}`),
    enabled: id > 0,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; server_ids?: number[]; user_ids?: number[] }) =>
      apiClient.post<WorkspaceDetail>('/api/workspaces', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; color?: string }) =>
      apiClient.put<WorkspaceDetail>(`/api/workspaces/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/workspaces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useUpdateWorkspaceServers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ids }: { id: number; ids: number[] }) =>
      apiClient.post<WorkspaceDetail>(`/api/workspaces/${id}/servers`, { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: nodeKeys.servers });
      qc.invalidateQueries({ queryKey: nodeKeys.topology });
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}

export function useUpdateWorkspaceUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ids }: { id: number; ids: number[] }) =>
      apiClient.post<WorkspaceDetail>(`/api/workspaces/${id}/users`, { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: nodeKeys.servers });
      qc.invalidateQueries({ queryKey: nodeKeys.topology });
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    },
  });
}
