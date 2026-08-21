import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Wifi, Plus, Trash2, Star, RefreshCw } from 'lucide-react';
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
import {
  useGuestAddresses,
  useApplyGuestAddress,
  useSetPrimaryGuestAddress,
  useRemoveGuestAddress,
} from '@/hooks/use-ipam';
import type { GuestAddress } from '@/types';
import { formatBytes } from '@/lib/format';
import { toast } from 'sonner';
import AddNetworkInterfaceDialog from '../AddNetworkInterfaceDialog';
import AddGuestIPDialog from '../AddGuestIPDialog';

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

  // Имена интерфейсов гостя для выбора цели alias-адреса: сперва то, что
  // реально видно в госте, иначе имена из конфига (LXC пишет name=ethN).
  const guestInterfaces = (() => {
    const live = (ifaces?.interfaces ?? [])
      .map((i) => i.name)
      .filter((name): name is string => !!name && name !== 'lo');
    if (live.length > 0) return live;
    return netDevices
      .map(([, value]) =>
        String(value)
          .split(',')
          .find((part) => part.startsWith('name='))
          ?.slice(5),
      )
      .filter((name): name is string => !!name);
  })();

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

      {/* IPAM addresses of this guest */}
      <GuestAddressesCard serverId={serverId} vmid={vmid} interfaces={guestInterfaces} />

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
                        <Badge variant="secondary" className="text-2xs">{ip.type}</Badge>
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

function GuestAddressesCard({ serverId, vmid, interfaces }: {
  serverId: number;
  vmid: number;
  interfaces: string[];
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useGuestAddresses(serverId, vmid);
  const applyAddress = useApplyGuestAddress(serverId, vmid);
  const setPrimary = useSetPrimaryGuestAddress(serverId, vmid);
  const removeAddress = useRemoveGuestAddress(serverId, vmid);

  const [showAdd, setShowAdd] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<GuestAddress | null>(null);

  const addresses = data?.addresses ?? [];

  // Статус применения alias-адреса: applied — закреплён в конфиге гостя,
  // runtime_only — поднят, но не переживёт перезагрузку, pending/failed —
  // адрес зарезервирован в IPAM, но на гостя не попал.
  const statusBadge = (address: GuestAddress) => {
    if (address.assignment_kind !== 'alias') {
      return <Badge variant="secondary" className="text-xs">{t('ipam.from_nic_config', 'из конфига NIC')}</Badge>;
    }
    switch (address.apply_status) {
      case 'applied':
        return <Badge variant="secondary" className="text-xs">{t('ipam.applied', 'применён')}</Badge>;
      case 'runtime_only':
        return (
          <Badge
            variant="outline"
            className="text-xs"
            title={t('ipam.runtime_only_hint', 'Адрес поднят, но стек сети гостя не распознан — после перезагрузки исчезнет')}
          >
            {t('ipam.runtime_only', 'до перезагрузки')}
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="text-xs" title={address.apply_error ?? undefined}>
            {t('ipam.not_applied', 'не применён')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="text-xs" title={address.apply_error ?? undefined}>
            {t('common.error', 'Ошибка')}
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-xs">{t('ipam.discovered', 'обнаружен')}</Badge>;
    }
  };

  const release = () => {
    if (!releaseTarget) return;
    removeAddress.mutate(releaseTarget.id, {
      onSuccess: (res) => {
        if (res.removed_from_guest) {
          toast.success(t('ipam.address_released', { defaultValue: 'Адрес {{ip}} освобождён', ip: res.released }));
        } else {
          toast.warning(
            t('ipam.address_released_not_removed', {
              defaultValue: '{{ip}} освобождён в IPAM, но снять его с гостя не удалось: {{error}}',
              ip: res.released,
              error: res.error ?? '',
            }),
          );
        }
        setReleaseTarget(null);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('ipam.addresses', 'IP-адреса')}
            {addresses.length > 0 && <Badge variant="secondary">{addresses.length}</Badge>}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('ipam.add_address', 'Добавить IP')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading', 'Загрузка...')}</p>
        ) : addresses.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('ipam.no_addresses', 'Адресов в IPAM нет')}
          </p>
        ) : (
          addresses.map((address) => (
            <div key={address.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">
                    {address.ip_address}
                    {address.prefix ? `/${address.prefix}` : ''}
                  </span>
                  {address.is_primary && (
                    <Badge className="text-xs">{t('ipam.primary', 'основной')}</Badge>
                  )}
                  {statusBadge(address)}
                  {address.target_interface && (
                    <Badge variant="outline" className="text-xs">{address.target_interface}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {address.assignment_kind === 'alias' && address.apply_status !== 'applied' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={applyAddress.isPending}
                      title={t('ipam.apply', 'Применить')}
                      onClick={() =>
                        applyAddress.mutate(address.id, {
                          onSuccess: (res) =>
                            res.applied
                              ? toast.success(t('ipam.applied', 'применён'))
                              : toast.error(res.error ?? t('common.error', 'Ошибка')),
                          onError: (e) => toast.error((e as Error).message),
                        })
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!address.is_primary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={setPrimary.isPending}
                      title={t('ipam.make_primary', 'Сделать основным адресом')}
                      onClick={() =>
                        setPrimary.mutate(address.id, {
                          onError: (e) => toast.error((e as Error).message),
                        })
                      }
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={address.assignment_kind !== 'alias'}
                    title={
                      address.assignment_kind === 'alias'
                        ? t('ipam.release', 'Освободить')
                        : t('ipam.primary_managed_by_nic', 'Основной адрес задаётся конфигом интерфейса')
                    }
                    onClick={() => setReleaseTarget(address)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {address.apply_error && (
                <p className="mt-1 text-xs text-muted-foreground">{address.apply_error}</p>
              )}
            </div>
          ))
        )}
      </CardContent>

      {showAdd && (
        <AddGuestIPDialog
          open
          onClose={() => setShowAdd(false)}
          serverId={serverId}
          vmid={vmid}
          interfaces={interfaces}
        />
      )}

      <Dialog open={!!releaseTarget} onOpenChange={(o) => !o && setReleaseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ipam.release_title', 'Освободить адрес?')}</DialogTitle>
            <DialogDescription>
              {t('ipam.release_description', {
                defaultValue:
                  'Адрес {{ip}} будет снят с интерфейса гостя и освобождён в IPAM.',
                ip: releaseTarget?.ip_address ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseTarget(null)}>
              {t('common.cancel', 'Отмена')}
            </Button>
            <Button variant="destructive" onClick={release} disabled={removeAddress.isPending}>
              {t('ipam.release', 'Освободить')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
