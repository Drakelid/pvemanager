import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Link } from 'react-router';
import { Box, Monitor } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GuestNodeData } from '../lib/types';

const VISIBLE_TAGS = 2;

function GuestNodeImpl({ data }: NodeProps) {
  const { guest } = data as GuestNodeData;
  const running = guest.status === 'running';
  const Icon = guest.type === 'lxc' ? Box : Monitor;
  const extraTags = guest.tags.length - VISIBLE_TAGS;

  return (
    <Link
      to={`/instances/${guest.server_id}/${guest.vmid}?node=${guest.node}&type=${guest.type}`}
      className={cn(
        'block w-[250px] rounded-md border bg-card px-2.5 py-2 shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/40',
        running ? 'border-emerald-500/50' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="!bg-border" />
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', running ? 'text-emerald-500' : 'text-muted-foreground')} />
        <span className="truncate text-xs font-medium">{guest.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">#{guest.vmid}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
        <span className={cn(running ? 'text-emerald-500' : 'text-muted-foreground')}>{guest.status}</span>
        {guest.ip ? <span className="truncate font-mono text-muted-foreground">{guest.ip}</span> : null}
        {guest.nics[0]?.bridge ? (
          <span className="truncate text-muted-foreground">{guest.nics[0].bridge}</span>
        ) : null}
        {guest.nics[0]?.vlan_tag ? (
          <span className="text-muted-foreground">VLAN {guest.nics[0].vlan_tag}</span>
        ) : null}
      </div>
      {guest.tags.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {guest.tags.slice(0, VISIBLE_TAGS).map((tag) => (
            <Badge key={tag} variant="secondary" className="px-1 py-0 text-[9px]">{tag}</Badge>
          ))}
          {extraTags > 0 ? (
            <span className="text-[9px] text-muted-foreground">+{extraTags}</span>
          ) : null}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!bg-border" />
    </Link>
  );
}

export const GuestNode = memo(GuestNodeImpl);
