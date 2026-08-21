import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, AlertTriangle, Ghost, Unlink, Wand2, Search, Link2, Trash2, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useIPAMNetworks, useIPAMSummary,
  useIPAMConflicts, useIPAMOrphans, useIPAMUnlinked,
  useCleanupOrphans, useLinkAllocations, useAutoAllocate, useNextAvailableIP, useIPHistoryLookup,
} from '@/hooks/use-ipam';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';

export default function IPAMToolsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button render={<Link to="/ipam" />} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold">{t('ipam.tools')}</h1>
      </div>

      <SummaryCard />
      <AllocateCard />
      <ConflictsCard />
      <OrphansCard />
      <UnlinkedCard />
      <IPHistoryCard />
    </div>
  );
}

function SummaryCard() {
  const { t } = useTranslation();
  const { data } = useIPAMSummary();
  const s = data as Record<string, unknown> | undefined;
  const recent = (s?.recent_allocations as Array<{ ip: string; resource?: string; by?: string; at?: string }>) || [];
  const stat = (k: string) => Number(s?.[k] ?? 0);

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{t('ipam.summary')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {([
            ['networks_count', t('ipam.networks_count')],
            ['pools_count', t('ipam.pools')],
            ['total_allocated', t('ipam.total_allocated')],
            ['total_reserved', t('ipam.total_reserved')],
            ['vm_count', 'VM'],
            ['lxc_count', 'LXC'],
          ] as const).map(([k, label]) => (
            <div key={k} className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{stat(k)}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {recent.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">{t('ipam.recent_activity')}</p>
            <div className="rounded-lg border divide-y text-sm">
              {recent.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <span className="font-mono">{r.ip}</span>
                  <span className="text-muted-foreground">{r.resource || ''}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{r.by} · {r.at ? new Date(r.at).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AllocateCard() {
  const { t } = useTranslation();
  const { data: networks = [] } = useIPAMNetworks();
  const autoAllocate = useAutoAllocate();
  const nextAvail = useNextAvailableIP();
  const [networkId, setNetworkId] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [hostname, setHostname] = useState('');

  const handleNext = () => {
    if (!networkId) { toast.error(t('ipam.select_network')); return; }
    nextAvail.mutate({ networkId: Number(networkId) }, {
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const handleAllocate = () => {
    if (!networkId) { toast.error(t('ipam.select_network')); return; }
    if (!resourceName.trim()) { toast.error(t('ipam.resource_required')); return; }
    autoAllocate.mutate(
      { network_id: Number(networkId), resource_name: resourceName || undefined, hostname: hostname || undefined },
      {
        onSuccess: (a) => { toast.success(`${t('ipam.allocated')}: ${a.ip_address}`); setResourceName(''); setHostname(''); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Wand2 className="h-5 w-5" />{t('ipam.auto_allocate')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>{t('ipam.network')}</Label>
            <Select value={networkId} onValueChange={v => { if (v) setNetworkId(v); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t('ipam.select_network')} /></SelectTrigger>
              <SelectContent>
                {networks.map(n => <SelectItem key={n.id} value={String(n.id)}>{n.name} ({n.network})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('ipam.resource')}</Label>
            <Input value={resourceName} onChange={e => setResourceName(e.target.value)} className="mt-1" placeholder="web-01" />
          </div>
          <div>
            <Label>Hostname</Label>
            <Input value={hostname} onChange={e => setHostname(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleNext} disabled={nextAvail.isPending || !networkId}>
            <Search className="mr-1 h-4 w-4" />{t('ipam.next_available')}
          </Button>
          {nextAvail.data && <Badge variant="secondary" className="font-mono">{nextAvail.data.next_available_ip}</Badge>}
          <Button size="sm" onClick={handleAllocate} disabled={autoAllocate.isPending || !networkId} className="ml-auto">
            <Wand2 className="mr-1 h-4 w-4" />{t('ipam.allocate_next')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('ipam.pool_required_hint')}</p>
      </CardContent>
    </Card>
  );
}

function ConflictsCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useIPAMConflicts();
  const conflicts = data?.conflicts ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5" />{t('ipam.conflicts')}
          {data && <Badge variant={data.count > 0 ? 'destructive' : 'secondary'}>{data.count}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          : conflicts.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t('ipam.no_conflicts')}</p>
          : (
            <div className="rounded-lg border divide-y text-sm">
              {conflicts.map((c, i) => (
                <div key={i} className="px-3 py-2 font-mono">{c.ip_address} — {JSON.stringify(c)}</div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}

function OrphansCard() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data, isLoading } = useIPAMOrphans();
  const cleanup = useCleanupOrphans();
  const orphans = data?.orphans ?? [];

  const handleCleanup = async () => {
    if (!await confirm(t('ipam.cleanup_confirm'))) return;
    cleanup.mutate(undefined, {
      onSuccess: (r) => toast.success(`${t('ipam.released')}: ${r.released_count}`),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ghost className="h-5 w-5" />{t('ipam.orphans')}
          {data && <Badge variant={data.count > 0 ? 'destructive' : 'secondary'}>{data.count}</Badge>}
        </CardTitle>
        {orphans.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleCleanup} disabled={cleanup.isPending}>
            <Trash2 className="mr-1 h-4 w-4" />{t('ipam.cleanup_orphans')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          : orphans.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t('ipam.no_orphans')}</p>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>IP</TableHead><TableHead>{t('ipam.resource')}</TableHead>
                <TableHead>VMID</TableHead><TableHead>{t('common.status')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {orphans.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.ip_address}</TableCell>
                    <TableCell>{o.resource_name || '—'}</TableCell>
                    <TableCell>{o.proxmox_vmid ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function UnlinkedCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useIPAMUnlinked();
  const link = useLinkAllocations();
  const unlinked = data?.unlinked ?? [];

  const handleLink = () => {
    link.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(`${t('ipam.linked')}: ${r.linked?.length ?? 0}`);
        // Пропуски (дубль IP, недоступный сервер, адрес вне сетей IPAM) иначе
        // видны только в логах бэкенда — показываем причины первых записей.
        const skipped = r.not_found ?? [];
        if (skipped.length > 0) {
          toast.warning(t('ipam.link_skipped', { count: skipped.length }), {
            description: skipped
              .slice(0, 3)
              .map((s) => `${s.resource_name}: ${s.reason}`)
              .join('\n'),
          });
        }
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Unlink className="h-5 w-5" />{t('ipam.unlinked')}
          {data && <Badge variant="secondary">{data.count}</Badge>}
        </CardTitle>
        {unlinked.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleLink} disabled={link.isPending}>
            <Link2 className="mr-1 h-4 w-4" />{t('ipam.link_allocations')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          : unlinked.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t('ipam.no_unlinked')}</p>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t('ipam.resource')}</TableHead><TableHead>IP</TableHead>
                <TableHead>VMID</TableHead><TableHead>{t('nodes.title')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {unlinked.map((u, i) => (
                  <TableRow key={i}>
                    <TableCell>{u.resource_name || '—'}</TableCell>
                    <TableCell className="font-mono">{u.ip_address}</TableCell>
                    <TableCell>{u.suggested_vmid ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.suggested_server_name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function IPHistoryCard() {
  const { t } = useTranslation();
  const lookup = useIPHistoryLookup();
  const [ip, setIp] = useState('');
  const rows = (lookup.data as Array<Record<string, unknown>>) || [];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5" />{t('ipam.ip_history')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input value={ip} onChange={e => setIp(e.target.value)} placeholder="10.0.0.10" className="max-w-xs font-mono"
            onKeyDown={e => { if (e.key === 'Enter' && ip) lookup.mutate(ip); }} />
          <Button size="sm" variant="outline" onClick={() => ip && lookup.mutate(ip)} disabled={lookup.isPending || !ip}>
            <Search className="mr-1 h-4 w-4" />{t('common.search')}
          </Button>
        </div>
        {lookup.isSuccess && (
          rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
          : (
            <div className="rounded-lg border divide-y text-sm">
              {rows.map((h, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <Badge variant="outline" className="text-2xs">{String(h.action ?? '')}</Badge>
                  <span className="text-muted-foreground">{String(h.resource_name ?? '')}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {String(h.performed_by ?? '')} · {h.performed_at ? new Date(String(h.performed_at)).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
