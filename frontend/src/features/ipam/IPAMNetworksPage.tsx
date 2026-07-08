import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Globe, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useIPAMNetworks, useCreateNetwork } from '@/hooks/use-ipam';
import { WorkspaceSelect } from './WorkspaceSelect';
import { toast } from 'sonner';

const emptyForm = {
  name: '', network: '', gateway: '', description: '', proxmox_bridge: '',
  workspace_id: undefined as number | undefined, is_default: false,
};

export default function IPAMNetworksPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: networks = [], isLoading } = useIPAMNetworks();
  const createNet = useCreateNetwork();

  const filtered = networks.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.network.includes(search)
  );

  const handleCreate = () => {
    createNet.mutate({
      name: form.name,
      network: form.network,
      gateway: form.gateway || undefined,
      description: form.description || undefined,
      proxmox_bridge: form.proxmox_bridge || undefined,
      workspace_id: form.workspace_id,
      is_default: form.is_default,
    }, {
      onSuccess: () => { toast.success(t('ipam.network_created')); setDialogOpen(false); setForm(emptyForm); },
      onError: (err: Error) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('ipam.networks')}</h1>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />{t('ipam.add_network')}</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-center py-12 text-muted-foreground">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>{t('ipam.no_networks')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(net => (
            <Link key={net.id} to={`/ipam/network/${net.id}`}>
              <Card className="hover:border-blue-500/50 transition-colors h-full">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{net.name}</span>
                    <Badge variant={net.is_active ? 'default' : 'secondary'}>{net.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="text-sm font-mono text-muted-foreground">{net.network}</p>
                  {net.gateway && <p className="text-xs text-muted-foreground">GW: {net.gateway}</p>}
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(net.utilization_percent || 0, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{net.used_ips ?? 0} / {net.total_ips ?? 0} {t('ipam.ips_used')}</span>
                    <span>{(net.utilization_percent ?? 0).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {net.workspace_name && <span>{net.workspace_name}</span>}
                    {net.is_default && <Badge variant="outline" className="text-2xs">{t('ipam.default', 'по умолчанию')}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('ipam.add_network')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('common.name')}</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>CIDR</Label><Input value={form.network} onChange={e => setForm(p => ({ ...p, network: e.target.value }))} placeholder="10.0.0.0/24" /></div>
            <div><Label>Gateway</Label><Input value={form.gateway} onChange={e => setForm(p => ({ ...p, gateway: e.target.value }))} placeholder="10.0.0.1" /></div>
            <WorkspaceSelect value={form.workspace_id} onChange={(id) => setForm(p => ({ ...p, workspace_id: id }))} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} />
              {t('ipam.is_default', 'Сеть по умолчанию для области')}
            </label>
            <div><Label>{t('ipam.bridge')}</Label><Input value={form.proxmox_bridge} onChange={e => setForm(p => ({ ...p, proxmox_bridge: e.target.value }))} placeholder="vmbr0" /></div>
            <div><Label>{t('ipam.description')}</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <Button onClick={handleCreate} disabled={!form.name || !form.network || createNet.isPending} className="w-full">{t('common.create')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
