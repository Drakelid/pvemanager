import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ==================== Types ====================
export interface FirewallRule {
  pos?: number;
  type: string;          // 'in' | 'out' | 'group'
  action: string;        // ACCEPT | DROP | REJECT | <security group name>
  enable?: number;
  source?: string;
  dest?: string;
  proto?: string;
  dport?: string;
  sport?: string;
  macro?: string;
  iface?: string;
  log?: string;
  comment?: string;
}

export interface FirewallGroup {
  group: string;
  comment?: string;
  digest?: string;
}

export interface FirewallIpset {
  name: string;
  comment?: string;
  digest?: string;
}

export interface IpsetEntry {
  cidr: string;
  comment?: string;
  nomatch?: number;
}

export interface FirewallAlias {
  name: string;
  cidr: string;
  comment?: string;
  ipversion?: number;
}

export interface FirewallOptions {
  enable?: number;
  policy_in?: string;
  policy_out?: string;
  log_ratelimit?: string;
  [key: string]: unknown;
}

export interface FirewallMacro {
  macro: string;
  descr?: string;
}

export interface FirewallLogLine {
  n?: number;
  t?: string;
}

// ==================== Query keys ====================
export const fwKeys = {
  options: (s: number) => ['fw-options', s] as const,
  rules: (s: number) => ['fw-rules', s] as const,
  groups: (s: number) => ['fw-groups', s] as const,
  groupRules: (s: number, g: string) => ['fw-group-rules', s, g] as const,
  ipsets: (s: number) => ['fw-ipsets', s] as const,
  ipsetEntries: (s: number, n: string) => ['fw-ipset-entries', s, n] as const,
  aliases: (s: number) => ['fw-aliases', s] as const,
  macros: (s: number) => ['fw-macros', s] as const,
  nodeOptions: (s: number, n: string) => ['fw-node-options', s, n] as const,
  nodeRules: (s: number, n: string) => ['fw-node-rules', s, n] as const,
  nodeLog: (s: number, n: string) => ['fw-node-log', s, n] as const,
  guestOptions: (s: number, t: string, v: number) => ['fw-guest-options', s, t, v] as const,
  guestRules: (s: number, t: string, v: number) => ['fw-guest-rules', s, t, v] as const,
  guestLog: (s: number, t: string, v: number) => ['fw-guest-log', s, t, v] as const,
};

const base = (s: number) => `/proxmox/api/servers/${s}/firewall`;

// ==================== Options ====================
export function useFirewallOptions(serverId: number, enabled = true) {
  return useQuery({
    queryKey: fwKeys.options(serverId),
    queryFn: () => apiClient.get<{ options: FirewallOptions }>(`${base(serverId)}/options`),
    enabled: serverId > 0 && enabled,
  });
}

export function useUpdateFirewallOptions(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.put(`${base(serverId)}/options`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.options(serverId) }),
  });
}

// ==================== Datacenter rules ====================
export function useFirewallRules(serverId: number, enabled = true) {
  return useQuery({
    queryKey: fwKeys.rules(serverId),
    queryFn: () => apiClient.get<{ rules: FirewallRule[] }>(`${base(serverId)}/rules`),
    enabled: serverId > 0 && enabled,
  });
}

export function useCreateFirewallRule(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post(`${base(serverId)}/rules`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.rules(serverId) }),
  });
}

export function useUpdateFirewallRule(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pos, data }: { pos: number; data: Record<string, unknown> }) =>
      apiClient.put(`${base(serverId)}/rules/${pos}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.rules(serverId) }),
  });
}

export function useDeleteFirewallRule(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pos: number) => apiClient.delete(`${base(serverId)}/rules/${pos}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.rules(serverId) }),
  });
}

// ==================== Security groups ====================
export function useFirewallGroups(serverId: number, enabled = true) {
  return useQuery({
    queryKey: fwKeys.groups(serverId),
    queryFn: () => apiClient.get<{ groups: FirewallGroup[] }>(`${base(serverId)}/groups`),
    enabled: serverId > 0 && enabled,
  });
}

export function useCreateFirewallGroup(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { group: string; comment?: string }) => apiClient.post(`${base(serverId)}/groups`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.groups(serverId) }),
  });
}

export function useDeleteFirewallGroup(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (group: string) => apiClient.delete(`${base(serverId)}/groups/${group}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.groups(serverId) }),
  });
}

export function useFirewallGroupRules(serverId: number, group: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.groupRules(serverId, group),
    queryFn: () => apiClient.get<{ rules: FirewallRule[] }>(`${base(serverId)}/groups/${group}/rules`),
    enabled: serverId > 0 && !!group && enabled,
  });
}

export function useCreateFirewallGroupRule(serverId: number, group: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post(`${base(serverId)}/groups/${group}/rules`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.groupRules(serverId, group) }),
  });
}

export function useDeleteFirewallGroupRule(serverId: number, group: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pos: number) => apiClient.delete(`${base(serverId)}/groups/${group}/rules/${pos}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.groupRules(serverId, group) }),
  });
}

// ==================== IP sets ====================
export function useFirewallIpsets(serverId: number, enabled = true) {
  return useQuery({
    queryKey: fwKeys.ipsets(serverId),
    queryFn: () => apiClient.get<{ ipsets: FirewallIpset[] }>(`${base(serverId)}/ipsets`),
    enabled: serverId > 0 && enabled,
  });
}

export function useCreateFirewallIpset(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; comment?: string }) => apiClient.post(`${base(serverId)}/ipsets`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.ipsets(serverId) }),
  });
}

