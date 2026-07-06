import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/types';

export const userKeys = {
  users: ['users'] as const,
  user: (id: number) => ['user', id] as const,
  userServers: (id: number) => ['user-server-assignments', id] as const,
  userQuota: (id: number) => ['user-quota', id] as const,
  roles: ['roles'] as const,
  permissions: ['permissions-v2'] as const,
  sessions: ['sessions'] as const,
  blockedIps: ['blocked-ips'] as const,
  securitySettings: ['admin-security-settings'] as const,
  securityEvents: ['security-events'] as const,
};

export interface Role {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  permissions: Record<string, boolean>;
  is_system: boolean;
  is_active: boolean;
  user_count: number;
  created_at?: string;
}

export interface SessionInfo {
  id: number;
  user_id: number;
  username: string;
  ip_address?: string;
  device_info?: string;
  created_at?: string;
  last_activity?: string;
  expires_at?: string;
}

export interface BlockedIp {
  id: number;
  ip_address: string;
  reason?: string;
  blocked_by?: string;
  blocked_at?: string;
  expires_at?: string;
  is_permanent: boolean;
  attempts_count?: number;
  is_active: boolean;
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

export interface SecurityEvent {
  id: number;
  event_type: string;
  ip_address?: string;
  username?: string;
  message?: string;
  created_at?: string;
}

export interface ServerAssignment {
  id: number;
  name: string;
  ip_address: string;
  is_online: boolean;
  workspaces: { id: number; name: string }[];
  compatible: boolean;
  assigned: boolean;
}

export interface UserServerAssignmentsResponse {
  servers: ServerAssignment[];
  user_workspaces: { id: number; name: string }[];
}

// ==================== Users ====================

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

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role_id?: number | null;
  is_active?: boolean;
  is_admin?: boolean;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserPayload) => apiClient.post<User>('/admin/api/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  password?: string;
  role_id?: number | null;
  is_active?: boolean;
  is_admin?: boolean;
  require_password_change?: boolean;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & UpdateUserPayload) =>
      apiClient.put<User>(`/admin/api/users/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: userKeys.users });
      qc.invalidateQueries({ queryKey: userKeys.user(vars.id) });
    },
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
    mutationFn: ({ userId, newPassword }: { userId: number; newPassword: string }) =>
      apiClient.post<{ message: string }>(`/admin/api/users/${userId}/reset-password`, {
        new_password: newPassword,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.post<{ message: string }>(`/admin/api/users/${userId}/unlock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

export function useTerminateUserSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.post<{ message: string }>(`/admin/api/users/${userId}/terminate-sessions`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.sessions }),
  });
}

export function useDisableUser2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.post<{ message: string }>(`/admin/api/users/${userId}/disable-2fa`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.users }),
  });
}

// ==================== User → Servers ====================

export function useUserServerAssignments(userId: number) {
  return useQuery({
    queryKey: userKeys.userServers(userId),
    queryFn: () =>
      apiClient.get<UserServerAssignmentsResponse>(
        `/admin/api/users/${userId}/server-assignments`
      ),
    enabled: userId > 0,
  });
}

export function useSetUserServers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, serverIds }: { userId: number; serverIds: number[] }) =>
      apiClient.put<{ message: string; server_ids: number[] }>(
        `/admin/api/users/${userId}/servers`,
        { server_ids: serverIds }
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: userKeys.userServers(vars.userId) });
      qc.invalidateQueries({ queryKey: userKeys.users });
    },
  });
}

// ==================== User → Quota ====================

export interface UserQuota {
  user_id: number;
  max_instances: number | null;
  max_cores: number | null;
  max_memory_mb: number | null;
  max_disk_gb: number | null;
  used_instances: number;
  used_cores: number;
  used_memory_mb: number;
  used_disk_gb: number;
}

export interface SetUserQuotaPayload {
  max_instances?: number | null;
  max_cores?: number | null;
  max_memory_mb?: number | null;
  max_disk_gb?: number | null;
}

export function useUserQuota(userId: number) {
  return useQuery({
    queryKey: userKeys.userQuota(userId),
    queryFn: () => apiClient.get<UserQuota>(`/admin/api/users/${userId}/quota`),
    enabled: userId > 0,
  });
}

export function useSetUserQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: number } & SetUserQuotaPayload) =>
      apiClient.put<UserQuota>(`/admin/api/users/${userId}/quota`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: userKeys.userQuota(vars.userId) });
      qc.invalidateQueries({ queryKey: userKeys.users });
    },
  });
}

// ==================== Roles ====================

export function useRoles() {
  return useQuery({
    queryKey: userKeys.roles,
    queryFn: () => apiClient.get<Role[]>('/admin/api/roles'),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      display_name: string;
      description?: string;
      permissions: Record<string, boolean>;
    }) => apiClient.post<Role>('/admin/api/roles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      display_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
      is_active?: boolean;
    }) => apiClient.put<Role>(`/admin/api/roles/${id}`, data),
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
    queryFn: () =>
      apiClient.get<Record<string, Record<string, string>>>('/admin/api/permissions/v2'),
    staleTime: Infinity,
  });
}

// ==================== Sessions ====================

export function useSessions() {
  return useQuery({
    queryKey: userKeys.sessions,
    queryFn: () => apiClient.get<SessionInfo[]>('/admin/api/sessions'),
    refetchInterval: 15000,
  });
}

export function useTerminateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => apiClient.delete(`/admin/api/sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.sessions }),
  });
}

export function useTerminateAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>('/admin/api/sessions/terminate-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.sessions }),
  });
}

// ==================== Security ====================

export function useSecuritySettings() {
  return useQuery({
    queryKey: userKeys.securitySettings,
    queryFn: () => apiClient.get<SecuritySettings>('/admin/api/security/settings'),
  });
}

export function useUpdateSecuritySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SecuritySettings>) =>
      apiClient.put<{ message: string; updated: string[] }>(
        '/admin/api/security/settings',
        data
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.securitySettings }),
  });
}

export function useBlockedIps() {
  return useQuery({
    queryKey: userKeys.blockedIps,
    queryFn: () => apiClient.get<BlockedIp[]>('/admin/api/security/blocked-ips'),
    refetchInterval: 30000,
  });
}

export function useBlockIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ip_address: string; reason?: string; duration_minutes?: number }) =>
      apiClient.post<{ message: string; id: number }>('/admin/api/security/blocked-ips', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.blockedIps }),
  });
}

export function useUnblockIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/api/security/blocked-ips/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.blockedIps }),
  });
}

export function useSecurityEvents(limit = 50) {
  return useQuery({
    queryKey: [...userKeys.securityEvents, limit],
    queryFn: () =>
      apiClient.get<SecurityEvent[]>(`/admin/api/security/events?limit=${limit}`),
    refetchInterval: 30000,
  });
}
