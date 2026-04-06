import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AuditLog } from '@/types';

export const logKeys = {
  logs: (params?: Record<string, unknown>) => ['logs', params] as const,
  stats: (hours?: number) => ['log-stats', hours] as const,
  levels: ['log-levels'] as const,
  categories: ['log-categories'] as const,
};

interface LogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface LogStats {
  period_hours: number;
  total: number;
  by_level: Record<string, number>;
  by_category: Record<string, number>;
  errors_count: number;
  failed_logins: number;
  recent_errors: unknown[];
}

export function useLogs(params?: { level?: string; category?: string; username?: string; search?: string; page?: number; limit?: number; date_from?: string; date_to?: string }) {
  const qs = new URLSearchParams();
  if (params?.level) qs.set('level', params.level);
  if (params?.category) qs.set('category', params.category);
  if (params?.username) qs.set('username', params.username);
  if (params?.search) qs.set('search', params.search);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.date_from) qs.set('date_from', params.date_from);
  if (params?.date_to) qs.set('date_to', params.date_to);
  return useQuery({
    queryKey: logKeys.logs(params),
    queryFn: () => apiClient.get<LogsResponse>(`/logs/api/logs?${qs}`),
  });
}

export function useLogStats(hours = 24) {
  return useQuery({
    queryKey: logKeys.stats(hours),
    queryFn: () => apiClient.get<LogStats>(`/logs/api/stats?hours=${hours}`),
  });
}

export function useLogLevels() {
  return useQuery({
    queryKey: logKeys.levels,
    queryFn: () => apiClient.get<{ levels: { value: string; label: string; color: string }[] }>('/logs/api/levels'),
    staleTime: Infinity,
  });
}

export function useLogCategories() {
  return useQuery({
    queryKey: logKeys.categories,
    queryFn: () => apiClient.get<{ categories: { value: string; label: string }[] }>('/logs/api/categories'),
    staleTime: Infinity,
  });
}

export function useDeleteOldLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => apiClient.delete(`/logs/api/logs?days=${days}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logs'] }),
  });
}
