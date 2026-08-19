/**
 * Tidy-tree layout for the topology graph.
 *
 * The graph is a strict tree of fixed depth (panel → cluster → node → guest),
 * so a dedicated layout engine would be all cost and no benefit: this is ~60
 * synchronous lines, deterministic, and O(n) — it can rerun on every slider
 * tick without the flicker an async layout pass introduces.
 *
 * Orientation is left-to-right: with hundreds of guests a tall column scrolls
 * far better than an endlessly wide row.
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

export const COLUMN_X: Record<LayoutKind, number> = {
  panel: 0,
  cluster: 330,
  pve: 700,
  guest: 1080,
  guestGroup: 1080,
};

export const NODE_SIZE: Record<LayoutKind, { width: number; height: number }> = {
  panel: { width: 230, height: 92 },
  cluster: { width: 250, height: 96 },
  pve: { width: 270, height: 132 },
  guest: { width: 250, height: 84 },
  guestGroup: { width: 250, height: 96 },
};

const GAP_Y = 14;
const SUBTREE_GAP = 26;
const COLUMN_GAP_X = 40;

export interface LayoutOptions {
  /**
   * Wrap a node's guests into extra columns once the list is longer than this.
   * Keeps a busy node from stretching the graph into an unreadable ribbon.
   */
  guestsPerColumn?: number;
}

/** How many columns a node's guest list is wrapped into. */
function columnsFor(node: LayoutNode, opts: LayoutOptions): number {
  if (node.kind !== 'pve' || !opts.guestsPerColumn) return 1;
  return Math.max(1, Math.ceil(node.children.length / opts.guestsPerColumn));
}

/** Vertical space a subtree needs, including the gaps between its children. */
function subtreeHeight(node: LayoutNode, opts: LayoutOptions): number {
  const own = NODE_SIZE[node.kind].height;
  if (node.children.length === 0) return own;

  const columns = columnsFor(node, opts);
  if (columns > 1) {
    const perColumn = Math.ceil(node.children.length / columns);
    const tallest = Math.max(...node.children.map((c) => subtreeHeight(c, opts)));
    return Math.max(own, perColumn * tallest + (perColumn - 1) * GAP_Y);
  }

  const childrenHeight = node.children.reduce(
    (sum, child, index) => sum + subtreeHeight(child, opts) + (index > 0 ? GAP_Y : 0),
    0,
  );
  return Math.max(own, childrenHeight);
}

/**
 * Absolute position of every node, keyed by id. Parents are centred on the
 * vertical span of their children.
 */
export function layoutTree(root: LayoutNode, opts: LayoutOptions = {}): Map<string, XY> {
  const positions = new Map<string, XY>();

  function place(node: LayoutNode, top: number): number {
    const size = NODE_SIZE[node.kind];
    const height = subtreeHeight(node, opts);
    const x = COLUMN_X[node.kind];

    if (node.children.length === 0) {
      positions.set(node.id, { x, y: top + (height - size.height) / 2 });
      return height;
    }

    const columns = columnsFor(node, opts);

    if (columns > 1) {
      // Wrap the guest list into a block so a busy node stays readable.
      const perColumn = Math.ceil(node.children.length / columns);
      const childWidth = NODE_SIZE[node.children[0].kind].width;
      node.children.forEach((child, index) => {
        const column = Math.floor(index / perColumn);
        const row = index % perColumn;
        const childHeight = NODE_SIZE[child.kind].height;
        positions.set(child.id, {
          x: COLUMN_X[child.kind] + column * (childWidth + COLUMN_GAP_X),
          y: top + row * (childHeight + GAP_Y),
        });
      });
    } else {
      let cursor = top;
      node.children.forEach((child, index) => {
        if (index > 0) cursor += GAP_Y;
        cursor += place(child, cursor);
      });
    }

    positions.set(node.id, { x, y: top + (height - size.height) / 2 });
    return height;
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
      const first = clusterPositions[0].y;
      const last = clusterPositions[clusterPositions.length - 1].y;
      positions.set(root.id, {
        x: COLUMN_X.panel,
        y: (first + last) / 2 + (NODE_SIZE.cluster.height - NODE_SIZE.panel.height) / 2,
      });
    }
  }

  return positions;
}

function shift(node: LayoutNode, delta: number, positions: Map<string, XY>): void {
  const position = positions.get(node.id);
  if (position) positions.set(node.id, { ...position, y: position.y + delta });
  for (const child of node.children) shift(child, delta, positions);
}
