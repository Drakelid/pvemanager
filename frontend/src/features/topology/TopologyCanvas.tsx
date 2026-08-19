import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useThemeStore } from '@/stores/theme-store';
import { useTranslation } from 'react-i18next';
import { TopologyLegend } from './TopologyLegend';
import { ClusterNode } from './nodes/ClusterNode';
import { GuestGroupNode } from './nodes/GuestGroupNode';
import { GuestNode } from './nodes/GuestNode';
import { PanelNode } from './nodes/PanelNode';
import { PveNode } from './nodes/PveNode';
import './topology.css';

// Declared at module scope: recreating this object on every render makes React
// Flow remount every node and the canvas crawls.
const nodeTypes = {
  panel: PanelNode,
  cluster: ClusterNode,
  pve: PveNode,
  guest: GuestNode,
  guestGroup: GuestGroupNode,
} as const;

const defaultEdgeOptions = { type: 'smoothstep' as const, animated: true };

// Above this many nodes React Flow only mounts what is on screen, and the
// minimap (which renders every node again) is dropped.
const VIRTUALIZE_ABOVE = 150;
const MINIMAP_LIMIT = 400;

interface TopologyCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onExpandNode: (nodeId: string) => void;
  /** Rendered inside the canvas only in fullscreen, where the page chrome is gone. */
  toolbar?: React.ReactNode;
}

export function TopologyCanvas({ nodes, edges, onExpandNode, toolbar }: TopologyCanvasProps) {
  const { t } = useTranslation();
  // The panel drives its theme through this store, not next-themes (which
  // ships only as a sonner dependency and has no provider mounted here).
  const theme = useThemeStore((state) => state.theme);
  const { fitView } = useReactFlow();

  // The group node's expand button lives in node data; buildGraph is pure and
  // cannot know about the callback, so it is attached here.
  const decorated = useMemo(
    () =>
      nodes.map((node) =>
        node.type === 'guestGroup'
          ? { ...node, data: { ...node.data, onExpand: onExpandNode } }
          : node,
      ),
    [nodes, onExpandNode],
  );

  const handleInit = useCallback(() => {
    fitView({ padding: 0.15, duration: 0 });
  }, [fitView]);

  // Filtering, grouping or expanding changes how much space the tree needs, so
  // refit whenever the node count moves — otherwise the graph drifts off-screen
  // or stays zoomed out after a filter shrinks it.
  const nodeCount = decorated.length;
  useEffect(() => {
    if (nodeCount === 0) return;
    const timer = window.setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 0);
    return () => window.clearTimeout(timer);
  }, [nodeCount, fitView]);

  return (
    <ReactFlow
      nodes={decorated}
      edges={edges}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      colorMode={theme === 'light' ? 'light' : 'dark'}
      onInit={handleInit}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.05}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: false }}
      onlyRenderVisibleElements={decorated.length > VIRTUALIZE_ABOVE}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      {/* Top-right keeps the zoom buttons clear of the toolbar and the legend. */}
      <Controls showInteractive={false} position="top-right" orientation="horizontal" />
      {decorated.length <= MINIMAP_LIMIT ? <MiniMap pannable zoomable className="!h-24 !w-40" /> : null}
      {toolbar ? (
        <Panel position="top-left" className="!m-3 max-w-[calc(100%-1.5rem)]">
          {toolbar}
        </Panel>
      ) : null}
      <Panel position="bottom-left" className="!m-3">
        <TopologyLegend />
      </Panel>
      {decorated.length === 0 ? (
        <Panel position="top-center" className="!mt-24">
          <p className="text-sm text-muted-foreground">{t('topology.empty', 'No servers available')}</p>
        </Panel>
      ) : null}
    </ReactFlow>
  );
}
