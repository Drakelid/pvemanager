import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, History } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIPAMHistory, useIPAMNetworks } from '@/hooks/use-ipam';

export default function IPAMHistoryPage() {
  const { t } = useTranslation();
  const [networkId, setNetworkId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { data: networks = [] } = useIPAMNetworks();
  const { data: history = [] } = useIPAMHistory(networkId !== 'all' ? { network_id: Number(networkId) } : undefined);

  const filtered = history.filter(h => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      h.action?.toLowerCase().includes(s) ||
      h.ip_address?.toLowerCase().includes(s) ||
      h.username?.toLowerCase().includes(s) ||
      h.details?.toLowerCase().includes(s)
    );
  });

  const actionColor = (action: string) => {
    if (action.includes('create') || action.includes('allocate')) return 'default';
    if (action.includes('delete') || action.includes('release')) return 'destructive';
    return 'secondary';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <History className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{t('ipam.history')}</h1>
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
                  <SelectItem key={n.id} value={String(n.id)}>{n.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead>{t('ipam.action')}</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>{t('ipam.network')}</TableHead>
                <TableHead>{t('common.user')}</TableHead>
                <TableHead>{t('ipam.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h, i) => (
                <TableRow key={h.id ?? i}>
                  <TableCell className="text-xs whitespace-nowrap">{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</TableCell>
                  <TableCell><Badge variant={actionColor(h.action || '') as any}>{h.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{h.ip_address || '—'}</TableCell>
                  <TableCell className="text-xs">{h.network_name || '—'}</TableCell>
                  <TableCell className="text-xs">{h.username || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{h.details || '—'}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
