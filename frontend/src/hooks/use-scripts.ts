import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ScriptCatalogItem, ScriptExecution, ScriptGitRepoItem, ScriptParamField } from '@/types/scripts';

export const scriptKeys = {
  catalog: ['scripts-catalog'] as const,
  detail: (id: number) => ['scripts-catalog', id] as const,
  repos: ['scripts-repos'] as const,
  executions: ['scripts-executions'] as const,
  execution: (id: number) => ['scripts-executions', id] as const,
};

// ── Каталог ────────────────────────────────────────────────────────────────

export function useScripts() {
  return useQuery({
    queryKey: scriptKeys.catalog,
    queryFn: () => apiClient.get<{ items: ScriptCatalogItem[] }>('/api/scripts').then((r) => r.items),
  });
}

export function useScript(id: number) {
  return useQuery({
    queryKey: scriptKeys.detail(id),
    queryFn: () => apiClient.get<ScriptCatalogItem>(`/api/scripts/${id}`),
    enabled: id > 0,
  });
}

export interface ScriptCreateArgs {
  name: string;
  slug: string;
  description?: string;
  category?: string;
  target_type: 'node' | 'guest';
  interpreter?: string;
  content: string;
  params_schema: ScriptParamField[];
}

export function useCreateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ScriptCreateArgs) => apiClient.post<ScriptCatalogItem>('/api/scripts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptKeys.catalog }),
  });
}

export function useUpdateScript(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ScriptCreateArgs>) => apiClient.put<ScriptCatalogItem>(`/api/scripts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scriptKeys.catalog });
      qc.invalidateQueries({ queryKey: scriptKeys.detail(id) });
    },
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/scripts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptKeys.catalog }),
  });
}

// ── Git-источники ────────────────────────────────────────────────────────────

export function useScriptRepos() {
  return useQuery({
    queryKey: scriptKeys.repos,
    queryFn: () => apiClient.get<{ items: ScriptGitRepoItem[] }>('/api/scripts/repos').then((r) => r.items),
  });
}

export interface RepoCreateArgs {
  url: string;
  branch?: string;
  path_glob?: string;
  enabled?: boolean;
}

export function useCreateScriptRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RepoCreateArgs) => apiClient.post<ScriptGitRepoItem>('/api/scripts/repos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptKeys.repos }),
  });
}

export function useSyncScriptRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiClient.post<{ success: boolean; created: number; updated: number; disappeared: number; error?: string }>(
        `/api/scripts/repos/${id}/sync`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scriptKeys.repos });
      qc.invalidateQueries({ queryKey: scriptKeys.catalog });
    },
  });
}

export function useDeleteScriptRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/scripts/repos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scriptKeys.repos });
      qc.invalidateQueries({ queryKey: scriptKeys.catalog });
    },
  });
}

// ── Выполнение ────────────────────────────────────────────────────────────

export interface ExecuteScriptArgs {
  server_id: number;
  node?: string;
  vmid?: number;
  vm_type?: 'qemu' | 'lxc';
  params: Record<string, string>;
  timeout?: number;
}

export function useExecuteScript(scriptId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ExecuteScriptArgs) => apiClient.post<ScriptExecution>(`/api/scripts/${scriptId}/execute`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptKeys.executions }),
  });
}

export function useScriptExecutions(limit = 50) {
  return useQuery({
    queryKey: scriptKeys.executions,
    queryFn: () => apiClient.get<{ items: ScriptExecution[] }>(`/api/scripts/executions?limit=${limit}`).then((r) => r.items),
  });
}

export function useScriptExecution(id: number) {
  return useQuery({
    queryKey: scriptKeys.execution(id),
    queryFn: () => apiClient.get<ScriptExecution>(`/api/scripts/executions/${id}`),
    enabled: id > 0,
  });
}
