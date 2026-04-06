import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const settingsKeys = {
  profile: ['settings-profile'] as const,
  panel: ['settings-panel'] as const,
  security: ['settings-security'] as const,
  channels: ['notification-channels'] as const,
  version: ['app-version'] as const,
};

interface ProfileResponse {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
  ssh_public_key?: string;
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

export function useSecuritySettings() {
  return useQuery({
    queryKey: settingsKeys.security,
    queryFn: () => apiClient.get<{ single_session_enabled: boolean; max_login_attempts?: number; lockout_duration?: number; session_timeout?: number }>('/settings/api/security-settings'),
  });
}

export function useUpdateSecuritySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { single_session_enabled?: boolean; max_login_attempts?: number; lockout_duration?: number; session_timeout?: number }) =>
      apiClient.put<{ message: string }>('/settings/api/security-settings', data),
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

export function useAppVersion() {
  return useQuery({
    queryKey: settingsKeys.version,
    queryFn: () => apiClient.get<{ version: string }>('/settings/api/version'),
    staleTime: Infinity,
  });
}

export function useCheckUpdates() {
  return useMutation({
    mutationFn: () => apiClient.get<Record<string, unknown>>('/settings/api/updates/check'),
  });
}
