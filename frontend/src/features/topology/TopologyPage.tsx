import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { useNetworkTopology } from '@/hooks/use-topology';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TopologyCanvas } from './TopologyCanvas';
import { TopologyToolbar } from './TopologyToolbar';
import { buildGraph, listConnections } from './lib/build-graph';
import { exportGraph } from './lib/export';
import type { TopologyFilters } from './lib/types';

const THRESHOLD_STORAGE_KEY = 'pve-topology-threshold';
const DEFAULT_THRESHOLD = 20;
// Past this many guests an ungrouped graph is unusable, so grouping is forced.
const FORCE_GROUPING_ABOVE = 1500;
const EXPORT_NODE_LIMIT = 1200;

function readStoredThreshold(): number {
  // Guard the missing key explicitly: Number(null) is 0, which would silently
  // turn "never stored" into "grouping off" on a first visit.
  const raw = localStorage.getItem(THRESHOLD_STORAGE_KEY);
  if (raw === null) return DEFAULT_THRESHOLD;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : DEFAULT_THRESHOLD;
}

function TopologyView() {
  const { t } = useTranslation();
  const { fitView, getNodesBounds } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<TopologyFilters>(() => ({
    serverId: 'all',
    vmStatus: 'all',
    groupThreshold: readStoredThreshold(),
    groupMode: 'hierarchy',
  }));

  // The whole tree is fetched once and every filter — connection included — is
  // applied in buildGraph. Putting the connection in the query key instead
  // would blank the graph on each switch while the new response is in flight.
  const { data, isLoading, error, refetch, isFetching } = useNetworkTopology();

  const tooManyGuests = (data?.panel.guest_count ?? 0) > FORCE_GROUPING_ABOVE;
  const effectiveFilters = useMemo<TopologyFilters>(
    () =>
      tooManyGuests && filters.groupThreshold === 0
        ? { ...filters, groupThreshold: DEFAULT_THRESHOLD }
        : filters,
    [filters, tooManyGuests],
  );

  const { nodes, edges } = useMemo(
    () => buildGraph(data, effectiveFilters, expanded),
    [data, effectiveFilters, expanded],
  );
  const connections = useMemo(() => listConnections(data), [data]);

  const handleFiltersChange = useCallback((next: TopologyFilters) => {
    setFilters((previous) => {
      // Expanding is per-node state; a different connection shows other nodes.
      if (previous.serverId !== next.serverId) setExpanded(new Set());
      if (previous.groupThreshold !== next.groupThreshold) {
        localStorage.setItem(THRESHOLD_STORAGE_KEY, String(next.groupThreshold));
      }
      return next;
    });
  }, []);

  const handleExpandNode = useCallback((nodeId: string) => {
    setExpanded((previous) => new Set(previous).add(nodeId));
  }, []);

  const handleFit = useCallback(() => {
    fitView({ padding: 0.15, duration: 300 });
  }, [fitView]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement === wrapperRef.current) {
      void document.exitFullscreen();
    } else {
      void wrapperRef.current?.requestFullscreen();
    }
  }, []);

  const handleExport = useCallback(
    (format: 'png' | 'svg') => {
      // getNodesBounds must come from the hook (not the standalone helper) so
      // it reads each node's actual measured width/height instead of zero.
      const bounds = getNodesBounds(nodes);
      toast.promise(exportGraph(bounds, nodes.length > 0, format, 'topology'), {
        loading: t('topology.export.progress', 'Rendering image…'),
        success: t('topology.export.done', 'Image saved'),
        error: t('topology.export.failed', 'Export failed'),
      });
    },
    [nodes, getNodesBounds, t],
  );

  const toolbar = (
    <TopologyToolbar
      filters={effectiveFilters}
      onChange={handleFiltersChange}
      connections={connections}
      isFullscreen={isFullscreen}
      isFetching={isFetching}
      onFit={handleFit}
      onFullscreen={handleFullscreen}
      onRefresh={() => void refetch()}
      onExport={handleExport}
      exportDisabled={nodes.length === 0 || nodes.length > EXPORT_NODE_LIMIT}
    />
  );

  const warnings = data?.warnings ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('topology.title', 'Network topology')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('topology.subtitle', 'Hierarchical map of clusters, nodes and guests')}
        </p>
      </div>

      {warnings.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          {warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`} className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {warning.code === 'offline'
                  ? t('topology.warning.offline', { server: warning.server_name ?? '' })
                  : warning.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {tooManyGuests ? (
        <p className="text-xs text-muted-foreground">{t('topology.too_many', 'Too many objects; grouping enabled')}</p>
      ) : null}

      {/* Above the canvas normally; in fullscreen it moves inside, where it is
          the only way to reach the filters. */}
      {isFullscreen ? null : toolbar}

      <div
        ref={wrapperRef}
        className={cn(
          'topology-canvas overflow-hidden border border-border bg-background',
          // In fullscreen the browser sizes the element, so the page-layout
          // height (and the rounded frame) would only leave a dead strip.
          isFullscreen ? 'h-full w-full' : 'h-[calc(100vh-19rem)] min-h-[480px] rounded-lg',
        )}
      >
        {isLoading ? (
          <div className="flex h-full flex-col gap-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-full w-full" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {t('topology.error', 'Failed to load topology')}
          </div>
        ) : (
          <TopologyCanvas
            nodes={nodes}
            edges={edges}
            onExpandNode={handleExpandNode}
            toolbar={isFullscreen ? toolbar : undefined}
          />
        )}
      </div>
    </div>
  );
}

export default function TopologyPage() {
  return (
    <ReactFlowProvider>
      <TopologyView />
    </ReactFlowProvider>
  );
}
