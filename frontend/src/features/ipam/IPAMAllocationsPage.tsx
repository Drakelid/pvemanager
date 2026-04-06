import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIPAMAllocations, useIPAMNetworks, useDeleteAllocation } from '@/hooks/use-ipam';
import { Trash2 } from 'lucide-react';

export default function IPAMAllocationsPage() {
  const { t } = useTranslation();
  const [networkId, setNetworkId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('ipam.allocations')}</h1>

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
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAllocation.mutate(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
    </div>
  );
}
