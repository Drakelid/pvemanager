import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2, Users, Server, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { useWorkspaces, useCreateWorkspace, useUpdateWorkspace, useDeleteWorkspace } from '@/hooks/use-workspaces';

export default function WorkspacesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { data: workspaces = [] } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const filtered = workspaces.filter(w => {
    if (!search) return true;
    const s = search.toLowerCase();
    return w.name?.toLowerCase().includes(s) || w.description?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.workspaces')}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" />}><Plus className="h-4 w-4 mr-1" />{t('workspaces.create')}</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('workspaces.create')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t('common.name')}</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
              <div><Label>{t('ipam.description')}</Label><Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1" /></div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>{t('common.cancel')}</DialogClose>
              <Button onClick={() => { createWorkspace.mutate({ name, description }); setOpen(false); setName(''); setDescription(''); }}>{t('common.create')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(ws => (
          <Card key={ws.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{ws.name}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                    setEditId(ws.id);
                    setEditName(ws.name);
                    setEditDescription(ws.description || '');
                    setEditOpen(true);
                  }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteWorkspace.mutate(ws.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {ws.description && <p className="text-xs text-muted-foreground">{ws.description}</p>}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Server className="h-3.5 w-3.5" />{ws.servers?.length ?? 0} {t('workspaces.servers')}</div>
                <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{ws.users?.length ?? 0} {t('workspaces.users')}</div>
              </div>
              {ws.servers && ws.servers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ws.servers.map((s: any) => (
                    <Badge key={s.id ?? s} variant="outline" className="text-xs">{s.name ?? s}</Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('workspaces.created')}: {ws.created_at ? new Date(ws.created_at).toLocaleDateString() : '—'}</p>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">{t('common.no_data')}</div>
        )}
      </div>

      {/* Edit Workspace Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('workspaces.edit')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('common.name')}</Label><Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" /></div>
            <div><Label>{t('ipam.description')}</Label><Input value={editDescription} onChange={e => setEditDescription(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t('common.cancel')}</DialogClose>
            <Button onClick={() => {
              if (editId) {
                updateWorkspace.mutate({ id: editId, name: editName, description: editDescription });
              }
              setEditOpen(false);
            }}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
