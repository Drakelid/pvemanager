import type { Edge, Node } from '@xyflow/react';
import { layoutTree, type LayoutNode } from './layout';
import type { NetworkTopology, TopologyFilters, TopologyGuest } from './types';

const PANEL_ID = 'panel:root';
// Wrapping earlier keeps the tree closer to the viewport's aspect ratio:
// one tall column per node forces fitView to shrink everything to a ribbon.
const GUESTS_PER_COLUMN = 6;

export interface BuildGraphResult {
  nodes: Node[];
  edges: Edge[];
  /** Guests left out by the status filter — shown in the toolbar counter. */
  filteredOut: number;
}

function matchesStatus(guest: TopologyGuest, filter: TopologyFilters['vmStatus']): boolean {
  if (filter === 'all') return true;
  if (filter === 'running') return guest.status === 'running';
  return guest.status !== 'running';
}

/**
 * Turns the API hierarchy into React Flow nodes and edges.
 *
 * Pure and synchronous so it can live inside a `useMemo` and rerun on every
 * filter or slider change. Edges are derived from nesting — the API does not
 * ship them.
 */
export function buildGraph(
  data: NetworkTopology | undefined,
  filters: TopologyFilters,
  expanded: Set<string>,
): BuildGraphResult {
  if (!data) return { nodes: [], edges: [], filteredOut: 0 };

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let filteredOut = 0;
  let widestGuestList = 0;

  const tree: LayoutNode = { id: PANEL_ID, kind: 'panel', children: [] };

  const clusters =
    filters.serverId === 'all'
      ? data.clusters
      : data.clusters.filter((cluster) => cluster.server_ids.includes(filters.serverId as number));

  nodes.push({
    id: PANEL_ID,
    type: 'panel',
    position: { x: 0, y: 0 },
    data: { panel: data.panel },
    draggable: false,
  });

  for (const cluster of clusters) {
    const clusterBranch: LayoutNode = { id: cluster.id, kind: 'cluster', children: [] };
    const pveNodes =
      filters.serverId === 'all'
        ? cluster.nodes
        : cluster.nodes.filter((node) => node.server_id === filters.serverId);
    if (pveNodes.length === 0) continue;

    let clusterGuests = 0;

    for (const node of pveNodes) {
      const visible = node.guests.filter((guest) => matchesStatus(guest, filters.vmStatus));
      filteredOut += node.guests.length - visible.length;
      clusterGuests += visible.length;

      const nodeBranch: LayoutNode = { id: node.id, kind: 'pve', children: [] };

      const collapse =
        filters.groupThreshold > 0 &&
        visible.length > filters.groupThreshold &&
        !expanded.has(node.id);

      if (collapse) {
        const groupId = `${node.id}:group`;
        const running = visible.filter((guest) => guest.status === 'running').length;
        nodes.push({
          id: groupId,
          type: 'guestGroup',
          position: { x: 0, y: 0 },
          data: {
            parentId: node.id,
            total: visible.length,
            running,
            stopped: visible.length - running,
          },
          draggable: false,
        });
        edges.push({ id: `e:${node.id}:${groupId}`, source: node.id, target: groupId });
        nodeBranch.children.push({ id: groupId, kind: 'guestGroup', children: [] });
      } else {
        widestGuestList = Math.max(widestGuestList, visible.length);
        for (const guest of visible) {
          nodes.push({
            id: guest.id,
            type: 'guest',
            position: { x: 0, y: 0 },
            data: { guest },
            draggable: false,
          });
          edges.push({ id: `e:${node.id}:${guest.id}`, source: node.id, target: guest.id });
          nodeBranch.children.push({ id: guest.id, kind: 'guest', children: [] });
        }
      }

      nodes.push({
        id: node.id,
        type: 'pve',
        position: { x: 0, y: 0 },
        data: { node, guestCount: visible.length },
        draggable: false,
      });
      edges.push({ id: `e:${cluster.id}:${node.id}`, source: cluster.id, target: node.id });
      clusterBranch.children.push(nodeBranch);
    }

    nodes.push({
      id: cluster.id,
      type: 'cluster',
      position: { x: 0, y: 0 },
      data: { cluster, nodeCount: pveNodes.length, guestCount: clusterGuests },
      draggable: false,
    });
    edges.push({ id: `e:${PANEL_ID}:${cluster.id}`, source: PANEL_ID, target: cluster.id });
    tree.children.push(clusterBranch);
  }

  // A single column of dozens of guests makes the graph a thin unreadable
  // ribbon, so long lists wrap into a block once they exceed this.
  const positions = layoutTree(tree, {
    guestsPerColumn: widestGuestList > GUESTS_PER_COLUMN + 2 ? GUESTS_PER_COLUMN : undefined,
  });
  for (const node of nodes) {
    const position = positions.get(node.id);
    if (position) node.position = position;
  }

  return { nodes, edges, filteredOut };
}

/** Connections present in the response, for the toolbar's connection filter. */
export function listConnections(data: NetworkTopology | undefined): Array<{ id: number; name: string }> {
  if (!data) return [];
  const byId = new Map<number, string>();
  for (const cluster of data.clusters) {
    for (const node of cluster.nodes) {
      if (!byId.has(node.server_id)) byId.set(node.server_id, node.server_name);
    }
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
