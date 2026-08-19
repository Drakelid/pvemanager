import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GuestGroupNodeData } from '../lib/types';

interface GuestGroupNodeProps extends NodeProps {
  data: GuestGroupNodeData & { onExpand?: (nodeId: string) => void };
}

function GuestGroupNodeImpl({ data }: GuestGroupNodeProps) {
  const { t } = useTranslation();
  const { parentId, total, running, stopped, onExpand } = data;

  return (
    <div className="w-[250px] rounded-md border border-dashed border-primary/60 bg-card px-2.5 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} isConnectable={false} className="!bg-border" />
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-xs font-medium">{t('topology.group.count', { count: total })}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        {t('topology.group.breakdown', { running, stopped })}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-6 w-full text-[10px]"
        onClick={() => onExpand?.(parentId)}
      >
        {t('topology.group.expand', 'Show all')}
      </Button>
    </div>
  );
}

export const GuestGroupNode = memo(GuestGroupNodeImpl);
