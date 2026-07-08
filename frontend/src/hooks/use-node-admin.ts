import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface NodeService {
  service: string;
  name?: string;
  desc?: string;
  state?: string;         // running | stopped | dead | ...
  'active-state'?: string;
  'unit-state'?: string;
}

export interface AptUpdate {
  Package: string;
  Version?: string;
  OldVersion?: string;
  Title?: string;
  Description?: string;
  Priority?: string;
}

export interface AptRepo {
  Enabled?: number | boolean;
  Types?: string[];
  URIs?: string[];
  Suites?: string[];
  Components?: string[];
  Comment?: string;
}

export interface AptRepoFile {
  path: string;
  'file-type'?: string;
  repositories?: AptRepo[];
}

export interface AptRepositories {
  files?: AptRepoFile[];
  'standard-repos'?: Array<{ handle: string; name: string; status?: number }>;
  errors?: unknown[];
}

export interface NodeTask {
  upid: string;
  type?: string;
  id?: string;
  user?: string;
  status?: string;      // stopped | running | ...
  starttime?: number;
  endtime?: number;
  pid?: number;
  node?: string;
}

export interface LogLine {
  n: number;
  t: string;
}

export interface NodeDns {
  search?: string;
  dns1?: string;
  dns2?: string;
  dns3?: string;
}

export interface NodeHosts {
  data?: string;
  digest?: string;
}

export interface NodeTime {
  timezone?: string;
  time?: number;
  localtime?: number;
}

export interface NodeCertificate {
  filename?: string;
  fingerprint?: string;
  subject?: string;
  issuer?: string;
  notbefore?: number;
  notafter?: number;
  san?: string[];
  pem?: string;
  'public-key-type'?: string;
  'public-key-bits'?: number;
}

export const nodeAdminKeys = {
  services: (s: number, n: string) => ['node-services', s, n] as const,
  updates: (s: number, n: string) => ['apt-updates', s, n] as const,
  repos: (s: number, n: string) => ['apt-repos', s, n] as const,
  syslog: (s: number, n: string) => ['node-syslog', s, n] as const,
  tasks: (s: number, n: string) => ['node-tasks', s, n] as const,
  taskLog: (s: number, n: string, upid: string) => ['node-task-log', s, n, upid] as const,
  dns: (s: number, n: string) => ['node-dns', s, n] as const,
  hosts: (s: number, n: string) => ['node-hosts', s, n] as const,
  time: (s: number, n: string) => ['node-time', s, n] as const,
  certificates: (s: number, n: string) => ['node-certificates', s, n] as const,
};

const base = (s: number, n: string) => `/proxmox/api/servers/${s}/nodes/${n}`;

// ---------- Power (reboot / shutdown) ----------
export function useNodePower(serverId: number, node: string) {
  return useMutation({
    mutationFn: (command: 'reboot' | 'shutdown') =>
      apiClient.post(`${base(serverId, node)}/status`, { command }),
  });
}

// ---------- Syslog ----------
export function useNodeSyslog(serverId: number, node: string, enabled = true, limit = 500) {
  return useQuery({
    queryKey: nodeAdminKeys.syslog(serverId, node),
    queryFn: () => apiClient.get<{ syslog: LogLine[] }>(`${base(serverId, node)}/syslog?limit=${limit}`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

// ---------- Task history ----------
export function useNodeTasks(serverId: number, node: string, enabled = true, limit = 100) {
  return useQuery({
    queryKey: nodeAdminKeys.tasks(serverId, node),
    queryFn: () => apiClient.get<{ tasks: NodeTask[] }>(`${base(serverId, node)}/tasks?limit=${limit}`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useNodeTaskLog(serverId: number, node: string, upid: string | null) {
  return useQuery({
    queryKey: nodeAdminKeys.taskLog(serverId, node, upid ?? ''),
    queryFn: () => apiClient.get<{ log: LogLine[]; status: Record<string, unknown> }>(
      `${base(serverId, node)}/tasks/${encodeURIComponent(upid ?? '')}/log`),
    enabled: serverId > 0 && !!node && !!upid,
  });
}

// ---------- System: DNS / hosts / time ----------
export function useNodeDns(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.dns(serverId, node),
    queryFn: () => apiClient.get<{ dns: NodeDns }>(`${base(serverId, node)}/dns`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useSetNodeDns(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NodeDns) => apiClient.put(`${base(serverId, node)}/dns`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.dns(serverId, node) }),
  });
}

export function useNodeHosts(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.hosts(serverId, node),
    queryFn: () => apiClient.get<{ hosts: NodeHosts }>(`${base(serverId, node)}/hosts`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useSetNodeHosts(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { data: string; digest?: string }) =>
      apiClient.post(`${base(serverId, node)}/hosts`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.hosts(serverId, node) }),
  });
}

export function useNodeTime(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.time(serverId, node),
    queryFn: () => apiClient.get<{ time: NodeTime }>(`${base(serverId, node)}/time`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useSetNodeTimezone(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timezone: string) => apiClient.put(`${base(serverId, node)}/time`, { timezone }),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.time(serverId, node) }),
  });
}

// ---------- Services ----------
export function useNodeServices(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.services(serverId, node),
    queryFn: () => apiClient.get<{ services: NodeService[] }>(`${base(serverId, node)}/services`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useServiceAction(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ service, action }: { service: string; action: string }) =>
      apiClient.post(`${base(serverId, node)}/services/${service}/${action}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.services(serverId, node) }),
  });
}

// ---------- APT ----------
export function useAptUpdates(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.updates(serverId, node),
    queryFn: () => apiClient.get<{ updates: AptUpdate[] }>(`${base(serverId, node)}/apt/updates`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useAptRefresh(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post(`${base(serverId, node)}/apt/refresh`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.updates(serverId, node) }),
  });
}

export function useAptRepositories(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.repos(serverId, node),
    queryFn: () => apiClient.get<{ repositories: AptRepositories }>(`${base(serverId, node)}/apt/repositories`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useSetAptRepository(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { path: string; index: number; enabled: boolean }) =>
      apiClient.post(`${base(serverId, node)}/apt/repositories`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.repos(serverId, node) }),
  });
}

// ---------- TLS certificates ----------
export function useNodeCertificates(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: nodeAdminKeys.certificates(serverId, node),
    queryFn: () => apiClient.get<{ certificates: NodeCertificate[] }>(`${base(serverId, node)}/certificates`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useUploadNodeCertificate(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { certificates: string; key?: string; force?: boolean; restart?: boolean }) =>
      apiClient.post(`${base(serverId, node)}/certificates`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.certificates(serverId, node) }),
  });
}

export function useDeleteNodeCertificate(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, boolean>({
    mutationFn: (restart) =>
      apiClient.delete(`${base(serverId, node)}/certificates?restart=${restart ? 'true' : 'false'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeAdminKeys.certificates(serverId, node) }),
  });
}
