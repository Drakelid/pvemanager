import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SDNStatus, SDNZone, SDNVNet, SDNSubnet } from '@/types';

export const sdnKeys = {
  status: (serverId: number) => ['sdn-status', serverId] as const,
  zones: (serverId: number) => ['sdn-zones', serverId] as const,
  vnets: (serverId: number) => ['sdn-vnets', serverId] as const,
  subnets: (serverId: number, vnet: string) => ['sdn-subnets', serverId, vnet] as const,
};

export function useSDNStatus(serverId: number) {
  return useQuery({
    queryKey: sdnKeys.status(serverId),
    queryFn: () => apiClient.get<SDNStatus>(`/proxmox/api/servers/${serverId}/sdn/status`),
    enabled: serverId > 0,
  });
}

export function useSDNZones(serverId: number, enabled = true) {
  return useQuery({
    queryKey: sdnKeys.zones(serverId),
    queryFn: () => apiClient.get<{ zones: SDNZone[] }>(`/proxmox/api/servers/${serverId}/sdn/zones`),
    enabled: serverId > 0 && enabled,
  });
}

export function useSDNVNets(serverId: number, enabled = true) {
  return useQuery({
    queryKey: sdnKeys.vnets(serverId),
    queryFn: () => apiClient.get<{ vnets: SDNVNet[] }>(`/proxmox/api/servers/${serverId}/sdn/vnets`),
    enabled: serverId > 0 && enabled,
  });
}

export function useSDNSubnets(serverId: number, vnet: string) {
  return useQuery({
    queryKey: sdnKeys.subnets(serverId, vnet),
    queryFn: () => apiClient.get<{ subnets: SDNSubnet[] }>(`/proxmox/api/servers/${serverId}/sdn/vnets/${vnet}/subnets`),
    enabled: serverId > 0 && !!vnet,
  });
}

export interface SDNDnsEntry {
  dns: string;
  type?: string;
  url?: string;
}

export function useSDNDns(serverId: number, enabled = true) {
  return useQuery({
    queryKey: ['sdn-dns', serverId] as const,
    queryFn: () => apiClient.get<{ dns: SDNDnsEntry[] }>(`/proxmox/api/servers/${serverId}/sdn/dns`),
    enabled: serverId > 0 && enabled,
  });
}

// Invalidate the SDN status (pending indicator) alongside the changed entity.
function useSDNInvalidator(serverId: number) {
  const qc = useQueryClient();
  return (...keys: readonly unknown[][]) => {
    qc.invalidateQueries({ queryKey: sdnKeys.status(serverId) });
    keys.forEach(k => qc.invalidateQueries({ queryKey: k }));
  };
}

export function useCreateSDNZone(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`/proxmox/api/servers/${serverId}/sdn/zones`, data),
    onSuccess: () => invalidate(sdnKeys.zones(serverId)),
  });
}

export function useUpdateSDNZone(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: ({ zone, ...data }: { zone: string } & Record<string, unknown>) =>
      apiClient.put(`/proxmox/api/servers/${serverId}/sdn/zones/${zone}`, data),
    onSuccess: () => invalidate(sdnKeys.zones(serverId)),
  });
}

export function useDeleteSDNZone(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: (zone: string) =>
      apiClient.delete(`/proxmox/api/servers/${serverId}/sdn/zones/${zone}`),
    onSuccess: () => invalidate(sdnKeys.zones(serverId)),
  });
}

export function useCreateSDNVNet(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post(`/proxmox/api/servers/${serverId}/sdn/vnets`, data),
    onSuccess: () => invalidate(sdnKeys.vnets(serverId)),
  });
}

export function useUpdateSDNVNet(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: ({ vnet, ...data }: { vnet: string } & Record<string, unknown>) =>
      apiClient.put(`/proxmox/api/servers/${serverId}/sdn/vnets/${vnet}`, data),
    onSuccess: () => invalidate(sdnKeys.vnets(serverId)),
  });
}

export function useDeleteSDNVNet(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: (vnet: string) =>
      apiClient.delete(`/proxmox/api/servers/${serverId}/sdn/vnets/${vnet}`),
    onSuccess: () => invalidate(sdnKeys.vnets(serverId)),
  });
}

export function useCreateSDNSubnet(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: ({ vnet, ...data }: { vnet: string } & Record<string, unknown>) =>
      apiClient.post(`/proxmox/api/servers/${serverId}/sdn/vnets/${vnet}/subnets`, data),
    onSuccess: (_d, vars) => invalidate(sdnKeys.subnets(serverId, vars.vnet)),
  });
}

export function useDeleteSDNSubnet(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    // PVE identifies a subnet by its full id "{zone}-{network}-{mask}" (dash-encoded),
    // e.g. "zone1-10.0.0.0-24" — pass that id, not just the CIDR, or the delete fails.
    mutationFn: ({ vnet, subnetId, deleteIpam }: { vnet: string; subnetId: string; deleteIpam?: boolean }) => {
      const dash = subnetId.replace('/', '-');
      const qs = deleteIpam ? '?delete_ipam_network=true' : '';
      return apiClient.delete(`/proxmox/api/servers/${serverId}/sdn/vnets/${vnet}/subnets/${dash}${qs}`);
    },
    onSuccess: (_d, vars) => invalidate(sdnKeys.subnets(serverId, vars.vnet)),
  });
}

export function useApplySDN(serverId: number) {
  const invalidate = useSDNInvalidator(serverId);
  return useMutation({
    mutationFn: () => apiClient.post(`/proxmox/api/servers/${serverId}/sdn/apply`, {}),
    onSuccess: () => invalidate(sdnKeys.zones(serverId), sdnKeys.vnets(serverId)),
  });
}
