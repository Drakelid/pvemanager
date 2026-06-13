import { useParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Cpu, MemoryStick, HardDrive, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useServer, useNodes } from '@/hooks/use-nodes';
import { useVirtualMachines } from '@/hooks/use-instances';
import { StatusDot } from '@/components/shared/status-dot';
import { formatBytes, formatUptime, formatPercent } from '@/lib/format';
import NodeNetworks from './NodeNetworks';

export default function NodeDetailPage() {
  const { t } = useTranslation();
  const { serverId } = useParams<{ serverId: string }>();
  const sid = Number(serverId);
  const { data: server } = useServer(sid);
  const { data: nodesData } = useNodes(sid);
  const { data: allVMs = [] } = useVirtualMachines();

  const nodes = nodesData?.nodes || [];
  const serverVMs = allVMs.filter(v => v.server_id === sid);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button render={<Link to="/nodes" />} variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{server?.name || `Server #${sid}`}</h1>
          <p className="text-sm text-muted-foreground font-mono">{server?.ip_address}:{server?.port}</p>
        </div>
        <Badge variant={server?.is_online ? 'default' : 'destructive'} className="ml-auto">
          {server?.is_online ? t('common.online') : t('common.offline')}
        </Badge>
      </div>

      {/* Nodes in cluster */}
      {nodes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('nodes.cluster_nodes')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map(node => (
              <Card key={node.node}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{node.node}</span>
                    <StatusDot status={node.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><Cpu className="h-3 w-3" />{formatPercent(node.cpu || 0)} CPU</div>
                    <div className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />{formatBytes(node.mem || 0)} / {formatBytes(node.maxmem || 0)}</div>
                    <div className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatBytes(node.disk || 0)} / {formatBytes(node.maxdisk || 0)}</div>
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatUptime(node.uptime || 0)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Node network interfaces */}
      {nodes.length > 0 && (
        <NodeNetworks serverId={sid} nodeNames={nodes.map(n => n.node)} />
      )}

      {/* VMs on this server */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('nodes.instances_on_server')} ({serverVMs.length})</h2>
        <div className="rounded-lg border divide-y">
          {serverVMs.map(vm => (
            <Link
              key={`${vm.server_id}-${vm.vmid}`}
              to={`/instances/${vm.server_id}/${vm.vmid}?node=${vm.node}&type=${vm.type}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <StatusDot status={vm.status} />
              <span className="font-medium min-w-0 truncate flex-1">{vm.name || `VM ${vm.vmid}`}</span>
              <Badge variant="outline" className="text-xs">{vm.type === 'qemu' ? 'VM' : 'LXC'}</Badge>
              <span className="text-xs text-muted-foreground">#{vm.vmid}</span>
              <span className="text-xs text-muted-foreground">{vm.node}</span>
            </Link>
          ))}
          {serverVMs.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
