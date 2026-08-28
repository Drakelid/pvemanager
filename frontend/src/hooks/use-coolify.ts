import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface CoolifySettings {
  configured: boolean; name: string; base_url: string; verify_ssl: boolean;
  enabled: boolean; token_configured: boolean;
}
export interface CoolifyServer { uuid: string; name: string; description?: string; ip?: string; settings?: { is_reachable?: boolean; is_usable?: boolean; is_build_server?: boolean } }
export interface CoolifyResource {
  uuid: string; name: string; type: string; status?: string; description?: string; fqdn?: string; created_at?: string; updated_at?: string;
}

const keys = {
  settings: ['coolify-settings'] as const,
  servers: ['coolify-servers'] as const,
  mapping: (serverId: number, vmid: number) => ['coolify-mapping', serverId, vmid] as const,
  resources: (serverId: number, vmid: number) => ['coolify-resources', serverId, vmid] as const,
};

export function useCoolifySettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => apiClient.get<CoolifySettings>('/api/coolify/settings') });
}
export function useUpdateCoolifySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CoolifySettings, 'configured' | 'token_configured'> & { api_token?: string }) =>
      apiClient.put<CoolifySettings>('/api/coolify/settings', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.settings }); qc.invalidateQueries({ queryKey: keys.servers }); },
  });
}
export function useTestCoolify() {
  return useMutation({ mutationFn: (body: { base_url?: string; api_token?: string; verify_ssl?: boolean }) =>
    apiClient.post<{ success: boolean; server_count: number }>('/api/coolify/settings/test', body) });
}
export function useCoolifyServers(enabled = true) {
  return useQuery({ queryKey: keys.servers, queryFn: () => apiClient.get<CoolifyServer[]>('/api/coolify/servers'), enabled });
}
export function useCoolifyMapping(serverId: number, vmid: number) {
  return useQuery({ queryKey: keys.mapping(serverId, vmid), queryFn: () =>
    apiClient.get<{ coolify_server_uuid: string | null }>(`/api/coolify/instances/${serverId}/${vmid}/mapping`) });
}
export function useUpdateCoolifyMapping(serverId: number, vmid: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (coolify_server_uuid: string | null) => apiClient.put(`/api/coolify/instances/${serverId}/${vmid}/mapping`, { coolify_server_uuid }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.mapping(serverId, vmid) }); qc.invalidateQueries({ queryKey: keys.resources(serverId, vmid) }); },
  });
}
export function useCoolifyResources(serverId: number, vmid: number, enabled: boolean) {
  return useQuery({ queryKey: keys.resources(serverId, vmid), queryFn: () =>
    apiClient.get<CoolifyResource[]>(`/api/coolify/instances/${serverId}/${vmid}/resources`), enabled });
}
export function useCoolifyAction(serverId: number, vmid: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uuid, action }: { uuid: string; action: 'start' | 'stop' | 'restart' | 'deploy' }) =>
      apiClient.post(`/api/coolify/instances/${serverId}/${vmid}/resources/${uuid}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.resources(serverId, vmid) }),
  });
}
export function useCoolifyLogs(serverId: number, vmid: number, uuid: string | null) {
  return useQuery({ queryKey: ['coolify-logs', serverId, vmid, uuid], queryFn: () =>
    apiClient.get<unknown>(`/api/coolify/instances/${serverId}/${vmid}/resources/${uuid}/logs?lines=200`), enabled: !!uuid });
}