export function useDeleteFirewallIpset(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.delete(`${base(serverId)}/ipsets/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.ipsets(serverId) }),
  });
}

export function useFirewallIpsetEntries(serverId: number, name: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.ipsetEntries(serverId, name),
    queryFn: () => apiClient.get<{ entries: IpsetEntry[] }>(`${base(serverId)}/ipsets/${name}/entries`),
    enabled: serverId > 0 && !!name && enabled,
  });
}

export function useAddIpsetEntry(serverId: number, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { cidr: string; comment?: string; nomatch?: boolean }) =>
      apiClient.post(`${base(serverId)}/ipsets/${name}/entries`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.ipsetEntries(serverId, name) }),
  });
}

export function useDeleteIpsetEntry(serverId: number, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cidr: string) =>
      apiClient.delete(`${base(serverId)}/ipsets/${name}/entries?cidr=${encodeURIComponent(cidr)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.ipsetEntries(serverId, name) }),
  });
}

// ==================== Aliases ====================
export function useFirewallAliases(serverId: number, enabled = true) {
  return useQuery({
    queryKey: fwKeys.aliases(serverId),
    queryFn: () => apiClient.get<{ aliases: FirewallAlias[] }>(`${base(serverId)}/aliases`),
    enabled: serverId > 0 && enabled,
  });
}

export function useCreateFirewallAlias(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; cidr: string; comment?: string }) =>
      apiClient.post(`${base(serverId)}/aliases`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.aliases(serverId) }),
  });
}

export function useUpdateFirewallAlias(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Record<string, unknown> }) =>
      apiClient.put(`${base(serverId)}/aliases/${name}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.aliases(serverId) }),
  });
}

export function useDeleteFirewallAlias(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.delete(`${base(serverId)}/aliases/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.aliases(serverId) }),
  });
}

// ==================== Node-level ====================
const nodeBase = (s: number, n: string) => `/proxmox/api/servers/${s}/nodes/${n}/firewall`;

export function useNodeFirewallOptions(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.nodeOptions(serverId, node),
    queryFn: () => apiClient.get<{ options: FirewallOptions }>(`${nodeBase(serverId, node)}/options`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useUpdateNodeFirewallOptions(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.put(`${nodeBase(serverId, node)}/options`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.nodeOptions(serverId, node) }),
  });
}

export function useNodeFirewallRules(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.nodeRules(serverId, node),
    queryFn: () => apiClient.get<{ rules: FirewallRule[] }>(`${nodeBase(serverId, node)}/rules`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

export function useCreateNodeFirewallRule(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post(`${nodeBase(serverId, node)}/rules`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.nodeRules(serverId, node) }),
  });
}

export function useUpdateNodeFirewallRule(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pos, data }: { pos: number; data: Record<string, unknown> }) =>
      apiClient.put(`${nodeBase(serverId, node)}/rules/${pos}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.nodeRules(serverId, node) }),
  });
}

export function useDeleteNodeFirewallRule(serverId: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pos: number) => apiClient.delete(`${nodeBase(serverId, node)}/rules/${pos}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.nodeRules(serverId, node) }),
  });
}

export function useNodeFirewallLog(serverId: number, node: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.nodeLog(serverId, node),
    queryFn: () => apiClient.get<{ log: FirewallLogLine[] }>(`${nodeBase(serverId, node)}/log?limit=200`),
    enabled: serverId > 0 && !!node && enabled,
  });
}

// ==================== Guest-level (VM/LXC) ====================
const guestBase = (s: number, t: string, v: number) => `/proxmox/api/servers/${s}/guests/${t}/${v}/firewall`;

export function useGuestFirewallOptions(serverId: number, vmType: string, vmid: number, node: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.guestOptions(serverId, vmType, vmid),
    queryFn: () => apiClient.get<{ options: FirewallOptions }>(`${guestBase(serverId, vmType, vmid)}/options?node=${node}`),
    enabled: serverId > 0 && !!node && vmid > 0 && enabled,
  });
}

export function useUpdateGuestFirewallOptions(serverId: number, vmType: string, vmid: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put(`${guestBase(serverId, vmType, vmid)}/options?node=${node}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.guestOptions(serverId, vmType, vmid) }),
  });
}

export function useGuestFirewallRules(serverId: number, vmType: string, vmid: number, node: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.guestRules(serverId, vmType, vmid),
    queryFn: () => apiClient.get<{ rules: FirewallRule[] }>(`${guestBase(serverId, vmType, vmid)}/rules?node=${node}`),
    enabled: serverId > 0 && !!node && vmid > 0 && enabled,
  });
}

export function useCreateGuestFirewallRule(serverId: number, vmType: string, vmid: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`${guestBase(serverId, vmType, vmid)}/rules?node=${node}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.guestRules(serverId, vmType, vmid) }),
  });
}

export function useUpdateGuestFirewallRule(serverId: number, vmType: string, vmid: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pos, data }: { pos: number; data: Record<string, unknown> }) =>
      apiClient.put(`${guestBase(serverId, vmType, vmid)}/rules/${pos}?node=${node}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.guestRules(serverId, vmType, vmid) }),
  });
}

export function useDeleteGuestFirewallRule(serverId: number, vmType: string, vmid: number, node: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pos: number) =>
      apiClient.delete(`${guestBase(serverId, vmType, vmid)}/rules/${pos}?node=${node}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fwKeys.guestRules(serverId, vmType, vmid) }),
  });
}

export function useGuestFirewallLog(serverId: number, vmType: string, vmid: number, node: string, enabled = true) {
  return useQuery({
    queryKey: fwKeys.guestLog(serverId, vmType, vmid),
    queryFn: () => apiClient.get<{ log: FirewallLogLine[] }>(`${guestBase(serverId, vmType, vmid)}/log?node=${node}&limit=200`),
    enabled: serverId > 0 && !!node && vmid > 0 && enabled,
  });
}
