import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getTasksWebSocket } from '@/lib/websocket';
import type {
  AppOperation, CatalogApp, CatalogListResponse, CatalogMeta,
  InstalledApp, InstallResponse,
} from '@/types/appstore';

export const appstoreKeys = {
  catalog: (q?: string, category?: string) => ['appstore-catalog', q ?? '', category ?? ''] as const,
  catalogMeta: ['appstore-catalog-meta'] as const,
  catalogApp: (id: string) => ['appstore-catalog-app', id] as const,
  installed: ['appstore-installed'] as const,
  installedApp: (id: number) => ['appstore-installed', id] as const,
  operations: (id: number) => ['appstore-operations', id] as const,
};

// ── Каталог ────────────────────────────────────────────────────────────────

export function useCatalog(q?: string, category?: string, availableOnly = false) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (availableOnly) params.set('available_only', 'true');
  const qs = params.toString();
  return useQuery({
    queryKey: appstoreKeys.catalog(q, category),
    queryFn: () => apiClient.get<CatalogListResponse>(`/api/appstore/catalog${qs ? `?${qs}` : ''}`),
  });
}

export function useCatalogMeta() {
  return useQuery({
    queryKey: appstoreKeys.catalogMeta,
    queryFn: () => apiClient.get<CatalogMeta>('/api/appstore/catalog/meta'),
  });
}

export function useCatalogApp(appId: string) {
  return useQuery({
    queryKey: appstoreKeys.catalogApp(appId),
    queryFn: () => apiClient.get<CatalogApp>(`/api/appstore/catalog/${appId}`),
    enabled: !!appId,
  });
}

export function useSyncCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ success: boolean; stats: { total: number } }>('/api/appstore/catalog/sync'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appstore-catalog'] });
      qc.invalidateQueries({ queryKey: appstoreKeys.catalogMeta });
    },
  });
}

// ── Установленные ──────────────────────────────────────────────────────────

export function useInstalledApps() {
  return useQuery({
    queryKey: appstoreKeys.installed,
    queryFn: () => apiClient.get<{ items: InstalledApp[] }>('/api/appstore/apps').then((r) => r.items),
  });
}

export function useInstalledApp(id: number) {
  return useQuery({
    queryKey: appstoreKeys.installedApp(id),
    queryFn: () => apiClient.get<InstalledApp>(`/api/appstore/apps/${id}`),
    enabled: id > 0,
  });
}

export function useAppOperations(id: number) {
  return useQuery({
    queryKey: appstoreKeys.operations(id),
    queryFn: () => apiClient.get<{ items: AppOperation[] }>(`/api/appstore/apps/${id}/operations`).then((r) => r.items),
    enabled: id > 0,
  });
}

export interface InstallArgs {
  app_id: string;
  name: string;
  server_id: number;
  node?: string;
  form_answers: Record<string, string>;
  cores: number;
  memory: number;
  disk: number;
  storage: string;
  bridge: string;
}

export function useInstallApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InstallArgs) => apiClient.post<InstallResponse>('/api/appstore/apps/install', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export function useRetryApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/appstore/apps/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export function useDeleteApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/appstore/apps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export function useUpdateApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/appstore/apps/${id}/update`),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export function useRollbackApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/appstore/apps/${id}/rollback`),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export type LifecycleAction = 'start' | 'stop' | 'restart';

export function useLifecycleAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: LifecycleAction }) =>
      apiClient.post(`/api/appstore/apps/${id}/action/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ checked: number; changed: number }>('/api/appstore/apps/reconcile'),
    onSuccess: () => qc.invalidateQueries({ queryKey: appstoreKeys.installed }),
  });
}

export function useAppLogs(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['appstore-logs', id],
    queryFn: () => apiClient.get<{ logs: string }>(`/api/appstore/apps/${id}/logs?tail=200`).then((r) => r.logs),
    enabled: enabled && id > 0,
    refetchOnWindowFocus: false,
  });
}

// ── Realtime: инвалидация кэшей по WS-событиям + подписка на операцию ──────────

export function useAppstoreRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ws = getTasksWebSocket();
    ws.connect();
    const off1 = ws.onType('appstore_operation_update', () => {
      qc.invalidateQueries({ queryKey: appstoreKeys.installed });
    });
    const off2 = ws.onType('appstore_app_deleted', () => {
      qc.invalidateQueries({ queryKey: appstoreKeys.installed });
    });
    return () => { off1(); off2(); };
  }, [qc]);
}

/** Подписка на прогресс конкретной установки (по installed_app_id). */
export function useOperationProgress(
  installedAppId: number | null,
  onUpdate: (op: AppOperation) => void,
) {
  useEffect(() => {
    if (!installedAppId) return;
    const ws = getTasksWebSocket();
    ws.connect();
    const off = ws.onType('appstore_operation_update', (data: unknown) => {
      const op = (data as { task?: AppOperation }).task;
      if (op && op.installed_app_id === installedAppId) onUpdate(op);
    });
    return () => { off(); };
  }, [installedAppId, onUpdate]);
}
