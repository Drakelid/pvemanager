import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const settingsKeys = {
  profile: ['settings-profile'] as const,
  panel: ['settings-panel'] as const,
  security: ['settings-security'] as const,
  channels: ['notification-channels'] as const,
  version: ['app-version'] as const,
  updateRepository: ['update-repository'] as const,
  updateStatus: ['update-status'] as const,
};

export interface CheckUpdateResult {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  changelog: string | null;
  error: string | null;
  git_available: boolean;
  project_mounted: boolean;
  disabled: boolean;
  repository_url?: string;
  commits_behind?: number;
}

export interface UpdateStatus {
  is_updating: boolean;
  started_at: string | null;
  stage: string | null;
  progress: number;
  error: string | null;
  completed: boolean;
}

interface ProfileResponse {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
  ssh_public_key?: string;
  language: string;
  created_at: string;
  last_login?: string;
}

interface PanelSettings {
  panel_name: string;
  log_retention_days: number;
  language: string;
}

export function useProfile() {
  return useQuery({
    queryKey: settingsKeys.profile,
    queryFn: () => apiClient.get<ProfileResponse>('/settings/api/profile'),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { full_name?: string; email?: string; ssh_public_key?: string }) =>
      apiClient.put<{ message: string }>('/settings/api/profile', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.profile }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string; confirm_password: string }) =>
      apiClient.post<{ message: string }>('/settings/api/change-password', data),
  });
}

export function usePanelSettings() {
  return useQuery({
    queryKey: settingsKeys.panel,
    queryFn: () => apiClient.get<PanelSettings>('/settings/api/panel'),
  });
}

export function useUpdatePanelSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PanelSettings>) =>
      apiClient.put<{ message: string }>('/settings/api/panel', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.panel }),
  });
}

export interface SecuritySettings {
  max_login_attempts: number;
  lockout_duration_minutes: number;
  session_timeout_minutes: number;
  ip_block_threshold: number;
  ip_block_duration_minutes: number;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_numbers: boolean;
  password_require_special: boolean;
}

export function useSecuritySettings() {
  return useQuery({
    queryKey: settingsKeys.security,
    queryFn: () => apiClient.get<SecuritySettings>('/admin/api/security/settings'),
  });
}

export function useUpdateSecuritySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SecuritySettings>) =>
      apiClient.put<{ message: string }>('/admin/api/security/settings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.security }),
  });
}

export function useNotificationChannels() {
  return useQuery({
    queryKey: settingsKeys.channels,
    queryFn: () => apiClient.get<{ smtp: Record<string, unknown>; telegram: Record<string, unknown> }>('/settings/api/notification-channels'),
  });
}

export function useUpdateSMTP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<{ message: string }>('/settings/api/notification-channels/smtp', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.channels }),
  });
}

export function useUpdateTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { telegram_bot_token?: string }) =>
      apiClient.put<{ message: string }>('/settings/api/notification-channels/telegram', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.channels }),
  });
}

export function useTestSMTP() {
  return useMutation({
    mutationFn: (testEmail: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/settings/api/notification-channels/smtp/test?test_email=${encodeURIComponent(testEmail)}`, {}),
  });
}

export function useTestTelegram() {
  return useMutation({
    mutationFn: (chatId: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/settings/api/notification-channels/telegram/test?chat_id=${encodeURIComponent(chatId)}`, {}),
  });
}

export function useAppVersion() {
  return useQuery({
    queryKey: settingsKeys.version,
    queryFn: () => apiClient.get<{ version: string }>('/settings/api/version'),
    staleTime: Infinity,
  });
}

export function useCheckUpdates() {
  return useMutation({
    mutationFn: () => apiClient.get<CheckUpdateResult>('/settings/api/updates/check'),
  });
}

export function useUpdateRepository() {
  return useQuery({
    queryKey: settingsKeys.updateRepository,
    queryFn: () => apiClient.get<{ repository_url: string }>('/settings/api/updates/repository'),
  });
}

export function useSetUpdateRepository() {
  const qc = useQueryClient();
  return useMutation({
    // The endpoint takes repository_url as a query parameter, not a JSON body.
    mutationFn: (repository_url: string) =>
      apiClient.put<{ message: string; repository_url: string }>(
        `/settings/api/updates/repository?repository_url=${encodeURIComponent(repository_url)}`,
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.updateRepository }),
  });
}

export function useUpdateStatus(poll = false) {
  return useQuery({
    queryKey: settingsKeys.updateStatus,
    queryFn: () => apiClient.get<UpdateStatus>('/settings/api/updates/status'),
    refetchInterval: poll ? 3000 : false,
  });
}

export function usePerformUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ success: boolean; message?: string; error?: string }>('/settings/api/updates/perform', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.updateStatus }),
  });
}

export function useResetUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ success: boolean; message: string }>('/settings/api/updates/reset', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.updateStatus }),
  });
}
