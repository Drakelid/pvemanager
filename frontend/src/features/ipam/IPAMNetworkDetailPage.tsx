import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useIPAMNetwork, useIPAMNetworkStats, useIPAMAllocations, useIPAMPools,
  useUpdateNetwork, useDeleteNetwork, useCreatePool, useUpdatePool, useDeletePool, useIPAMIPMap,
} from '@/hooks/use-ipam';
import type { IPAMNetwork, IPAMPool } from '@/types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';

export default function IPAMNetworkDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const nid = Number(id);
  const { data: network } = useIPAMNetwork(nid);
  const { data: stats } = useIPAMNetworkStats(nid);
  const { data: pools = [] } = useIPAMPools(nid);
  const { data: allocations = [] } = useIPAMAllocations({ network_id: nid, limit: 100 });

  if (!network) return <div className="py-12 text-center text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button render={<Link to="/ipam/networks" />} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{network.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{network.network}</p>
        </div>
        <Badge variant={network.is_active ? 'default' : 'secondary'} className="ml-auto">{network.is_active ? 'Active' : 'Inactive'}</Badge>
        <NetworkActions network={network} />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t('ipam.total_ips')} value={stats?.total_ips ?? network.total_ips ?? 0} />
        <StatCard label={t('ipam.allocated')} value={stats?.allocated_ips ?? network.used_ips ?? 0} />
        <StatCard label={t('ipam.reserved')} value={stats?.reserved_ips ?? 0} />
        <StatCard label={t('ipam.available')} value={stats?.available_ips ?? network.available_ips ?? 0} />
      </div>

      {/* Utilization bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('ipam.utilization')}</span>
            <span className="text-sm">{(stats?.utilization_percent ?? network.utilization_percent ?? 0).toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(stats?.utilization_percent ?? network.utilization_percent ?? 0, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Network info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('ipam.network_info')}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <InfoRow label={t('common.gateway')} value={network.gateway || '—'} />
          <InfoRow label={t('common.vlan')} value={network.vlan_id ? String(network.vlan_id) : '—'} />
          <InfoRow label={t('common.dns')} value={network.dns_primary || '—'} />
          <InfoRow label={t('ipam.server')} value={network.server_name || '—'} />
          <InfoRow label={t('ipam.bridge')} value={network.proxmox_bridge || '—'} />
          {network.description && <InfoRow label={t('ipam.description')} value={network.description} />}
        </CardContent>
      </Card>

      {/* Pools */}
      <PoolsCard networkId={nid} pools={pools} />

      {/* IP map */}
      <IPMapCard networkId={nid} />

      {/* Allocations */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('ipam.allocations')} ({allocations.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('ipam.resource')}</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>{t('ipam.description')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono">{a.ip_address}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'allocated' ? 'default' : a.status === 'reserved' ? 'secondary' : 'outline'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{a.resource_name || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{a.mac_address || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.description || '—'}</TableCell>
                </TableRow>
              ))}
              {allocations.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NetworkActions({ network }: { network: IPAMNetwork }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateNet = useUpdateNetwork();
  const deleteNet = useDeleteNetwork();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [form, setForm] = useState({
    name: network.name,
    network: network.network,
    gateway: network.gateway ?? '',
    vlan_id: network.vlan_id ? String(network.vlan_id) : '',
    dns_primary: network.dns_primary ?? '',
    dns_secondary: network.dns_secondary ?? '',
    dns_domain: network.dns_domain ?? '',
    proxmox_bridge: network.proxmox_bridge ?? '',
    is_active: network.is_active,
    description: network.description ?? '',
  });

  const handleSave = () => {
    updateNet.mutate(
      {
        id: network.id,
        name: form.name,
        gateway: form.gateway || undefined,
        vlan_id: form.vlan_id ? Number(form.vlan_id) : undefined,
        dns_primary: form.dns_primary || undefined,
        dns_secondary: form.dns_secondary || undefined,
        dns_domain: form.dns_domain || undefined,
        proxmox_bridge: form.proxmox_bridge || undefined,
        is_active: form.is_active,
        description: form.description || undefined,
      },
      {
        onSuccess: () => { toast.success(t('ipam.network_updated')); setEditOpen(false); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const handleDelete = () => {
    deleteNet.mutate(
      { id: network.id, force },
      {
        onSuccess: () => { toast.success(t('ipam.network_deleted')); navigate('/ipam/networks'); },
        onError: (e: Error) => { toast.error(e.message); setForce(true); },
      },
    );
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /></Button>
      <Button variant="outline" size="sm" onClick={() => { setForce(false); setDelOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('ipam.edit_network')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.name')}><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
            <Field label="CIDR"><Input value={form.network} disabled className="font-mono" /></Field>
            <Field label={t('common.gateway')}><Input value={form.gateway} onChange={e => setForm(p => ({ ...p, gateway: e.target.value }))} /></Field>
            <Field label={t('common.vlan')}><Input value={form.vlan_id} onChange={e => setForm(p => ({ ...p, vlan_id: e.target.value }))} placeholder="100" /></Field>
            <Field label={`${t('common.dns')} 1`}><Input value={form.dns_primary} onChange={e => setForm(p => ({ ...p, dns_primary: e.target.value }))} /></Field>
            <Field label={`${t('common.dns')} 2`}><Input value={form.dns_secondary} onChange={e => setForm(p => ({ ...p, dns_secondary: e.target.value }))} /></Field>
            <Field label={t('ipam.dns_domain')}><Input value={form.dns_domain} onChange={e => setForm(p => ({ ...p, dns_domain: e.target.value }))} /></Field>
            <Field label={t('ipam.bridge')}><Input value={form.proxmox_bridge} onChange={e => setForm(p => ({ ...p, proxmox_bridge: e.target.value }))} placeholder="vmbr0" /></Field>
            <Field label={t('ipam.description')} full><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
              {t('ipam.is_active')}
            </label>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={!form.name || !form.network || updateNet.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('ipam.delete_network')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t('ipam.delete_network_confirm', { name: network.name })}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
            {t('ipam.force_delete')}
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteNet.isPending}>{t('common.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const emptyPool = { name: '', pool_type: 'static', range_start: '', range_end: '', auto_assign: false, description: '' };

function PoolsCard({ networkId, pools }: { networkId: number; pools: IPAMPool[] }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const createPool = useCreatePool();
  const updatePool = useUpdatePool();
  const deletePool = useDeletePool();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IPAMPool | null>(null);
  const [form, setForm] = useState<typeof emptyPool>(emptyPool);

  const openCreate = () => { setEditing(null); setForm(emptyPool); setOpen(true); };
  const openEdit = (p: IPAMPool) => {
    setEditing(p);
    setForm({ name: p.name, pool_type: p.pool_type, range_start: p.range_start, range_end: p.range_end, auto_assign: p.auto_assign, description: p.description ?? '' });
    setOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      name: form.name,
      pool_type: form.pool_type as IPAMPool['pool_type'],
      range_start: form.range_start,
      range_end: form.range_end,
      auto_assign: form.auto_assign,
      description: form.description || undefined,
    };
    if (editing) {
      updatePool.mutate({ id: editing.id, ...payload }, {
        onSuccess: () => { toast.success(t('ipam.pool_updated')); setOpen(false); },
        onError: (e: Error) => toast.error(e.message),
      });
    } else {
      createPool.mutate({ network_id: networkId, ...payload }, {
        onSuccess: () => { toast.success(t('ipam.pool_created')); setOpen(false); },
        onError: (e: Error) => toast.error(e.message),
      });
    }
  };

  const handleDelete = async (p: IPAMPool) => {
    if (!await confirm(t('ipam.delete_pool_confirm', { name: p.name }))) return;
    deletePool.mutate(p.id, {
      onSuccess: () => toast.success(t('ipam.pool_deleted')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">{t('ipam.pools')} ({pools.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />{t('ipam.add_pool')}</Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.type')}</TableHead>
              <TableHead>{t('ipam.range')}</TableHead>
              <TableHead>{t('ipam.usage')}</TableHead>
              <TableHead className="w-[1%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pools.map(pool => (
              <TableRow key={pool.id}>
                <TableCell className="font-medium">{pool.name}</TableCell>
                <TableCell><Badge variant="outline">{pool.pool_type}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{pool.range_start} — {pool.range_end}</TableCell>
                <TableCell className="text-xs">{pool.used_ips ?? 0} / {pool.total_ips ?? 0}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(pool)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(pool)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {pools.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t('ipam.edit_pool') : t('ipam.add_pool')}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.name')}><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></Field>
            <Field label={t('ipam.pool_type')}>
              <Select value={form.pool_type} onValueChange={v => { if (v) setForm(p => ({ ...p, pool_type: v })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">static</SelectItem>
                  <SelectItem value="dhcp">dhcp</SelectItem>
                  <SelectItem value="reserved">reserved</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={`${t('ipam.range')} (start)`}><Input value={form.range_start} onChange={e => setForm(p => ({ ...p, range_start: e.target.value }))} placeholder="10.0.0.10" /></Field>
            <Field label={`${t('ipam.range')} (end)`}><Input value={form.range_end} onChange={e => setForm(p => ({ ...p, range_end: e.target.value }))} placeholder="10.0.0.250" /></Field>
            <Field label={t('ipam.description')} full><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.auto_assign} onChange={e => setForm(p => ({ ...p, auto_assign: e.target.checked }))} />
              {t('ipam.auto_assign')}
            </label>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={!form.name || !form.range_start || !form.range_end || createPool.isPending || updatePool.isPending}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const ipMapColors: Record<string, string> = {
  gateway: 'bg-purple-500',
  allocated: 'bg-blue-500',
  reserved: 'bg-warning',
  available: 'bg-muted',
};

function IPMapCard({ networkId }: { networkId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useIPAMIPMap(networkId);
  const entries = data?.ip_map ?? [];
  const MAX = 1024;
  const shown = entries.slice(0, MAX);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('ipam.ip_map')}{entries.length > 0 && ` (${entries.length})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {shown.map(e => {
                const label = [
                  e.proxmox_vmid != null ? `VMID ${e.proxmox_vmid}` : null,
                  e.resource_name || e.hostname || null,
                  e.ip_address,
                ].filter(Boolean).join(' · ');
                return (
                  <div
                    key={e.ip_address}
                    title={`${label} (${e.status})`}
                    className={`h-3.5 w-3.5 rounded-sm ${ipMapColors[e.status] ?? 'bg-muted'} ${e.status === 'available' ? 'border border-border' : ''}`}
                  />
                );
              })}
            </div>
            {entries.length > MAX && (
              <p className="mt-2 text-xs text-muted-foreground">{t('ipam.ip_map_truncated', { shown: MAX, total: entries.length })}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {(['gateway', 'allocated', 'reserved', 'available'] as const).map(s => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`h-3 w-3 rounded-sm ${ipMapColors[s]} ${s === 'available' ? 'border border-border' : ''}`} />
                  {t(`ipam.${s}`, s)}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium font-mono">{value}</span>
    </div>
  );
}
