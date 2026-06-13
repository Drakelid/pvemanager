import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Check, Undo2, Network, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useNodeNetworks,
  useCreateNodeNetwork,
  useUpdateNodeNetwork,
  useDeleteNodeNetwork,
  useApplyNodeNetwork,
  useRevertNodeNetwork,
} from '@/hooks/use-nodes';
import type { NodeNetworkInterface } from '@/types';
import { toast } from 'sonner';

const IFACE_TYPES = ['bridge', 'bond', 'vlan', 'eth', 'alias', 'OVSBridge', 'OVSBond', 'OVSIntPort'];

interface FormState {
  type: string;
  iface: string;
  cidr: string;
  gateway: string;
  bridge_ports: string;
  bond_slaves: string;
  bond_mode: string;
  vlan_raw_device: string;
  vlan_id: string;
  autostart: boolean;
  comments: string;
}

const emptyForm: FormState = {
  type: 'bridge',
  iface: '',
  cidr: '',
  gateway: '',
  bridge_ports: '',
  bond_slaves: '',
  bond_mode: 'balance-rr',
  vlan_raw_device: '',
  vlan_id: '',
  autostart: true,
  comments: '',
};

function ifaceToForm(iface: NodeNetworkInterface): FormState {
  return {
    type: iface.type || 'bridge',
    iface: iface.iface,
    cidr: iface.cidr || (iface.address && iface.netmask ? `${iface.address}` : ''),
    gateway: iface.gateway || '',
    bridge_ports: iface.bridge_ports || '',
    bond_slaves: iface.bond_slaves || '',
    bond_mode: iface.bond_mode || 'balance-rr',
    vlan_raw_device: iface['vlan-raw-device'] || '',
    vlan_id: iface['vlan-id'] != null ? String(iface['vlan-id']) : '',
    autostart: iface.autostart === 1,
    comments: iface.comments || '',
  };
}

function buildPayload(form: FormState): Record<string, unknown> {
  const p: Record<string, unknown> = {
    type: form.type,
    iface: form.iface.trim(),
    autostart: form.autostart ? 1 : 0,
  };
  if (form.cidr.trim()) p.cidr = form.cidr.trim();
  if (form.gateway.trim()) p.gateway = form.gateway.trim();
  if (form.comments.trim()) p.comments = form.comments.trim();
  if (form.type === 'bridge' || form.type === 'OVSBridge') {
    if (form.bridge_ports.trim()) p.bridge_ports = form.bridge_ports.trim();
  }
  if (form.type === 'bond' || form.type === 'OVSBond') {
    if (form.bond_slaves.trim()) p.bond_slaves = form.bond_slaves.trim();
    if (form.bond_mode) p.bond_mode = form.bond_mode;
  }
  if (form.type === 'vlan') {
    if (form.vlan_raw_device.trim()) p['vlan-raw-device'] = form.vlan_raw_device.trim();
    if (form.vlan_id.trim()) p['vlan-id'] = Number(form.vlan_id);
  }
  return p;
}

