import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Wifi, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useVMInterfaces, useVMConfig, useVMStatus, useUpdateConfig } from '@/hooks/use-instances';
import { formatBytes } from '@/lib/format';
import { toast } from 'sonner';
import AddNetworkInterfaceDialog from '../AddNetworkInterfaceDialog';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

export default function NetworkingTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const { data: ifaces } = useVMInterfaces(serverId, vmid, type, node);
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const { data: status } = useVMStatus(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);

  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Extract network configs from VM config (net0, net1, ...)
  const netDevices = config
    ? Object.entries(config)
        .filter(([k]) => /^net\d+$/.test(k))
        .sort(([a], [b]) => a.localeCompare(b))
    : [];

  const removeNic = () => {
    if (!deleteTarget) return;
    updateConfig.mutate(
      { delete: deleteTarget },
      {
        onSuccess: () => {
          toast.success(t('netif.removed', 'Интерфейс {{key}} удалён', { key: deleteTarget }));
          setDeleteTarget(null);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Traffic summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Network In</p>
            <p className="text-xl font-bold tabular-nums">{status?.netin !== undefined ? formatBytes(status.netin) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Network Out</p>
            <p className="text-xl font-bold tabular-nums">{status?.netout !== undefined ? formatBytes(status.netout) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Configured network devices */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Network Devices
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('netif.add_interface', 'Добавить интерфейс')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {netDevices.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('netif.no_devices', 'Нет сетевых устройств')}
            </p>
          )}
          {netDevices.map(([key, value]) => {
            const parts = String(value).split(',');
            const bridgePart = parts.find((p) => p.includes('bridge='));
            const bridge = bridgePart?.split('=')[1];
            const modelPart = parts[0]; // e.g. "virtio=XX:XX:XX:XX:XX:XX"
            const [model, mac] = modelPart?.includes('=') ? modelPart.split('=') : [modelPart, ''];

            return (
              <div key={key} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{key}</Badge>
                    <span className="text-sm font-medium">{model}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {bridge && (
                      <Badge variant="secondary" className="text-xs">{bridge}</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(key)}
                      title={t('netif.remove_interface', 'Удалить интерфейс')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {mac && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{mac}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Live interfaces */}
      {ifaces?.interfaces && ifaces.interfaces.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Live Interfaces (Guest Agent)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ifaces.interfaces.map((iface) => (
              <div key={iface.name} className="rounded-md border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{iface.name}</span>
                  {iface.mac && (
                    <span className="font-mono text-xs text-muted-foreground">{iface.mac}</span>
                  )}
                </div>
                {iface.ips && iface.ips.length > 0 ? (
                  <div className="space-y-0.5">
                    {iface.ips.map((ip) => (
                      <div key={ip.address} className="flex items-center gap-2">
                        <span className="font-mono text-xs">{ip.address}/{ip.prefix}</span>
                        <Badge variant="secondary" className="text-[10px]">{ip.type}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No addresses</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddNetworkInterfaceDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        serverId={serverId}
        vmid={vmid}
        type={type}
        node={node}
        config={config as Record<string, unknown> | undefined}
      />

      {/* Delete NIC confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('netif.remove_title', 'Удалить сетевой интерфейс?')}</DialogTitle>
            <DialogDescription>
              {t('netif.remove_description', 'Интерфейс {{key}} будет удалён из конфигурации. ВМ может потерять сетевое подключение.', { key: deleteTarget ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel', 'Отмена')}
            </Button>
            <Button variant="destructive" onClick={removeNic} disabled={updateConfig.isPending}>
              {t('common.delete', 'Удалить')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
