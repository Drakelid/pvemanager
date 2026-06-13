import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { HAStatus } from '@/types';

export const haKeys = {
  status: (serverId: number) => ['ha-status', serverId] as const,
};

export interface AddToHAArgs {
  vmType: 'vm' | 'ct';
  vmid: number;
  state: string;
  group?: string;
  max_restart: number;
  max_relocate: number;
  comment?: string;
}

export function useHAStatus(serverId: number) {
  return useQuery({
    queryKey: haKeys.status(serverId),
    queryFn: () => apiClient.get<HAStatus>(`/proxmox/api/${serverId}/ha/status`),
    enabled: serverId > 0,
  });
}

export function useAddToHA(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    // The backend expects these as query params, not a JSON body.
    mutationFn: ({ vmType, vmid, state, group, max_restart, max_relocate, comment }: AddToHAArgs) => {
      const qs = new URLSearchParams();
      qs.set('state', state);
      qs.set('max_restart', String(max_restart));
      qs.set('max_relocate', String(max_relocate));
      if (group) qs.set('group', group);
      if (comment) qs.set('comment', comment);
      return apiClient.post(`/proxmox/api/${serverId}/ha/${vmType}/${vmid}/add?${qs}`, {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: haKeys.status(serverId) }),
  });
}

export function useRemoveFromHA(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vmType, vmid }: { vmType: 'vm' | 'ct'; vmid: number }) =>
      apiClient.delete(`/proxmox/api/${serverId}/ha/${vmType}/${vmid}/remove`),
    onSuccess: () => qc.invalidateQueries({ queryKey: haKeys.status(serverId) }),
  });
}
