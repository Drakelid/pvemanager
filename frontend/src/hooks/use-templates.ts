import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { OSTemplate, OSTemplateGroup } from '@/types';

export const templateKeys = {
  groups: ['template-groups'] as const,
  templates: (groupId?: number, serverId?: number, vmType?: string) => ['templates', groupId, serverId, vmType] as const,
  template: (id: number) => ['template', id] as const,
  discover: (serverId: number) => ['template-discover', serverId] as const,
};

export function useTemplateGroups() {
  return useQuery({
    queryKey: templateKeys.groups,
    queryFn: () => apiClient.get<OSTemplateGroup[]>('/templates/api/groups'),
    // Список групп ОС — по алфавиту; «Other» (корзина «прочее») всегда в конце.
    select: (groups) =>
      [...groups].sort((a, b) => {
        const aOther = a.name.toLowerCase() === 'other';
        const bOther = b.name.toLowerCase() === 'other';
        if (aOther !== bOther) return aOther ? 1 : -1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }),
  });
}

export function useTemplates(groupId?: number, serverId?: number, vmType?: string) {
  const params = new URLSearchParams();
  if (groupId) params.set('group_id', String(groupId));
  if (serverId) params.set('server_id', String(serverId));
  if (vmType) params.set('vm_type', vmType);
  const qs = params.toString();
  return useQuery({
    queryKey: templateKeys.templates(groupId, serverId, vmType),
    queryFn: () => apiClient.get<OSTemplate[]>(`/templates/api/templates${qs ? `?${qs}` : ''}`),
    // Шаблоны — по имени, по алфавиту (с числовой сортировкой: Debian-9 < Debian-11).
    select: (templates) =>
      [...templates].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      ),
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

export interface QuickDeployInfo {
  template: { id: number; name: string; vmid?: number; node?: string; description?: string;
    default_cores: number; default_memory: number; default_disk: number;
    min_cores: number; min_memory: number; min_disk: number };
  group: { name?: string; icon?: string };
  server: { id?: number; name?: string };
}

export function useQuickDeployInfo(templateId: number | null) {
  return useQuery({
    queryKey: ['quick-deploy', templateId],
    queryFn: () => apiClient.get<QuickDeployInfo>(`/templates/api/quick-deploy/${templateId}`),
    enabled: !!templateId,
  });
}

export interface DeployVMArgs {
  template_id: number; name: string;
  cores?: number; memory?: number; disk?: number;
  target_node?: string; target_storage?: string;
  start_after_create?: boolean; onboot?: boolean;
}

export function useDeployVM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DeployVMArgs) =>
      apiClient.post<{ task_id: number; status: string; name?: string }>('/templates/api/deploy', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] });
      qc.invalidateQueries({ queryKey: ['virtual-machines'] });
    },
  });
}
