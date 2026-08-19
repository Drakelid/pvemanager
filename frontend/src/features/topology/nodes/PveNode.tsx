import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Server, WifiOff } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PveNodeData } from '../lib/types';

function Meter({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  const percent = value === null ? 0 : Math.min(100, Math.max(0, value * 100));
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{value === null ? '—' : `${percent.toFixed(0)}%`}{hint ? ` · ${hint}` : ''}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-input">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function PveNodeImpl({ data }: NodeProps) {
  const { t } = useTranslation();
  const { node, guestCount } = data as PveNodeData;
  const online = node.status === 'online';
  const memRatio = node.mem && node.maxmem ? node.mem / node.maxmem : null;

  return (
    <div
      className={cn(
        'w-[270px] rounded-lg border bg-card px-3 py-2.5 shadow-sm',
        node.stale ? 'border-dashed border-amber-500/60' : online ? 'border-emerald-500/50' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!bg-border" />
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{node.node}</span>
        {node.stale ? (
          <WifiOff className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={t('topology.legend.stale', 'Cached data')} />
        ) : (
          <span
            className={cn(
              'ml-auto h-2 w-2 shrink-0 rounded-full',
              online ? 'bg-emerald-500' : 'bg-muted-foreground/50',
            )}
          />
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">{node.server_name}</span>
        <span>{t('topology.node.guests_count', { count: guestCount })}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        <Meter
          label={t('topology.node.cpu', 'CPU')}
          value={node.cpu ?? null}
          hint={node.maxcpu ? `${node.maxcpu} vCPU` : undefined}
        />
        <Meter
          label={t('topology.node.ram', 'RAM')}
          value={memRatio}
          hint={node.maxmem ? formatBytes(node.maxmem, 0) : undefined}
        />
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!bg-border" />
    </div>
  );
}

export const PveNode = memo(PveNodeImpl);
