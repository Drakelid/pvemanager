import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Boxes } from 'lucide-react';
import type { PanelNodeData } from '../lib/types';

function PanelNodeImpl({ data }: NodeProps) {
  const { t } = useTranslation();
  const { panel } = data as PanelNodeData;

  return (
    <div className="w-[230px] rounded-lg border-2 border-primary bg-card px-3 py-2.5 shadow-md">
      <div className="flex items-center gap-2">
        <Boxes className="h-5 w-5 shrink-0 text-primary" />
        <span className="truncate text-sm font-semibold">{panel.name}</span>
      </div>
      <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
        <span>{t('topology.node.clusters_count', { count: panel.cluster_count })}</span>
        <span>{t('topology.node.nodes_count', { count: panel.node_count })}</span>
        <span>{t('topology.node.guests_count', { count: panel.guest_count })}</span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!bg-primary" />
    </div>
  );
}

export const PanelNode = memo(PanelNodeImpl);
