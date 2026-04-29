import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Server, Monitor, Container, Plus, Pencil, Trash2, Wifi, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useServers, useCreateServer, useUpdateServer, useDeleteServer, useTestServer } from '@/hooks/use-nodes';
import { useVirtualMachines } from '@/hooks/use-instances';
import type { ProxmoxServerCreate } from '@/types';
import { toast } from 'sonner';

interface ServerFormData {
  name: string;
  hostname: string;
  ip_address: string;
  port: string;
  api_user: string;
  api_token_name: string;
  api_token_value: string;
  use_password: boolean;
  password: string;
  verify_ssl: boolean;
  description: string;
}

const emptyForm: ServerFormData = {
  name: '',
  hostname: '',
  ip_address: '',
  port: '8006',
  api_user: 'root@pam',
  api_token_name: '',
  api_token_value: '',
  use_password: false,
  password: '',
  verify_ssl: false,
  description: '',
};

function ServerFormDialog({
  open,
  onOpenChange,
  title,
  initialData,
  onSubmit,
  isPending,
  serverId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initialData: ServerFormData;
  onSubmit: (data: ProxmoxServerCreate) => void;
  isPending: boolean;
  serverId?: number;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ServerFormData>(initialData);
  const testServer = useTestServer();

  // Sync initialData when dialog opens
  const handleOpen = (v: boolean) => {
    if (v) setForm(initialData);
    onOpenChange(v);
  };

  const set = (field: keyof ServerFormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = () => {
    const payload: ProxmoxServerCreate = {
      name: form.name,
      hostname: form.hostname || form.ip_address,
      ip_address: form.ip_address,
      port: form.port ? Number(form.port) : 8006,
      api_user: form.api_user || 'root@pam',
      verify_ssl: form.verify_ssl,
      description: form.description || undefined,
    };
    if (form.use_password) {
      payload.use_password = true;
      payload.password = form.password;
    } else {
      payload.api_token_name = form.api_token_name;
      payload.api_token_value = form.api_token_value;
    }
    onSubmit(payload);
  };

  const handleTest = () => {
    if (!serverId) return;
    testServer.mutate(serverId, {
      onSuccess: (res) => {
        if (res.success) toast.success(t('nodes.connection_ok'));
        else toast.error(t('nodes.connection_failed') + (res.message ? `: ${res.message}` : ''));
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{t('common.name')}</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} className="mt-1" placeholder={t('common.my_proxmox_server')} />
            </div>
            <div>
              <Label>{t('nodes.hostname')}</Label>
              <Input value={form.ip_address} onChange={e => { set('ip_address', e.target.value); set('hostname', e.target.value); }} className="mt-1" placeholder="192.168.1.100" />
            </div>
            <div>
              <Label>{t('nodes.port')}</Label>
              <Input type="number" value={form.port} onChange={e => set('port', e.target.value)} className="mt-1" placeholder="8006" />
            </div>
            <div>
              <Label>{t('nodes.api_user')}</Label>
              <Input value={form.api_user} onChange={e => set('api_user', e.target.value)} className="mt-1" placeholder={t('common.placeholder_root_pam')} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="use_password"
              type="checkbox"
              checked={form.use_password}
              onChange={e => set('use_password', e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="use_password" className="cursor-pointer">{t('nodes.use_password')}</Label>
          </div>

          {form.use_password ? (
            <div>
              <Label>{t('wizard.password')}</Label>
              <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} className="mt-1" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('nodes.api_token_name')}</Label>
                <Input value={form.api_token_name} onChange={e => set('api_token_name', e.target.value)} className="mt-1" placeholder="mytoken" />
              </div>
              <div>
                <Label>{t('nodes.api_token_value')}</Label>
                <Input value={form.api_token_value} onChange={e => set('api_token_value', e.target.value)} className="mt-1" placeholder="xxxxxxxx-xxxx-..." />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id="verify_ssl"
              type="checkbox"
              checked={form.verify_ssl}
              onChange={e => set('verify_ssl', e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="verify_ssl" className="cursor-pointer">{t('nodes.verify_ssl')}</Label>
          </div>

          <div>
            <Label>{t('ipam.description')}</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {serverId && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testServer.isPending}>
              {testServer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4 mr-1" />}
              {t('nodes.test_connection')}
            </Button>
          )}
          <DialogClose render={<Button variant="outline" />}>{t('common.cancel')}</DialogClose>
          <Button onClick={handleSubmit} disabled={isPending || !form.name || !form.ip_address}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NodesPage() {
  const { t } = useTranslation();
  const { data: servers = [], isLoading } = useServers();
  const { data: vms = [] } = useVirtualMachines();
  const createServer = useCreateServer();
  const updateServer = useUpdateServer();
  const deleteServer = useDeleteServer();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editServerId, setEditServerId] = useState<number | null>(null);
  const [editInitial, setEditInitial] = useState<ServerFormData>(emptyForm);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">{t('common.loading')}</div>;
  }

  const handleCreate = (data: ProxmoxServerCreate) => {
    createServer.mutate(data, {
      onSuccess: () => { toast.success(t('common.save')); setCreateOpen(false); },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleEdit = (data: ProxmoxServerCreate) => {
    if (!editServerId) return;
    updateServer.mutate({ id: editServerId, ...data }, {
      onSuccess: () => { toast.success(t('common.save')); setEditOpen(false); },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`${t('common.confirm_delete')} "${name}"?`)) return;
    deleteServer.mutate(id, {
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.nodes')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />{t('nodes.add_server')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.map(srv => {
          const srvVMs = vms.filter(v => v.server_id === srv.id && v.type === 'qemu');
          const srvCTs = vms.filter(v => v.server_id === srv.id && v.type === 'lxc');
          return (
            <Card key={srv.id} className="relative group">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <Link to={`/nodes/${srv.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Server className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{srv.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{srv.ip_address}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditServerId(srv.id);
                        setEditInitial({
                          name: srv.name,
                          hostname: srv.hostname || srv.ip_address,
                          ip_address: srv.ip_address,
                          port: String(srv.port || 8006),
                          api_user: srv.api_user || 'root@pam',
                          api_token_name: '',
                          api_token_value: '',
                          use_password: false,
                          password: '',
                          verify_ssl: srv.verify_ssl || false,
                          description: srv.description || '',
                        });
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(srv.id, srv.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5" />
                      <span>{srvVMs.length} VM</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Container className="h-3.5 w-3.5" />
                      <span>{srvCTs.length} LXC</span>
                    </div>
                  </div>
                  <Badge variant={srv.is_online ? 'default' : 'destructive'}>
                    {srv.is_online ? t('common.online') : t('common.offline')}
                  </Badge>
                </div>

                {srv.description && (
                  <p className="text-xs text-muted-foreground truncate">{srv.description}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Server className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p className="mb-4">{t('nodes.no_servers')}</p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />{t('nodes.add_server')}
          </Button>
        </div>
      )}

      <ServerFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('nodes.add_server')}
        initialData={emptyForm}
        onSubmit={handleCreate}
        isPending={createServer.isPending}
      />

      <ServerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t('nodes.edit_server')}
        initialData={editInitial}
        onSubmit={handleEdit}
        isPending={updateServer.isPending}
        serverId={editServerId ?? undefined}
      />
    </div>
  );
}
