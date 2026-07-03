import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Realm {
  realm: string;
  type: string;      // pam | pve | ldap | ad | openid
  comment?: string;
  tfa?: string;
}

export interface AccessUser {
  userid: string;
  enable?: number;
  comment?: string;
  email?: string;
}

export interface ApiToken {
  tokenid: string;
  comment?: string;
  expire?: number;
  privsep?: number;
}

export const accessKeys = {
  realms: (s: number) => ['access-realms', s] as const,
  users: (s: number) => ['access-users', s] as const,
  tokens: (s: number, u: string) => ['access-tokens', s, u] as const,
};

const base = (s: number) => `/proxmox/api/servers/${s}/access`;

// ---------- Realms ----------
export function useRealms(serverId: number, enabled = true) {
  return useQuery({
    queryKey: accessKeys.realms(serverId),
    queryFn: () => apiClient.get<{ realms: Realm[] }>(`${base(serverId)}/realms`),
    enabled: serverId > 0 && enabled,
  });
}

export function useCreateRealm(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post(`${base(serverId)}/realms`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.realms(serverId) }),
  });
}

export function useDeleteRealm(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (realm: string) => apiClient.delete(`${base(serverId)}/realms/${realm}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.realms(serverId) }),
  });
}

// ---------- Users & tokens ----------
export function useAccessUsers(serverId: number, enabled = true) {
  return useQuery({
    queryKey: accessKeys.users(serverId),
    queryFn: () => apiClient.get<{ users: AccessUser[] }>(`${base(serverId)}/users`),
    enabled: serverId > 0 && enabled,
  });
}

export function useUserTokens(serverId: number, userid: string, enabled = true) {
  return useQuery({
    queryKey: accessKeys.tokens(serverId, userid),
    queryFn: () => apiClient.get<{ tokens: ApiToken[] }>(`${base(serverId)}/users/${encodeURIComponent(userid)}/tokens`),
    enabled: serverId > 0 && !!userid && enabled,
  });
}

export interface CreatedToken {
  success: boolean;
  value?: string;
  full_tokenid?: string;
}

export function useCreateToken(serverId: number) {
  const qc = useQueryClient();
  return useMutation<CreatedToken, Error, { userid: string; tokenid: string; comment?: string; privsep: boolean }>({
    mutationFn: ({ userid, tokenid, ...data }) =>
      apiClient.post(`${base(serverId)}/users/${encodeURIComponent(userid)}/tokens/${encodeURIComponent(tokenid)}`, data),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: accessKeys.tokens(serverId, v.userid) }),
  });
}

export function useDeleteToken(serverId: number, userid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenid: string) =>
      apiClient.delete(`${base(serverId)}/users/${encodeURIComponent(userid)}/tokens/${encodeURIComponent(tokenid)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKeys.tokens(serverId, userid) }),
  });
}
