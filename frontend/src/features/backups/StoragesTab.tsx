import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Database, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServers } from '@/hooks/use-nodes';
import {
  useBackupStorages, useProxmoxBackupJobs,
  useCreateStorage, useUpdateStorage, useDeleteStorage,
} from '@/hooks/use-backups';
import { formatBytes } from '@/lib/format';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';

const STORAGE_TYPES = ['dir', 'nfs', 'cifs', 'pbs'];

interface StorageRow {
  storage: string;
  type: string;
  content?: string;
  nodes?: string;
  path?: string;
  server?: string;
  export?: string;
  share?: string;
  datastore?: string;
  disable?: number;
  used?: number;
  total?: number;
  avail?: number;
}

interface StorageForm {
  storage: string;
  type: string;
  content: string;
  nodes: string;
  path: string;
  server: string;
  export: string;
  share: string;
  datastore: string;
  username: string;
  password: string;
  fingerprint: string;
}

const emptyForm: StorageForm = {
  storage: '', type: 'dir', content: 'backup', nodes: '',
  path: '', server: '', export: '', share: '', datastore: '',
  username: '', password: '', fingerprint: '',
};

function StorageDialog({ serverId, open, onOpenChange, editing }: {
  serverId: number; open: boolean; onOpenChange: (v: boolean) => void; editing: StorageRow | null;
}) {
  const { t } = useTranslation();
  const createStorage = useCreateStorage(serverId);
  const updateStorage = useUpdateStorage(serverId);
  const [form, setForm] = useState<StorageForm>(() => editing ? {
    ...emptyForm,
    storage: editing.storage,
    type: editing.type,
    content: editing.content || 'backup',
    nodes: editing.nodes || '',
    path: editing.path || '',
    server: editing.server || '',
    export: editing.export || '',
    share: editing.share || '',
    datastore: editing.datastore || '',
  } : emptyForm);
  const set = <K extends keyof StorageForm>(k: K, v: StorageForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const submit = () => {
    if (!editing && !form.storage.trim()) { toast.error(t('storages.id_required')); return; }
    const done = (msg: string) => { toast.success(msg); onOpenChange(false); };

    if (editing) {
      // Only a subset is updatable; id and type are immutable in PVE.
      const payload: Record<string, unknown> = { content: form.content.trim() || 'backup' };
      if (form.nodes.trim()) payload.nodes = form.nodes.trim();
      updateStorage.mutate({ storage: editing.storage, ...payload }, {
        onSuccess: () => done(t('storages.saved')),
        onError: (e: Error) => toast.error(e.message),
      });
      return;
    }

    const payload: Record<string, unknown> = {
      storage: form.storage.trim(),
      type: form.type,
      content: form.content.trim() || 'backup',
    };
    if (form.nodes.trim()) payload.nodes = form.nodes.trim();
    if (form.type === 'dir') payload.path = form.path.trim();
    if (form.type === 'nfs') { payload.server = form.server.trim(); payload.export = form.export.trim(); }
    if (form.type === 'cifs') {
      payload.server = form.server.trim(); payload.share = form.share.trim();
      if (form.username.trim()) payload.username = form.username.trim();
      if (form.password) payload.password = form.password;
    }
    if (form.type === 'pbs') {
      payload.server = form.server.trim(); payload.datastore = form.datastore.trim();
      if (form.username.trim()) payload.username = form.username.trim();
      if (form.password) payload.password = form.password;
      if (form.fingerprint.trim()) payload.fingerprint = form.fingerprint.trim();
    }
    createStorage.mutate(payload, {
      onSuccess: () => done(t('storages.created')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const pending = createStorage.isPending || updateStorage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `${t('storages.edit')} ${editing.storage}` : t('storages.add')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('storages.id')}</Label>
              <Input value={form.storage} onChange={e => set('storage', e.target.value)} disabled={!!editing} className="mt-1" placeholder="backup-nfs" />
            </div>
            <div>
              <Label>{t('storages.type')}</Label>
              <Select value={form.type} onValueChange={v => { if (v) set('type', v); }} disabled={!!editing}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{STORAGE_TYPES.map(ty => <SelectItem key={ty} value={ty}>{ty.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {!editing && form.type === 'dir' && (
            <div><Label>{t('storages.path')}</Label><Input value={form.path} onChange={e => set('path', e.target.value)} className="mt-1" placeholder="/mnt/backups" /></div>
          )}
          {!editing && form.type === 'nfs' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('storages.server')}</Label><Input value={form.server} onChange={e => set('server', e.target.value)} className="mt-1" placeholder="10.0.0.5" /></div>
              <div><Label>{t('storages.export')}</Label><Input value={form.export} onChange={e => set('export', e.target.value)} className="mt-1" placeholder="/exports/backup" /></div>
            </div>
          )}
          {!editing && form.type === 'cifs' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('storages.server')}</Label><Input value={form.server} onChange={e => set('server', e.target.value)} className="mt-1" /></div>
              <div><Label>{t('storages.share')}</Label><Input value={form.share} onChange={e => set('share', e.target.value)} className="mt-1" /></div>
              <div><Label>{t('storages.username')}</Label><Input value={form.username} onChange={e => set('username', e.target.value)} className="mt-1" /></div>
              <div><Label>{t('storages.password')}</Label><Input type="password" value={form.password} onChange={e => set('password', e.target.value)} className="mt-1" /></div>
            </div>
          )}
          {!editing && form.type === 'pbs' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('storages.server')}</Label><Input value={form.server} onChange={e => set('server', e.target.value)} className="mt-1" /></div>
              <div><Label>{t('storages.datastore')}</Label><Input value={form.datastore} onChange={e => set('datastore', e.target.value)} className="mt-1" /></div>
              <div><Label>{t('storages.username')}</Label><Input value={form.username} onChange={e => set('username', e.target.value)} className="mt-1" placeholder="user@pbs" /></div>
              <div><Label>{t('storages.password')}</Label><Input type="password" value={form.password} onChange={e => set('password', e.target.value)} className="mt-1" /></div>
              <div className="col-span-2"><Label>{t('storages.fingerprint')}</Label><Input value={form.fingerprint} onChange={e => set('fingerprint', e.target.value)} className="mt-1 font-mono" /></div>
            </div>
          )}

          <div><Label>{t('storages.content')}</Label><Input value={form.content} onChange={e => set('content', e.target.value)} className="mt-1" placeholder="backup,images,iso" /></div>
          <div><Label>{t('storages.nodes')}</Label><Input value={form.nodes} onChange={e => set('nodes', e.target.value)} className="mt-1" placeholder={t('storages.nodes_placeholder')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={pending || (!editing && !form.storage.trim())}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StoragesTab() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data: servers = [] } = useServers();
  const [serverId, setServerId] = useState(0);

  useEffect(() => {
    if (serverId === 0 && servers.length > 0) setServerId(servers[0].id);
  }, [servers, serverId]);

  const { data: storagesData, isLoading } = useBackupStorages(serverId);
  const { data: jobsData } = useProxmoxBackupJobs(serverId);
  const deleteStorage = useDeleteStorage(serverId);

  const storages = (storagesData?.storages ?? []) as StorageRow[];
  const nativeJobs = (jobsData?.jobs ?? []) as Array<Record<string, unknown>>;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StorageRow | null>(null);

  const handleDelete = async (s: string) => {
    if (!await confirm(`${t('storages.delete_confirm')} "${s}"?`)) return;
    deleteStorage.mutate(s, {
      onSuccess: () => toast.success(t('storages.deleted')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={serverId ? String(serverId) : ''} onValueChange={v => { if (v) setServerId(Number(v)); }}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder={t('backups.select_server')} /></SelectTrigger>
          <SelectContent>{servers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" className="ml-auto" onClick={() => { setEditing(null); setDialogOpen(true); }} disabled={!serverId}>
          <Plus className="mr-1 h-4 w-4" />{t('storages.add')}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5" />{t('storages.title')}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
            : storages.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
            : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t('storages.id')}</TableHead>
                  <TableHead>{t('storages.type')}</TableHead>
                  <TableHead>{t('storages.content')}</TableHead>
                  <TableHead>{t('storages.nodes')}</TableHead>
                  <TableHead>{t('storages.usage')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {storages.map(s => (
                    <TableRow key={s.storage}>
                      <TableCell className="font-mono font-medium">
                        {s.storage}
                        {s.disable === 1 && <Badge variant="secondary" className="ml-2 text-[10px]">{t('storages.disabled')}</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                      <TableCell className="text-xs">{s.content || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.nodes || t('storages.all_nodes')}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.total ? `${formatBytes(s.used || 0)} / ${formatBytes(s.total)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(s); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s.storage)}>
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
      </Card>

      {/* Native PVE backup schedules (read-only) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5" />{t('storages.native_jobs')}</CardTitle></CardHeader>
        <CardContent>
          {nativeJobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('storages.no_native_jobs')}</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>{t('storages.schedule')}</TableHead>
                <TableHead>{t('storages.id')}</TableHead><TableHead>{t('backups.mode')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {nativeJobs.map((j, i) => (
                  <TableRow key={String(j.id ?? i)}>
                    <TableCell className="font-mono text-xs">{String(j.id ?? '—')}</TableCell>
                    <TableCell className="font-mono text-xs">{String(j.schedule ?? j.starttime ?? '—')}</TableCell>
                    <TableCell className="text-xs">{String(j.storage ?? '—')}</TableCell>
                    <TableCell className="text-xs">{String(j.mode ?? '—')}</TableCell>
                    <TableCell>
                      <Badge variant={j.enabled === 0 || j.enabled === '0' ? 'secondary' : 'default'}>
                        {j.enabled === 0 || j.enabled === '0' ? t('storages.disabled') : t('storages.enabled')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <StorageDialog
          serverId={serverId}
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
          editing={editing}
        />
      )}
    </div>
  );
}
