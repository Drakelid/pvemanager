import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LXCTemplate, LXCDeployRequest } from '@/types';

export const lxcKeys = {
  templates: (serverId: number) => ['lxc-templates', serverId] as const,
  storages: (serverId: number, node?: string) => ['lxc-storages', serverId, node] as const,
};

// CT templates change rarely — cache for 5 minutes
export function useLXCTemplates(serverId?: number) {
  return useQuery({
    queryKey: lxcKeys.templates(serverId!),
    queryFn: () =>
      apiClient
        .get<{ server_id: number; templates: LXCTemplate[] }>(`/proxmox/api/lxc-templates/${serverId}`)
        .then((r) => r.templates),
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000,
  });
}

// Storage list changes rarely — cache for 5 minutes
export function useLXCStorages(serverId?: number, node?: string) {
  const params = node ? `?node=${encodeURIComponent(node)}` : '';
  return useQuery({
    queryKey: lxcKeys.storages(serverId!, node),
    queryFn: () =>
      apiClient
        .get<{ storages: { storage: string; type: string; avail: number; total: number }[] }>(
          `/proxmox/api/lxc-storages/${serverId}${params}`,
        )
        .then((r) => r.storages),
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeployLXC() {
  return useMutation({
    mutationFn: (data: LXCDeployRequest) =>
      apiClient.post<{ task_id: number; status: string; name: string }>('/proxmox/api/lxc/deploy', data),
  });
}
