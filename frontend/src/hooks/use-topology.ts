import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { NetworkTopology } from '@/features/topology/lib/types';

export interface TopologyParams {
  serverId?: number;
  includeNics?: boolean;
  includeTemplates?: boolean;
}

export const topologyKeys = {
  all: ['network-topology'] as const,
  filtered: (params: TopologyParams) => ['network-topology', params] as const,
};

/**
 * The whole infrastructure tree in one request.
 *
 * The VM status filter is applied client-side (see build-graph) rather than
 * through `include_stopped`, so flipping it never costs a round-trip.
 */
export function useNetworkTopology(params: TopologyParams = {}) {
  const query = new URLSearchParams();
  if (params.serverId !== undefined) query.set('server_id', String(params.serverId));
  if (params.includeNics) query.set('include_nics', 'true');
  if (params.includeTemplates) query.set('include_templates', 'true');
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return useQuery({
    queryKey: topologyKeys.filtered(params),
    queryFn: () => apiClient.get<NetworkTopology>(`/proxmox/api/network/topology${suffix}`),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
