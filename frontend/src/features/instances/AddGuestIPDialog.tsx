import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIPAMNetworks, useIPAMPools, useAddGuestAddress } from '@/hooks/use-ipam';
import { toast } from 'sonner';

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  serverId: number;
  vmid: number;
  /** Имена интерфейсов гостя, среди которых можно выбрать целевой */
  interfaces: string[];
}

export default function AddGuestIPDialog({ open, onClose, serverId, vmid, interfaces }: Props) {
  const { t } = useTranslation();

  // Диалог монтируется только на время показа (см. NetworkingTab), поэтому
  // состояние достаточно задать начальными значениями — сбрасывать эффектом
  // при каждом открытии не нужно.
  const [networkId, setNetworkId] = useState('');
  const [poolId, setPoolId] = useState('');
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [ip, setIp] = useState('');
  const [iface, setIface] = useState(interfaces[0] ?? '');
  const [makePrimary, setMakePrimary] = useState(false);

  const { data: networks } = useIPAMNetworks();
  const { data: pools } = useIPAMPools(networkId ? Number(networkId) : undefined);
  const addAddress = useAddGuestAddress(serverId, vmid);

  const activeNetworks = useMemo(
    () => (networks ?? []).filter((n) => n.is_active !== false),
    [networks],
  );

  const submit = () => {
    if (!networkId) {
      toast.error(t('ipam.err_network_required', 'Выберите сеть'));
      return;
    }
    if (mode === 'manual' && !IP_RE.test(ip)) {
      toast.error(t('ipam.err_bad_ip', 'Некорректный IP-адрес'));
      return;
    }

    addAddress.mutate(
      {
        network_id: Number(networkId),
        pool_id: poolId ? Number(poolId) : undefined,
        ip_address: mode === 'manual' ? ip : undefined,
        target_interface: iface || undefined,
        make_primary: makePrimary,
      },
      {
        onSuccess: (res) => {
          const address = res.address?.ip_address ?? '';
          if (res.applied) {
            if (res.apply_status === 'runtime_only') {
              toast.warning(
                t('ipam.address_runtime_only', {
                  defaultValue: '{{ip}} поднят, но не закреплён: стек сети гостя не распознан',
                  ip: address,
                }),
              );
            } else {
              toast.success(
                t('ipam.address_added', { defaultValue: 'Адрес {{ip}} назначен', ip: address }),
              );
            }
          } else {
            // Адрес всё равно зарезервирован — применить можно позже
            toast.warning(
              t('ipam.address_reserved_not_applied', {
                defaultValue: '{{ip}} зарезервирован, но не применён: {{error}}',
                ip: address,
                error: res.error ?? '',
              }),
            );
          }
          onClose();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('ipam.add_address_title', 'Добавить IP-адрес')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'ipam.add_address_description',
              'Адрес выделяется в IPAM и навешивается на интерфейс гостя дополнительным (alias).',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('ipam.network', 'Сеть')}</Label>
              <Select value={networkId} onValueChange={(v) => { setNetworkId(v ?? ''); setPoolId(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('ipam.select_network', 'Выберите сеть')} />
                </SelectTrigger>
                <SelectContent>
                  {activeNetworks.map((n) => (
                    <SelectItem key={n.id} value={String(n.id)}>
                      <span className="flex items-center gap-2">
                        {n.name}
                        <span className="text-xs text-muted-foreground">{n.network}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('ipam.pool', 'Пул')}</Label>
              <Select value={poolId} onValueChange={(v) => setPoolId(v ?? '')} disabled={!networkId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('ipam.any_pool', 'Любой')} />
                </SelectTrigger>
                <SelectContent>
                  {(pools ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="flex items-center gap-2">
                        {p.name}
                        <span className="text-xs text-muted-foreground">
                          {p.range_start} – {p.range_end}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('ipam.address_mode', 'Адрес')}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'auto' | 'manual')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('ipam.next_free', 'Следующий свободный')}</SelectItem>
                  <SelectItem value="manual">{t('ipam.manual_ip', 'Указать вручную')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'manual' && (
              <div className="space-y-1.5">
                <Label htmlFor="guest-ip">IP</Label>
                <Input
                  id="guest-ip"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="10.10.10.90"
                  className="font-mono"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('ipam.target_interface', 'Интерфейс гостя')}</Label>
            {interfaces.length > 0 ? (
              <Select value={iface} onValueChange={(v) => setIface(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="eth0" />
                </SelectTrigger>
                <SelectContent>
                  {interfaces.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={iface}
                onChange={(e) => setIface(e.target.value)}
                placeholder="eth0"
                className="font-mono"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
            {t('ipam.make_primary', 'Сделать основным адресом')}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel', 'Отмена')}</Button>
          <Button onClick={submit} disabled={addAddress.isPending || !networkId}>
            {t('ipam.add_address_submit', 'Выдать адрес')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
