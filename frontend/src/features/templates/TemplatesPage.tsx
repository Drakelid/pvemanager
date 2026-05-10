import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Search, Download, Trash2, Loader2 } from 'lucide-react';
import { OsLogo } from './OsLogo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTemplates, useTemplateGroups, useAutoImportTemplates, useDeleteTemplate } from '@/hooks/use-templates';
import { useServers } from '@/hooks/use-nodes';
import { toast } from 'sonner';

export default function TemplatesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [serverFilter, setServerFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importServerId, setImportServerId] = useState<string>('');

  const { data: groups = [] } = useTemplateGroups();
  const { data: templates = [], isLoading } = useTemplates(
    groupFilter ? Number(groupFilter) : undefined,
    serverFilter ? Number(serverFilter) : undefined,
    typeFilter || undefined,
  );
  const { data: servers = [] } = useServers();
  const autoImport = useAutoImportTemplates();
  const deleteTpl = useDeleteTemplate();

  const filtered = templates.filter(tpl =>
    tpl.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleImport = () => {
    if (!importServerId) return;
    autoImport.mutate(Number(importServerId), {
      onSuccess: (res) => {
        toast.success(`${t('templates.imported')}: ${res.count}`);
        setImportDialogOpen(false);
      },
      onError: (err: Error) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.templates')}</h1>
        <Button onClick={() => setImportDialogOpen(true)}>
          <Download className="mr-2 h-4 w-4" />{t('templates.auto_import')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={groupFilter} onValueChange={v => { if (v !== null) setGroupFilter(v); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('templates.all_groups')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('templates.all_groups')}</SelectItem>
            {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={serverFilter} onValueChange={v => { if (v !== null) setServerFilter(v); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('templates.all_servers')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('templates.all_servers')}</SelectItem>
            {servers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { if (v !== null) setTypeFilter(v); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('templates.all_types')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('templates.all_types')}</SelectItem>
            <SelectItem value="qemu">{t('templates.type_kvm')}</SelectItem>
            <SelectItem value="lxc">{t('templates.type_lxc')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates grid */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Monitor className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>{t('templates.no_templates')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(tpl => (
            <Card key={tpl.id} className="group">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {tpl.vm_type === 'qemu' ? (
                      <OsLogo name={tpl.name} className="h-7 w-7" />
                    ) : tpl.group_icon ? (
                      <span className="text-xl" dangerouslySetInnerHTML={{ __html: tpl.group_icon }} />
                    ) : (
                      <Monitor className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground">{tpl.group_name}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 text-destructive"
                    onClick={() => { if (confirm(t('common.confirm_delete'))) deleteTpl.mutate(tpl.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={tpl.vm_type === 'lxc' ? 'secondary' : 'default'} className="text-xs">
                    {tpl.vm_type === 'lxc' ? t('templates.type_lxc') : t('templates.type_kvm')}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{tpl.default_cores} vCPU</Badge>
                  <Badge variant="outline" className="text-xs">{tpl.default_memory} MB</Badge>
                  <Badge variant="outline" className="text-xs">{tpl.default_disk} GB</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{tpl.server_name}</span>
                  <span>{tpl.vmid != null ? `VMID: ${tpl.vmid}` : t('templates.file_template')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('templates.auto_import')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={importServerId} onValueChange={v => { if (v !== null) setImportServerId(v); }}>
              <SelectTrigger><SelectValue placeholder={t('templates.select_server')} /></SelectTrigger>
              <SelectContent>
                {servers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleImport} disabled={!importServerId || autoImport.isPending} className="w-full">
              {autoImport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('templates.import_btn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
