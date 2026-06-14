import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export interface AvailableLXCTemplate {
  template: string;
  type?: string;
  os?: string;
  version?: string;
  headline?: string;
  section?: string;
  package?: string;
  [k: string]: unknown;
}

// Templates available to download from the PVE appliance repository for a node.
export function useAvailableLXCTemplates(serverId?: number, node?: string) {
  return useQuery({
    queryKey: ['available-lxc-templates', serverId, node],
    queryFn: () =>
      apiClient.get<AvailableLXCTemplate[]>(`/proxmox/api/${serverId}/available-lxc-templates?node=${encodeURIComponent(node!)}`),
    enabled: !!serverId && !!node,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDownloadLXCTemplate(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { node: string; storage: string; template: string }) =>
      apiClient.post<{ success?: boolean; upid?: string; task_id?: number }>(`/proxmox/api/${serverId}/download-lxc-template`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] });
      qc.invalidateQueries({ queryKey: ['lxc-templates', serverId] });
    },
  });
}
