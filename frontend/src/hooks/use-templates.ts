import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { OSTemplate, OSTemplateGroup } from '@/types';

export const templateKeys = {
  groups: ['template-groups'] as const,
  templates: (groupId?: number, serverId?: number) => ['templates', groupId, serverId] as const,
  template: (id: number) => ['template', id] as const,
  discover: (serverId: number) => ['template-discover', serverId] as const,
};

export function useTemplateGroups() {
  return useQuery({
    queryKey: templateKeys.groups,
    queryFn: () => apiClient.get<OSTemplateGroup[]>('/templates/api/groups'),
  });
}

export function useTemplates(groupId?: number, serverId?: number) {
  const params = new URLSearchParams();
  if (groupId) params.set('group_id', String(groupId));
  if (serverId) params.set('server_id', String(serverId));
  const qs = params.toString();
  return useQuery({
    queryKey: templateKeys.templates(groupId, serverId),
    queryFn: () => apiClient.get<OSTemplate[]>(`/templates/api/templates${qs ? `?${qs}` : ''}`),
  });
}

export function useTemplate(templateId: number) {
  return useQuery({
    queryKey: templateKeys.template(templateId),
    queryFn: () => apiClient.get<OSTemplate>(`/templates/api/templates/${templateId}`),
    enabled: templateId > 0,
  });
}

export function useDiscoverTemplates(serverId: number) {
  return useQuery({
    queryKey: templateKeys.discover(serverId),
    queryFn: () => apiClient.get<{ server_id: number; server_name: string; templates: unknown[] }>(`/templates/api/discover/${serverId}`),
    enabled: false, // manual trigger
  });
}

export function useAutoImportTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId: number) => apiClient.post<{ success: boolean; count: number }>(`/templates/api/auto-import/${serverId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateKeys.groups });
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<OSTemplate>) => apiClient.post<OSTemplate>('/templates/api/templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OSTemplate> & { id: number }) =>
      apiClient.put<OSTemplate>(`/templates/api/templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/templates/api/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}
