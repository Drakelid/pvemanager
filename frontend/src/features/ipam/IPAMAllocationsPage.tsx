import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Pencil, Trash2, Wand2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useIPAMAllocations, useIPAMNetworks, useDeleteAllocation,
  useCreateAllocation, useUpdateAllocation, useNextAvailableIP,
} from '@/hooks/use-ipam';
import type { IPAMAllocation } from '@/types';
import { toast } from 'sonner';

const STATUSES = ['allocated', 'reserved', 'available', 'conflict'] as const;
const RESOURCE_TYPES = ['vm', 'lxc', 'physical', 'service', 'reserved'] as const;

export default function IPAMAllocationsPage() {
  const { t } = useTranslation();
  const [networkId, setNetworkId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<IPAMAllocation | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: networks = [] } = useIPAMNetworks();
  const { data: allocations = [] } = useIPAMAllocations({
    network_id: networkId !== 'all' ? Number(networkId) : undefined,
    limit: 200,
  });
  const deleteAllocation = useDeleteAllocation();

  const filtered = allocations.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        a.ip_address?.toLowerCase().includes(s) ||
        a.resource_name?.toLowerCase().includes(s) ||
        a.mac_address?.toLowerCase().includes(s) ||
        a.description?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleDelete = (a: IPAMAllocation) => {
    if (!confirm(t('ipam.delete_allocation_confirm', { ip: a.ip_address }))) return;
    deleteAllocation.mutate(a.id, {
      onSuccess: () => toast.success(t('ipam.released')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('ipam.allocations')}</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('ipam.add_allocation')}</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={networkId} onValueChange={v => { if (v !== null) setNetworkId(v); }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder={t('ipam.network')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {networks.map(n => (
                  <SelectItem key={n.id} value={String(n.id)}>{n.name} ({n.network})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { if (v !== null) setStatusFilter(v); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="allocated">Allocated</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="available">Available</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('ipam.network')}</TableHead>
                <TableHead>{t('ipam.resource')}</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>{t('ipam.description')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono">{a.ip_address}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'allocated' ? 'default' : a.status === 'reserved' ? 'secondary' : 'outline'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{a.network_name || '—'}</TableCell>
                  <TableCell className="text-xs">{a.resource_name || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{a.mac_address || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{a.description || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateAllocationDialog open={createOpen} onOpenChange={setCreateOpen} networks={networks} />
      <EditAllocationDialog allocation={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CreateAllocationDialog({
  open, onOpenChange, networks,
}: { open: boolean; onOpenChange: (v: boolean) => void; networks: { id: number; name: string; network: string }[] }) {
  const { t } = useTranslation();
  const createAllocation = useCreateAllocation();
  const nextAvail = useNextAvailableIP();
  const empty = { network_id: '', ip_address: '', mac_address: '', resource_name: '', resource_type: 'vm', status: 'allocated', hostname: '', notes: '' };
  const [form, setForm] = useState(empty);

  const handleNext = () => {
    if (!form.network_id) { toast.error(t('ipam.select_network')); return; }
    nextAvail.mutate({ networkId: Number(form.network_id) }, {
      onSuccess: (r) => setForm(p => ({ ...p, ip_address: r.next_available_ip })),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleSubmit = () => {
    createAllocation.mutate(
      {
        network_id: Number(form.network_id),
        ip_address: form.ip_address,
        mac_address: form.mac_address || undefined,
        resource_name: form.resource_name || undefined,
        resource_type: form.resource_type || undefined,
        status: form.status as IPAMAllocation['status'],
        hostname: form.hostname || undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => { toast.success(t('ipam.allocation_created')); onOpenChange(false); setForm(empty); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('ipam.add_allocation')}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('ipam.network')} full>
            <Select value={form.network_id} onValueChange={v => { if (v) setForm(p => ({ ...p, network_id: v })); }}>
              <SelectTrigger><SelectValue placeholder={t('ipam.select_network')} /></SelectTrigger>
              <SelectContent>
                {networks.map(n => <SelectItem key={n.id} value={String(n.id)}>{n.name} ({n.network})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="IP" full>
            <div className="flex gap-2">
              <Input value={form.ip_address} onChange={e => setForm(p => ({ ...p, ip_address: e.target.value }))} placeholder="10.0.0.10" className="font-mono" />
              <Button type="button" variant="outline" size="sm" onClick={handleNext} disabled={!form.network_id || nextAvail.isPending} title={t('ipam.next_available')}>
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="MAC"><Input value={form.mac_address} onChange={e => setForm(p => ({ ...p, mac_address: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" className="font-mono" /></Field>
          <Field label={t('ipam.resource')}><Input value={form.resource_name} onChange={e => setForm(p => ({ ...p, resource_name: e.target.value }))} /></Field>
          <Field label={t('common.type')}>
            <Select value={form.resource_type} onValueChange={v => { if (v) setForm(p => ({ ...p, resource_type: v })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RESOURCE_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select value={form.status} onValueChange={v => { if (v) setForm(p => ({ ...p, status: v })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Hostname"><Input value={form.hostname} onChange={e => setForm(p => ({ ...p, hostname: e.target.value }))} /></Field>
          <Field label={t('ipam.notes')} full><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></Field>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!form.network_id || !form.ip_address || createAllocation.isPending}>{t('common.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAllocationDialog({ allocation, onClose }: { allocation: IPAMAllocation | null; onClose: () => void }) {
  const { t } = useTranslation();
  const updateAllocation = useUpdateAllocation();
  const [form, setForm] = useState({ mac_address: '', resource_name: '', status: 'allocated', hostname: '', notes: '' });

  // Sync local form when a new allocation is selected.
  const [syncedId, setSyncedId] = useState<number | null>(null);
  if (allocation && allocation.id !== syncedId) {
    setSyncedId(allocation.id);
    setForm({
      mac_address: allocation.mac_address ?? '',
      resource_name: allocation.resource_name ?? '',
      status: allocation.status,
      hostname: allocation.hostname ?? '',
      notes: allocation.notes ?? '',
    });
  }

  const handleSubmit = () => {
    if (!allocation) return;
    updateAllocation.mutate(
      {
        id: allocation.id,
        mac_address: form.mac_address || undefined,
        resource_name: form.resource_name || undefined,
        status: form.status as IPAMAllocation['status'],
        hostname: form.hostname || undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => { toast.success(t('ipam.allocation_updated')); onClose(); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={!!allocation} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('ipam.edit_allocation')} {allocation?.ip_address}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="MAC"><Input value={form.mac_address} onChange={e => setForm(p => ({ ...p, mac_address: e.target.value }))} className="font-mono" /></Field>
          <Field label={t('ipam.resource')}><Input value={form.resource_name} onChange={e => setForm(p => ({ ...p, resource_name: e.target.value }))} /></Field>
          <Field label={t('common.status')}>
            <Select value={form.status} onValueChange={v => { if (v) setForm(p => ({ ...p, status: v })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Hostname"><Input value={form.hostname} onChange={e => setForm(p => ({ ...p, hostname: e.target.value }))} /></Field>
          <Field label={t('ipam.notes')} full><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></Field>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={updateAllocation.isPending}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
