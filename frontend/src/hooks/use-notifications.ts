import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Notification } from '@/types';

export const notificationKeys = {
  list: (params?: Record<string, unknown>) => ['notifications', params] as const,
  unreadCount: ['notifications-unread-count'] as const,
  preferences: ['notification-preferences'] as const,
};

interface NotificationListResponse {
  total: number;
  unread_count: number;
  notifications: Notification[];
}

export function useNotifications(params?: { unread_only?: boolean; level?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.unread_only) qs.set('unread_only', 'true');
  if (params?.level) qs.set('level', params.level);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => apiClient.get<NotificationListResponse>(`/api/notifications/?${qs}`),
    refetchInterval: 30000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () => apiClient.get<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 15000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.patch<Notification>(`/api/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>('/api/notifications/mark-all-read'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}

export function useDeleteAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete('/api/notifications/read/all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ==================== Preferences & channels ====================

export interface NotificationPreferences {
  id: number;
  user_id: number;
  enabled: boolean;
  email_enabled: boolean;
  email_critical_only: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  webhook_url: string | null;
  notification_levels: string[];
  notification_types: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: () => apiClient.get<NotificationPreferences>('/api/notifications/preferences'),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<NotificationPreferences>) =>
      apiClient.put<NotificationPreferences>('/api/notifications/preferences', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.preferences }),
  });
}

export function useChannelsStatus() {
  return useQuery({
    queryKey: ['notification-channels-status'],
    queryFn: () => apiClient.get<Record<string, unknown>>('/api/notifications/channels/status'),
  });
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: (channel: string) =>
      apiClient.post<Record<string, unknown>>(`/api/notifications/test?channel=${encodeURIComponent(channel)}`, {}),
  });
}

export function useVerifyTelegramChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) =>
      apiClient.post<{ success: boolean; message: string; chat_id: string }>(`/api/notifications/telegram/verify?chat_id=${encodeURIComponent(chatId)}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.preferences }),
  });
}

export function useTelegramBotInfo() {
  return useQuery({
    queryKey: ['telegram-bot-info'],
    queryFn: () => apiClient.get<{ configured: boolean; bot_info: Record<string, unknown> | null }>('/api/notifications/telegram/bot-info'),
  });
}
