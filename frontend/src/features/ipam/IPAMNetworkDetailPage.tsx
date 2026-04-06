import { useParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIPAMNetwork, useIPAMNetworkStats, useIPAMAllocations, useIPAMPools } from '@/hooks/use-ipam';

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
          <InfoRow label="Gateway" value={network.gateway || '—'} />
          <InfoRow label="VLAN" value={network.vlan_id ? String(network.vlan_id) : '—'} />
          <InfoRow label="DNS" value={network.dns_primary || '—'} />
          <InfoRow label={t('ipam.server')} value={network.server_name || '—'} />
          <InfoRow label={t('ipam.bridge')} value={network.proxmox_bridge || '—'} />
          {network.description && <InfoRow label={t('ipam.description')} value={network.description} />}
        </CardContent>
      </Card>

      {/* Pools */}
      {pools.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('ipam.pools')} ({pools.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>{t('ipam.range')}</TableHead>
                  <TableHead>{t('ipam.usage')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pools.map(pool => (
                  <TableRow key={pool.id}>
                    <TableCell className="font-medium">{pool.name}</TableCell>
                    <TableCell><Badge variant="outline">{pool.pool_type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{pool.range_start} — {pool.range_end}</TableCell>
                    <TableCell className="text-xs">{pool.used_ips ?? 0} / {pool.total_ips ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
