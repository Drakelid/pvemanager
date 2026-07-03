import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface NodeService {
  service: string;
  name?: string;
  desc?: string;
  state?: string;         // running | stopped | dead | ...
  'active-state'?: string;
  'unit-state'?: string;
}

export interface AptUpdate {
  Package: string;
  Version?: string;
  OldVersion?: string;
  Title?: string;
  Description?: string;
  Priority?: string;
}

export interface AptRepo {
  Enabled?: number | boolean;
  Types?: string[];
  URIs?: string[];
  Suites?: string[];
  Components?: string[];
  Comment?: string;
}

export interface AptRepoFile {
  path: string;
  'file-type'?: string;
  repositories?: AptRepo[];
}

export interface AptRepositories {
  files?: AptRepoFile[];
  'standard-repos'?: Array<{ handle: string; name: string; status?: number }>;
  errors?: unknown[];
}

export const nodeAdminKeys = {
  services: (s: number, n: string) => ['node-services', s, n] as const,
  updates: (s: number, n: string) => ['apt-updates', s, n] as const,
  repos: (s: number, n: string) => ['apt-repos', s, n] as const,
};

const base = (s: number, n: string) => `/proxmox/api/servers/${s}/nodes/${n}`;

// ---------- Services ----------
export function useNodeServices(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.services(serverId, node),
    queryFn: () => apiClient.get<{ services: NodeService[] }>(`${base(serverId, node)}/services`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useServiceAction(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ service, action }: { service: string; action: string }) =>
      apiClient.post(`${base(serverId, node)}/services/${service}/${action}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.services(serverId, node) }),
  });
}

// ---------- APT ----------
export function useAptUpdates(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.updates(serverId, node),
    queryFn: () => apiClient.get<{ updates: AptUpdate[] }>(`${base(serverId, node)}/apt/updates`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useAptRefresh(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post(`${base(serverId, node)}/apt/refresh`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.updates(serverId, node) }),
  });
}

export function useAptRepositories(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.repos(serverId, node),
    queryFn: () => apiClient.get<{ repositories: AptRepositories }>(`${base(serverId, node)}/apt/repositories`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useSetAptRepository(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { path: string; index: number; enabled: boolean }) =>
      apiClient.post(`${base(serverId, node)}/apt/repositories`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.repos(serverId, node) }),
  });
}
