import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Check, RefreshCw, Waypoints, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useSDNStatus, useSDNZones, useSDNVNets, useSDNSubnets, useSDNDns,
  useCreateSDNZone, useUpdateSDNZone, useDeleteSDNZone,
  useCreateSDNVNet, useUpdateSDNVNet, useDeleteSDNVNet,
  useCreateSDNSubnet, useDeleteSDNSubnet, useApplySDN,
} from '@/hooks/use-sdn';
import type { SDNZone, SDNVNet } from '@/types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';

const ZONE_TYPES = ['simple', 'vlan', 'qinq', 'vxlan', 'evpn'];

// ==================== Zone dialog ====================

interface ZoneForm {
  zone: string;
  type: string;
  bridge: string;
  peers: string;
  mtu: string;
  nodes: string;
  dns: string;
}

const emptyZone: ZoneForm = { zone: '', type: 'simple', bridge: '', peers: '', mtu: '', nodes: '', dns: '' };

function ZoneDialog({ serverId, open, onOpenChange, editing }: {
  serverId: number; open: boolean; onOpenChange: (v: boolean) => void; editing: SDNZone | null;
}) {
  const { t } = useTranslation();
  const createZone = useCreateSDNZone(serverId);
  const updateZone = useUpdateSDNZone(serverId);
  // Zone `dns` is the ID of an SDN DNS entry (Datacenter → SDN → Options), not an IP
  const { data: dnsData } = useSDNDns(serverId, open);
  const dnsEntries = dnsData?.dns ?? [];
  // Dialog is freshly mounted on each open, so init state lazily from `editing`.
  const [form, setForm] = useState<ZoneForm>(() => editing ? {
    zone: editing.zone,
    type: editing.type || 'simple',
    bridge: (editing.bridge as string) || '',
    peers: (editing.peers as string) || '',
    mtu: editing.mtu != null ? String(editing.mtu) : '',
    nodes: (editing.nodes as string) || '',
    dns: editing.dns || '',
  } : emptyZone);
  const set = <K extends keyof ZoneForm>(k: K, v: ZoneForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.zone.trim()) { toast.error(t('sdn.zone_name_required')); return; }
    const payload: Record<string, unknown> = {};
    if (form.mtu.trim()) payload.mtu = Number(form.mtu);
    if (form.nodes.trim()) payload.nodes = form.nodes.trim();
    if (form.dns.trim()) payload.dns = form.dns.trim();
    if ((form.type === 'vlan' || form.type === 'qinq') && form.bridge.trim()) payload.bridge = form.bridge.trim();
    if (form.type === 'vxlan' && form.peers.trim()) payload.peers = form.peers.trim();

    const done = (msg: string) => { toast.success(msg); onOpenChange(false); setForm(emptyZone); };
    if (editing) {
      updateZone.mutate({ zone: editing.zone, ...payload }, {
        onSuccess: () => done(t('sdn.zone_saved')),
        onError: (e: Error) => toast.error(e.message),
      });
    } else {
      createZone.mutate({ zone: form.zone.trim(), type: form.type, ...payload }, {
        onSuccess: () => done(t('sdn.zone_created')),
        onError: (e: Error) => toast.error(e.message),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(emptyZone); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `${t('sdn.edit_zone')} ${editing.zone}` : t('sdn.add_zone')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('sdn.zone_name')}</Label>
              <Input value={form.zone} onChange={e => set('zone', e.target.value)} disabled={!!editing} className="mt-1" placeholder="zone1" maxLength={8} />
            </div>
            <div>
              <Label>{t('sdn.type')}</Label>
              <Select value={form.type} onValueChange={v => { if (v) set('type', v); }} disabled={!!editing}>
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ZONE_TYPES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {(form.type === 'vlan' || form.type === 'qinq') && (
            <div>
              <Label>{t('sdn.bridge')}</Label>
              <Input value={form.bridge} onChange={e => set('bridge', e.target.value)} className="mt-1" placeholder="vmbr0" />
            </div>
          )}
          {form.type === 'vxlan' && (
            <div>
              <Label>{t('sdn.peers')}</Label>
              <Input value={form.peers} onChange={e => set('peers', e.target.value)} className="mt-1" placeholder="10.0.0.1,10.0.0.2" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><Label>MTU</Label><Input type="number" value={form.mtu} onChange={e => set('mtu', e.target.value)} className="mt-1" /></div>
            <div><Label>{t('sdn.nodes')}</Label><Input value={form.nodes} onChange={e => set('nodes', e.target.value)} className="mt-1" placeholder="node1,node2" /></div>
            <div className="min-w-0">
              <Label>DNS</Label>
              <Select
                value={form.dns}
                onValueChange={v => set('dns', v === '__none__' ? '' : v)}
                disabled={dnsEntries.length === 0}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder={dnsEntries.length ? '—' : t('sdn.no_dns_entries')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {dnsEntries.map(d => <SelectItem key={d.dns} value={d.dns}>{d.dns}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={createZone.isPending || updateZone.isPending || !form.zone.trim()}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== VNet dialog ====================

interface VNetForm { vnet: string; zone: string; tag: string; alias: string; vlanaware: boolean; }
const emptyVNet: VNetForm = { vnet: '', zone: '', tag: '', alias: '', vlanaware: false };

function VNetDialog({ serverId, open, onOpenChange, editing, zones }: {
  serverId: number; open: boolean; onOpenChange: (v: boolean) => void; editing: SDNVNet | null; zones: SDNZone[];
}) {
  const { t } = useTranslation();
  const createVNet = useCreateSDNVNet(serverId);
  const updateVNet = useUpdateSDNVNet(serverId);
  const [form, setForm] = useState<VNetForm>(() => editing ? {
    vnet: editing.vnet,
    zone: editing.zone || '',
    tag: editing.tag != null ? String(editing.tag) : '',
    alias: editing.alias || '',
    vlanaware: editing.vlanaware === 1,
  } : emptyVNet);
  const set = <K extends keyof VNetForm>(k: K, v: VNetForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.vnet.trim()) { toast.error(t('sdn.vnet_name_required')); return; }
    if (!editing && !form.zone) { toast.error(t('sdn.zone_required')); return; }
    const done = (msg: string) => { toast.success(msg); onOpenChange(false); setForm(emptyVNet); };
    if (editing) {
      const payload: Record<string, unknown> = { alias: form.alias || '', vlanaware: form.vlanaware ? 1 : 0 };
      if (form.tag.trim()) payload.tag = Number(form.tag);
      updateVNet.mutate({ vnet: editing.vnet, ...payload }, {
        onSuccess: () => done(t('sdn.vnet_saved')),
        onError: (e: Error) => toast.error(e.message),
      });
    } else {
      const payload: Record<string, unknown> = { vnet: form.vnet.trim(), zone: form.zone, vlanaware: form.vlanaware };
      if (form.tag.trim()) payload.tag = Number(form.tag);
      if (form.alias.trim()) payload.alias = form.alias.trim();
      createVNet.mutate(payload, {
        onSuccess: () => done(t('sdn.vnet_created')),
        onError: (e: Error) => toast.error(e.message),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(emptyVNet); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `${t('sdn.edit_vnet')} ${editing.vnet}` : t('sdn.add_vnet')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('sdn.vnet_name')}</Label>
              <Input value={form.vnet} onChange={e => set('vnet', e.target.value)} disabled={!!editing} className="mt-1" placeholder="vnet1" maxLength={8} />
            </div>
            <div>
              <Label>{t('sdn.zone')}</Label>
              <Select value={form.zone} onValueChange={v => { if (v) set('zone', v); }} disabled={!!editing}>
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder={t('sdn.zone')} /></SelectTrigger>
                <SelectContent>{zones.map(z => <SelectItem key={z.zone} value={z.zone}>{z.zone} ({z.type})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('sdn.tag')}</Label><Input type="number" value={form.tag} onChange={e => set('tag', e.target.value)} className="mt-1" placeholder="100" /></div>
            <div><Label>{t('sdn.alias')}</Label><Input value={form.alias} onChange={e => set('alias', e.target.value)} className="mt-1" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input id="sdn_vlanaware" type="checkbox" checked={form.vlanaware} onChange={e => set('vlanaware', e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="sdn_vlanaware" className="cursor-pointer">{t('sdn.vlanaware')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={createVNet.isPending || updateVNet.isPending || !form.vnet.trim()}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Subnet section ====================

interface SubnetForm { subnet: string; gateway: string; snat: boolean; dnszoneprefix: string; create_ipam_network: boolean; }
const emptySubnet: SubnetForm = { subnet: '', gateway: '', snat: false, dnszoneprefix: '', create_ipam_network: false };

function SubnetSection({ serverId, vnet }: { serverId: number; vnet: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data, isLoading } = useSDNSubnets(serverId, vnet);
  const createSubnet = useCreateSDNSubnet(serverId);
  const deleteSubnet = useDeleteSDNSubnet(serverId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SubnetForm>(emptySubnet);
  const set = <K extends keyof SubnetForm>(k: K, v: SubnetForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const subnets = data?.subnets ?? [];

  const cidrOf = (s: { cidr?: string; subnet: string }) => {
    if (s.cidr) return s.cidr;
    // PVE id form: "zone-10.0.0.0-24" → take last two dash segments
    const m = s.subnet.match(/(\d+\.\d+\.\d+\.\d+)-(\d+)$/);
    return m ? `${m[1]}/${m[2]}` : s.subnet;
  };

  const submit = () => {
    if (!form.subnet.trim()) { toast.error(t('sdn.subnet_required')); return; }
    createSubnet.mutate({
      vnet,
      subnet: form.subnet.trim(),
      gateway: form.gateway.trim() || undefined,
      snat: form.snat,
      dnszoneprefix: form.dnszoneprefix.trim() || undefined,
      create_ipam_network: form.create_ipam_network,
    }, {
      onSuccess: () => { toast.success(t('sdn.subnet_created')); setOpen(false); setForm(emptySubnet); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const remove = async (subnetId: string, cidr: string) => {
    if (!await confirm(`${t('sdn.delete_subnet')} "${cidr}"?`)) return;
    deleteSubnet.mutate({ vnet, subnetId }, {
      onSuccess: () => toast.success(t('sdn.subnet_deleted')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('sdn.subnets')} — {vnet}</span>
        <Button size="sm" variant="outline" onClick={() => { setForm(emptySubnet); setOpen(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t('sdn.add_subnet')}
        </Button>
      </div>
      {isLoading ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : subnets.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t('common.no_data')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CIDR</TableHead>
              <TableHead>{t('sdn.gateway')}</TableHead>
              <TableHead>SNAT</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subnets.map(s => {
              const cidr = cidrOf(s);
              return (
                <TableRow key={s.subnet}>
                  <TableCell className="font-mono text-xs">{cidr}</TableCell>
                  <TableCell className="font-mono text-xs">{s.gateway || '—'}</TableCell>
                  <TableCell>{s.snat ? t('common.yes') : t('common.no')}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(s.subnet, cidr)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('sdn.add_subnet')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>CIDR</Label><Input value={form.subnet} onChange={e => set('subnet', e.target.value)} className="mt-1" placeholder="10.0.0.0/24" /></div>
            <div><Label>{t('sdn.gateway')}</Label><Input value={form.gateway} onChange={e => set('gateway', e.target.value)} className="mt-1" placeholder="10.0.0.1" /></div>
            <div><Label>{t('sdn.dnszoneprefix')}</Label><Input value={form.dnszoneprefix} onChange={e => set('dnszoneprefix', e.target.value)} className="mt-1" /></div>
            <div className="flex items-center gap-2">
              <input id="sdn_snat" type="checkbox" checked={form.snat} onChange={e => set('snat', e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="sdn_snat" className="cursor-pointer">{t('sdn.snat')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input id="sdn_ipam" type="checkbox" checked={form.create_ipam_network} onChange={e => set('create_ipam_network', e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="sdn_ipam" className="cursor-pointer">{t('sdn.create_ipam')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submit} disabled={createSubnet.isPending || !form.subnet.trim()}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Main ====================

export default function SDNManager({ serverId }: { serverId: number }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data: status, isLoading: statusLoading, isFetching, refetch } = useSDNStatus(serverId);
  const available = status?.sdn_available ?? false;

  const { data: zonesData } = useSDNZones(serverId, available);
  const { data: vnetsData } = useSDNVNets(serverId, available);
  const deleteZone = useDeleteSDNZone(serverId);
  const deleteVNet = useDeleteSDNVNet(serverId);
  const applySDN = useApplySDN(serverId);

  const zones = zonesData?.zones ?? [];
  const vnets = vnetsData?.vnets ?? [];

  const [zoneDialog, setZoneDialog] = useState(false);
  const [editZone, setEditZone] = useState<SDNZone | null>(null);
  const [vnetDialog, setVNetDialog] = useState(false);
  const [editVNet, setEditVNet] = useState<SDNVNet | null>(null);
  const [expandedVNet, setExpandedVNet] = useState<string | null>(null);

  const handleApply = async () => {
    if (!await confirm(t('sdn.apply_confirm'))) return;
    applySDN.mutate(undefined, {
      onSuccess: () => toast.success(t('sdn.applied')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const removeZone = async (zone: string) => {
    if (!await confirm(`${t('sdn.delete_zone')} "${zone}"?`)) return;
    deleteZone.mutate(zone, { onSuccess: () => toast.success(t('sdn.zone_deleted')), onError: (e: Error) => toast.error(e.message) });
  };
  const removeVNet = async (vnet: string) => {
    if (!await confirm(`${t('sdn.delete_vnet')} "${vnet}"?`)) return;
    deleteVNet.mutate(vnet, { onSuccess: () => toast.success(t('sdn.vnet_deleted')), onError: (e: Error) => toast.error(e.message) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Waypoints className="h-5 w-5" />
          {t('sdn.title')}
          {status?.pending_changes && <Badge variant="secondary">{t('sdn.pending')}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {available && (
            <Button size="sm" variant="outline" onClick={handleApply} disabled={applySDN.isPending}>
              <Check className="mr-1 h-4 w-4" />{t('sdn.apply')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {statusLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !available ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('sdn.unavailable')}</p>
        ) : (
          <Tabs defaultValue="zones">
            <TabsList>
              <TabsTrigger value="zones">{t('sdn.zones')} ({zones.length})</TabsTrigger>
              <TabsTrigger value="vnets">{t('sdn.vnets')} ({vnets.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="zones" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setEditZone(null); setZoneDialog(true); }}>
                  <Plus className="mr-1 h-4 w-4" />{t('sdn.add_zone')}
                </Button>
              </div>
              {zones.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('sdn.zone_name')}</TableHead>
                      <TableHead>{t('sdn.type')}</TableHead>
                      <TableHead>MTU</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zones.map(z => (
                      <TableRow key={z.zone}>
                        <TableCell className="font-mono font-medium">{z.zone}</TableCell>
                        <TableCell><Badge variant="secondary">{z.type}</Badge></TableCell>
                        <TableCell>{z.mtu ?? '—'}</TableCell>
                        <TableCell>{z.pending ? <Badge variant="outline">{t('sdn.pending')}</Badge> : <span className="text-xs text-muted-foreground">{t('sdn.applied_state')}</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditZone(z); setZoneDialog(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeZone(z.zone)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="vnets" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setEditVNet(null); setVNetDialog(true); }} disabled={zones.length === 0}>
                  <Plus className="mr-1 h-4 w-4" />{t('sdn.add_vnet')}
                </Button>
              </div>
              {vnets.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
              ) : (
                <div className="space-y-2">
                  {vnets.map(v => (
                    <div key={v.vnet} className="rounded-md border">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          className="flex flex-1 items-center gap-2 text-left"
                          onClick={() => setExpandedVNet(prev => prev === v.vnet ? null : v.vnet)}
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${expandedVNet === v.vnet ? 'rotate-90' : ''}`} />
                          <span className="font-mono font-medium">{v.vnet}</span>
                          <Badge variant="outline" className="text-[10px]">{v.zone}</Badge>
                          {v.tag != null && <span className="text-xs text-muted-foreground">tag {v.tag}</span>}
                          {v.alias && <span className="text-xs text-muted-foreground">— {v.alias}</span>}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditVNet(v); setVNetDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVNet(v.vnet)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {expandedVNet === v.vnet && (
                        <div className="px-3 pb-3">
                          <SubnetSection serverId={serverId} vnet={v.vnet} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {zoneDialog && (
        <ZoneDialog serverId={serverId} open={zoneDialog} onOpenChange={(v) => { setZoneDialog(v); if (!v) setEditZone(null); }} editing={editZone} />
      )}
      {vnetDialog && (
        <VNetDialog serverId={serverId} open={vnetDialog} onOpenChange={(v) => { setVNetDialog(v); if (!v) setEditVNet(null); }} editing={editVNet} zones={zones} />
      )}
    </Card>
  );
}
