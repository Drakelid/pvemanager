import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/types';

export const userKeys = {
  users: ['users'] as const,
  user: (id: number) => ['user', id] as const,
  roles: ['roles'] as const,
  permissions: ['permissions-v2'] as const,
  sessions: ['sessions'] as const,
  blockedIps: ['blocked-ips'] as const,
  securitySettings: ['admin-security-settings'] as const,
  securityEvents: ['security-events'] as const,
};

interface Role {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
  is_active: boolean;
  user_count: number;
}

export function useUsers() {
  return useQuery({
    queryKey: userKeys.users,
    queryFn: () => apiClient.get<User[]>('/admin/api/users'),
  });
}

export function useUser(userId: number) {
  return useQuery({
    queryKey: userKeys.user(userId),
    queryFn: () => apiClient.get<User>(`/admin/api/users/${userId}`),
    enabled: userId > 0,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { username: string; email: string; password: string; full_name?: string; role_id?: number; is_active?: boolean; is_admin?: boolean }) =>
      apiClient.post<User>('/admin/api/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; email?: string; full_name?: string; role_id?: number; is_active?: boolean; is_admin?: boolean }) =>
      apiClient.put<User>(`/admin/api/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.post<{ message: string }>(`/admin/api/users/${userId}/reset-password`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => apiClient.post<{ message: string }>(`/admin/api/users/${userId}/unlock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: userKeys.roles,
    queryFn: () => apiClient.get<Role[]>('/admin/api/roles'),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; display_name: string; description?: string; permissions: string[] }) =>
      apiClient.post<Role>('/admin/api/roles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; display_name?: string; description?: string; permissions?: string[]; is_active?: boolean }) =>
      apiClient.put<Role>(`/admin/api/roles/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.roles }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/api/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.roles }),
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: userKeys.permissions,
    queryFn: () => apiClient.get<Record<string, unknown>>('/admin/api/permissions/v2'),
    staleTime: Infinity,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: userKeys.sessions,
    queryFn: () => apiClient.get<any[]>('/admin/api/sessions'),
    refetchInterval: 15000,
  });
}

export function useTerminateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/admin/api/sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.sessions }),
  });
}
