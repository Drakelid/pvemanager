/**
 * Tidy-tree layout for the topology graph.
 *
 * The graph is a strict tree of fixed depth (panel → cluster → node → guest),
 * so a dedicated layout engine would be all cost and no benefit: this is ~60
 * synchronous lines, deterministic, and O(n) — it can rerun on every slider
 * tick without the flicker an async layout pass introduces.
 *
 * Orientation is top-to-bottom: each depth level is a fixed row, siblings
 * spread out horizontally within it.
 */

export type LayoutKind = 'panel' | 'cluster' | 'pve' | 'guest' | 'guestGroup';

export interface LayoutNode {
  id: string;
  kind: LayoutKind;
  children: LayoutNode[];
}

export interface XY {
  x: number;
  y: number;
}

/** Fixed vertical position of every depth level. */
export const ROW_Y: Record<LayoutKind, number> = {
  panel: 0,
  cluster: 200,
  pve: 420,
  guest: 640,
  guestGroup: 640,
};

export const NODE_SIZE: Record<LayoutKind, { width: number; height: number }> = {
  panel: { width: 230, height: 92 },
  cluster: { width: 250, height: 96 },
  pve: { width: 270, height: 132 },
  guest: { width: 250, height: 84 },
  guestGroup: { width: 250, height: 96 },
};

const GAP_X = 30;
const SUBTREE_GAP = 40;
const ROW_GAP_Y = 26;

export interface LayoutOptions {
  /**
   * Wrap a node's guests into extra rows once the list is longer than this.
   * Keeps a busy node from stretching the graph into an unreadable ribbon.
   */
  guestsPerRow?: number;
}

/** How many rows a node's guest list is wrapped into. */
function rowsFor(node: LayoutNode, opts: LayoutOptions): number {
  if (node.kind !== 'pve' || !opts.guestsPerRow) return 1;
  return Math.max(1, Math.ceil(node.children.length / opts.guestsPerRow));
}

/** Horizontal space a subtree needs, including the gaps between its children. */
function subtreeWidth(node: LayoutNode, opts: LayoutOptions): number {
  const own = NODE_SIZE[node.kind].width;
  if (node.children.length === 0) return own;

  const rows = rowsFor(node, opts);
  if (rows > 1) {
    const perRow = Math.ceil(node.children.length / rows);
    const widest = Math.max(...node.children.map((c) => subtreeWidth(c, opts)));
    return Math.max(own, perRow * widest + (perRow - 1) * GAP_X);
  }

  const childrenWidth = node.children.reduce(
    (sum, child, index) => sum + subtreeWidth(child, opts) + (index > 0 ? GAP_X : 0),
    0,
  );
  return Math.max(own, childrenWidth);
}

/**
 * Absolute position of every node, keyed by id. Parents are centred on the
 * horizontal span of their children.
 */
export function layoutTree(root: LayoutNode, opts: LayoutOptions = {}): Map<string, XY> {
  const positions = new Map<string, XY>();

  function place(node: LayoutNode, left: number): number {
    const size = NODE_SIZE[node.kind];
    const width = subtreeWidth(node, opts);
    const y = ROW_Y[node.kind];

    if (node.children.length === 0) {
      positions.set(node.id, { x: left + (width - size.width) / 2, y });
      return width;
    }

    const rows = rowsFor(node, opts);

    if (rows > 1) {
      // Wrap the guest list into a block so a busy node stays readable.
      const perRow = Math.ceil(node.children.length / rows);
      const childHeight = NODE_SIZE[node.children[0].kind].height;
      node.children.forEach((child, index) => {
        const row = Math.floor(index / perRow);
        const col = index % perRow;
        const childWidth = NODE_SIZE[child.kind].width;
        positions.set(child.id, {
          x: left + col * (childWidth + GAP_X),
          y: ROW_Y[child.kind] + row * (childHeight + ROW_GAP_Y),
        });
      });
    } else {
      let cursor = left;
      node.children.forEach((child, index) => {
        if (index > 0) cursor += GAP_X;
        cursor += place(child, cursor);
      });
    }

    positions.set(node.id, { x: left + (width - size.width) / 2, y });
    return width;
  }

  place(root, 0);

  // Separate top-level subtrees a little more than siblings inside one.
  let extra = 0;
  for (const cluster of root.children) {
    if (extra > 0) shift(cluster, extra, positions);
    extra += SUBTREE_GAP;
  }
  if (root.children.length > 0) {
    const clusterPositions = root.children
      .map((c) => positions.get(c.id))
      .filter((p): p is XY => Boolean(p));
    if (clusterPositions.length > 0) {
      const first = clusterPositions[0].x;
      const last = clusterPositions[clusterPositions.length - 1].x;
      positions.set(root.id, {
        x: (first + last) / 2 + (NODE_SIZE.cluster.width - NODE_SIZE.panel.width) / 2,
        y: ROW_Y.panel,
      });
    }
  }

  return positions;
}

function shift(node: LayoutNode, delta: number, positions: Map<string, XY>): void {
  const position = positions.get(node.id);
  if (position) positions.set(node.id, { ...position, x: position.x + delta });
  for (const child of node.children) shift(child, delta, positions);
}