export default function NodeNetworks({ serverId, nodeNames }: { serverId: number; nodeNames: string[] }) {
  const { t } = useTranslation();
  const [node, setNode] = useState(nodeNames[0] || '');

  const { data, isLoading, isFetching, refetch } = useNodeNetworks(serverId, node);
  const createNet = useCreateNodeNetwork(serverId, node);
  const updateNet = useUpdateNodeNetwork(serverId, node);
  const deleteNet = useDeleteNodeNetwork(serverId, node);
  const applyNet = useApplyNodeNetwork(serverId, node);
  const revertNet = useRevertNodeNetwork(serverId, node);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(p => ({ ...p, [k]: v }));

  const interfaces = data?.interfaces ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (iface: NodeNetworkInterface) => {
    setEditing(iface.iface);
    setForm(ifaceToForm(iface));
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.iface.trim()) {
      toast.error(t('netif.name_required'));
      return;
    }
    const payload = buildPayload(form);
    if (editing) {
      const { iface, ...rest } = payload;
      void iface;
      updateNet.mutate(
        { iface: editing, ...rest },
        {
          onSuccess: () => { toast.success(t('netif.saved')); setDialogOpen(false); },
          onError: (err: Error) => toast.error(err.message),
        },
      );
    } else {
      createNet.mutate(payload, {
        onSuccess: () => { toast.success(t('netif.created')); setDialogOpen(false); },
        onError: (err: Error) => toast.error(err.message),
      });
    }
  };

  const handleDelete = (iface: string) => {
    if (!confirm(`${t('common.confirm_delete')} "${iface}"?`)) return;
    deleteNet.mutate(iface, {
      onSuccess: () => toast.success(t('netif.deleted')),
      onError: (err: Error) => toast.error(err.message),
    });
  };

  const handleApply = () => {
    if (!confirm(t('netif.apply_confirm'))) return;
    applyNet.mutate(undefined, {
      onSuccess: () => toast.success(t('netif.applied')),
      onError: (err: Error) => toast.error(err.message),
    });
  };

  const handleRevert = () => {
    if (!confirm(t('netif.revert_confirm'))) return;
    revertNet.mutate(undefined, {
      onSuccess: () => toast.success(t('netif.reverted')),
      onError: (err: Error) => toast.error(err.message),
    });
  };

  const saving = createNet.isPending || updateNet.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Network className="h-5 w-5" />
          {t('netif.title')}
        </CardTitle>
        <div className="flex items-center gap-2">
          {nodeNames.length > 1 && (
            <Select value={node} onValueChange={v => { if (v) setNode(v); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {nodeNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />{t('netif.add')}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleApply} disabled={applyNet.isPending}>
            <Check className="mr-1 h-4 w-4" />{t('netif.apply')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleRevert} disabled={revertNet.isPending}>
            <Undo2 className="mr-1 h-4 w-4" />{t('netif.revert')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('netif.pending_hint')}</p>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : interfaces.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('netif.name')}</TableHead>
                <TableHead>{t('netif.type')}</TableHead>
                <TableHead>{t('netif.address')}</TableHead>
                <TableHead>{t('netif.gateway')}</TableHead>
                <TableHead>{t('netif.ports')}</TableHead>
                <TableHead>{t('netif.autostart')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interfaces.map(iface => (
                <TableRow key={iface.iface}>
                  <TableCell className="font-mono font-medium">
                    {iface.iface}
                    {iface.ipam_name && (
                      <Badge variant="outline" className="ml-2 text-[10px]">IPAM: {iface.ipam_name}</Badge>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{iface.type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">
                    {iface.cidr || iface.address || '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{iface.gateway || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {iface.bridge_ports || iface.bond_slaves || iface['vlan-raw-device'] || '—'}
                  </TableCell>
                  <TableCell>{iface.autostart === 1 ? t('common.yes') : t('common.no')}</TableCell>
                  <TableCell>
                    <Badge variant={iface.active === 1 ? 'default' : 'secondary'}>
                      {iface.active === 1 ? t('netif.active') : t('netif.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(iface)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(iface.iface)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `${t('netif.edit')} ${editing}` : t('netif.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('netif.type')}</Label>
                <Select value={form.type} onValueChange={v => { if (v) set('type', v); }} disabled={!!editing}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IFACE_TYPES.map(ty => <SelectItem key={ty} value={ty}>{ty}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('netif.name')}</Label>
                <Input value={form.iface} onChange={e => set('iface', e.target.value)} disabled={!!editing} className="mt-1" placeholder="vmbr1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CIDR</Label>
                <Input value={form.cidr} onChange={e => set('cidr', e.target.value)} className="mt-1" placeholder="192.168.1.1/24" />
              </div>
              <div>
                <Label>{t('netif.gateway')}</Label>
                <Input value={form.gateway} onChange={e => set('gateway', e.target.value)} className="mt-1" placeholder="192.168.1.254" />
              </div>
            </div>

            {(form.type === 'bridge' || form.type === 'OVSBridge') && (
              <div>
                <Label>{t('netif.bridge_ports')}</Label>
                <Input value={form.bridge_ports} onChange={e => set('bridge_ports', e.target.value)} className="mt-1" placeholder="eno1 eno2" />
              </div>
            )}

            {(form.type === 'bond' || form.type === 'OVSBond') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('netif.bond_slaves')}</Label>
                  <Input value={form.bond_slaves} onChange={e => set('bond_slaves', e.target.value)} className="mt-1" placeholder="eno1 eno2" />
                </div>
                <div>
                  <Label>{t('netif.bond_mode')}</Label>
                  <Input value={form.bond_mode} onChange={e => set('bond_mode', e.target.value)} className="mt-1" placeholder="balance-rr" />
                </div>
              </div>
            )}

            {form.type === 'vlan' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('netif.vlan_raw_device')}</Label>
                  <Input value={form.vlan_raw_device} onChange={e => set('vlan_raw_device', e.target.value)} className="mt-1" placeholder="vmbr0" />
                </div>
                <div>
                  <Label>{t('netif.vlan_id')}</Label>
                  <Input value={form.vlan_id} onChange={e => set('vlan_id', e.target.value)} className="mt-1" placeholder="100" />
                </div>
              </div>
            )}

            <div>
              <Label>{t('netif.comments')}</Label>
              <Input value={form.comments} onChange={e => set('comments', e.target.value)} className="mt-1" />
            </div>

            <div className="flex items-center gap-2">
              <input id="netif_autostart" type="checkbox" checked={form.autostart} onChange={e => set('autostart', e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="netif_autostart" className="cursor-pointer">{t('netif.autostart')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.iface.trim()}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
