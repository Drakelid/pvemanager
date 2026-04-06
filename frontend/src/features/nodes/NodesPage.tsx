import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Server, Monitor, Container } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useServers } from '@/hooks/use-nodes';
import { useVirtualMachines } from '@/hooks/use-instances';

export default function NodesPage() {
  const { t } = useTranslation();
  const { data: servers = [], isLoading } = useServers();
  const { data: vms = [] } = useVirtualMachines();

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.nodes')}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.map(srv => {
          const srvVMs = vms.filter(v => v.server_id === srv.id && v.type === 'qemu');
          const srvCTs = vms.filter(v => v.server_id === srv.id && v.type === 'lxc');
          return (
            <Link key={srv.id} to={`/nodes/${srv.id}`}>
              <Card className="transition-colors hover:border-blue-500/50 h-full">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Server className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{srv.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{srv.ip_address}</p>
                      </div>
                    </div>
                    <Badge variant={srv.is_online ? 'default' : 'destructive'}>
                      {srv.is_online ? t('common.online') : t('common.offline')}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Monitor className="h-3.5 w-3.5" />
                      <span>{srvVMs.length} VM</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Container className="h-3.5 w-3.5" />
                      <span>{srvCTs.length} LXC</span>
                    </div>
                  </div>

                  {srv.description && (
                    <p className="text-xs text-muted-foreground truncate">{srv.description}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Server className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>{t('nodes.no_servers')}</p>
        </div>
      )}
    </div>
  );
}
