import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Network, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ClusterNodeData } from '../lib/types';

function ClusterNodeImpl({ data }: NodeProps) {
  const { t } = useTranslation();
  const { cluster, nodeCount, guestCount } = data as ClusterNodeData;
  const isCluster = cluster.kind === 'cluster';
  const Icon = isCluster ? Network : Server;

  return (
    <div
      className={cn(
        'w-[250px] rounded-lg border bg-card px-3 py-2.5 shadow-sm',
        cluster.online ? 'border-emerald-500/60' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="!bg-border" />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{cluster.name}</span>
        <span
          className={cn(
            'ml-auto h-2 w-2 shrink-0 rounded-full',
            cluster.online ? 'bg-emerald-500' : 'bg-muted-foreground/50',
          )}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {isCluster
            ? t('topology.legend.cluster', 'Cluster')
            : t('topology.legend.standalone', 'Standalone')}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {t('topology.node.nodes_count', { count: nodeCount })} · {t('topology.node.guests_count', { count: guestCount })}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!bg-border" />
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeImpl);
