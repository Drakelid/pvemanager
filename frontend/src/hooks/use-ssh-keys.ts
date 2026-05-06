import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SSHKey {
  id: number;
  user_id: number;
  name: string;
  public_key: string;
  fingerprint: string | null;
  comment: string | null;
  has_private_key: boolean;
  created_at: string;
}

export interface CreateSSHKeyPayload {
  name: string;
  public_key: string;
  private_key?: string;
  comment?: string;
}

export interface UpdateSSHKeyPayload {
  name?: string;
  public_key?: string;
  private_key?: string;
  comment?: string;
}

export const sshKeyKeys = {
  my: ['ssh-keys', 'my'] as const,
  byUser: (userId: number) => ['ssh-keys', 'user', userId] as const,
};

// ── Self-service ────────────────────────────────────────────────────────────

export function useMySSHKeys() {
  return useQuery({
    queryKey: sshKeyKeys.my,
    queryFn: () => apiClient.get<SSHKey[]>('/api/ssh-keys/my'),
  });
}

export function useCreateMySSHKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSSHKeyPayload) =>
      apiClient.post<SSHKey>('/api/ssh-keys/my', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sshKeyKeys.my }),
  });
}

export function useUpdateMySSHKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSSHKeyPayload }) =>
      apiClient.put<SSHKey>(`/api/ssh-keys/my/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sshKeyKeys.my }),
  });
}

export function useDeleteMySSHKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<{ success: boolean; message: string }>(`/api/ssh-keys/my/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: sshKeyKeys.my }),
  });
}

export function useDownloadMyPrivateKey() {
  return useMutation({
    mutationFn: (id: number) =>
      apiClient.get<{ id: number; name: string; private_key: string }>(
        `/api/ssh-keys/my/${id}/private`,
      ),
  });
}

// ── Admin: per-user ─────────────────────────────────────────────────────────

export function useUserSSHKeys(userId: number | null | undefined) {
  return useQuery({
    queryKey: userId ? sshKeyKeys.byUser(userId) : ['ssh-keys', 'user', 'none'],
    queryFn: () =>
      apiClient.get<SSHKey[]>(`/api/ssh-keys/users/${userId}`),
    enabled: !!userId,
  });
}

export function useAdminCreateUserSSHKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: CreateSSHKeyPayload }) =>
      apiClient.post<SSHKey>(`/api/ssh-keys/users/${userId}`, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: sshKeyKeys.byUser(vars.userId) });
    },
  });
}

export function useAdminUpdateUserSSHKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, keyId, data }: { userId: number; keyId: number; data: UpdateSSHKeyPayload }) =>
      apiClient.put<SSHKey>(`/api/ssh-keys/users/${userId}/${keyId}`, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: sshKeyKeys.byUser(vars.userId) });
    },
  });
}

export function useAdminDeleteUserSSHKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, keyId }: { userId: number; keyId: number }) =>
      apiClient.delete<{ success: boolean; message: string }>(
        `/api/ssh-keys/users/${userId}/${keyId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: sshKeyKeys.byUser(vars.userId) });
    },
  });
}

export function useAdminDownloadUserPrivateKey() {
  return useMutation({
    mutationFn: ({ userId, keyId }: { userId: number; keyId: number }) =>
      apiClient.get<{ id: number; name: string; private_key: string }>(
        `/api/ssh-keys/users/${userId}/${keyId}/private`,
      ),
  });
}
