import { useParams, useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Cpu, MemoryStick, HardDrive, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useServer, useNodes, useClusterInfo } from '@/hooks/use-nodes';
import { useVirtualMachines } from '@/hooks/use-instances';
import { StatusDot } from '@/components/shared/status-dot';
import { formatBytes, formatUptime, formatPercent } from '@/lib/format';
import NodeNetworks from './NodeNetworks';
import HAResources from './HAResources';
import SDNManager from './SDNManager';
import FirewallManager from './FirewallManager';
import NodeFirewallManager from './NodeFirewallManager';
import PoolManager from './PoolManager';
import DiskManager from './DiskManager';
import AccessManager from './AccessManager';
import NodeAdminManager from './NodeAdminManager';

export default function NodeDetailPage() {
  const { t } = useTranslation();
  const { serverId } = useParams<{ serverId: string }>();
  const sid = Number(serverId);
  const { data: server } = useServer(sid);
  const { data: nodesData } = useNodes(sid);
  const { data: clusterInfo } = useClusterInfo(sid);
  const { data: allVMs = [] } = useVirtualMachines();
  const [searchParams, setSearchParams] = useSearchParams();

  const nodes = nodesData?.nodes || [];
  const serverVMs = allVMs.filter(v => v.server_id === sid);

  const activeTab = searchParams.get('tab') || 'overview';
  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

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
        <div className="ml-auto flex items-center gap-2">
          {clusterInfo && (
            <Badge variant={clusterInfo.is_cluster ? 'default' : 'secondary'}>
              {clusterInfo.is_cluster
                ? `${t('nodes.cluster_mode')} · ${clusterInfo.node_count ?? clusterInfo.nodes?.length ?? 0}`
                : t('nodes.standalone')}
            </Badge>
          )}
          <Badge variant={server?.is_online ? 'default' : 'destructive'}>
            {server?.is_online ? t('common.online') : t('common.offline')}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t('nodes.tab_overview', 'Обзор')}</TabsTrigger>
          {nodes.length > 0 && (
            <>
              <TabsTrigger value="network">{t('nodes.tab_network', 'Сеть')}</TabsTrigger>
              <TabsTrigger value="ha">{t('nodes.tab_ha', 'HA')}</TabsTrigger>
              <TabsTrigger value="firewall">{t('nodes.tab_firewall', 'Firewall')}</TabsTrigger>
              <TabsTrigger value="pools">{t('nodes.tab_pools', 'Пулы')}</TabsTrigger>
              <TabsTrigger value="disks">{t('nodes.tab_disks', 'Диски')}</TabsTrigger>
              <TabsTrigger value="admin">{t('nodes.tab_admin', 'Администрирование')}</TabsTrigger>
              <TabsTrigger value="access">{t('nodes.tab_access', 'Доступ')}</TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Overview: cluster nodes + instances on server */}
        <TabsContent value="overview" className="mt-4 space-y-6">
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
        </TabsContent>

        {nodes.length > 0 && (
          <>
            {/* Network: interfaces + SDN */}
            <TabsContent value="network" className="mt-4 space-y-6">
              <NodeNetworks serverId={sid} nodeNames={nodes.map(n => n.node)} />
              <SDNManager serverId={sid} />
            </TabsContent>

            {/* High Availability */}
            <TabsContent value="ha" className="mt-4">
              <HAResources serverId={sid} vms={serverVMs} />
            </TabsContent>

            {/* Firewall: datacenter + node */}
            <TabsContent value="firewall" className="mt-4 space-y-6">
              <FirewallManager serverId={sid} />
              <NodeFirewallManager serverId={sid} nodeNames={nodes.map(n => n.node)} />
            </TabsContent>

            {/* Resource Pools */}
            <TabsContent value="pools" className="mt-4">
              <PoolManager
                serverId={sid}
                vms={serverVMs.map(v => ({ vmid: v.vmid, name: v.name, type: v.type, node: v.node }))}
              />
            </TabsContent>

            {/* Disks & ZFS */}
            <TabsContent value="disks" className="mt-4">
              <DiskManager serverId={sid} nodeNames={nodes.map(n => n.node)} />
            </TabsContent>

            {/* Node administration: services & APT */}
            <TabsContent value="admin" className="mt-4">
              <NodeAdminManager serverId={sid} nodeNames={nodes.map(n => n.node)} />
            </TabsContent>

            {/* PVE Access: realms & API tokens */}
            <TabsContent value="access" className="mt-4">
              <AccessManager serverId={sid} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
