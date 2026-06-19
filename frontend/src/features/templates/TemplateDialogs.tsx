import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServers, useNodes, useStorages } from '@/hooks/use-nodes';
import { useQuickDeployInfo, useDeployVM } from '@/hooks/use-templates';
import { useAvailableLXCTemplates, useDownloadLXCTemplate } from '@/hooks/use-lxc-templates';
import type { OSTemplate } from '@/types';
import { toast } from 'sonner';

// ==================== Quick deploy (VM from template) ====================

export function DeployDialog({ template, onClose }: { template: OSTemplate | null; onClose: () => void }) {
  const { t } = useTranslation();
  const open = !!template;
  const { data: info } = useQuickDeployInfo(template?.id ?? null);
  const deploy = useDeployVM();

  const [name, setName] = useState('');
  const [cores, setCores] = useState('');
  const [memory, setMemory] = useState('');
  const [disk, setDisk] = useState('');
  const [start, setStart] = useState(true);

  // Prefill from the quick-deploy info (authoritative defaults from backend).
  useEffect(() => {
    if (info?.template) {
      setCores(String(info.template.default_cores));
      setMemory(String(info.template.default_memory));
      setDisk(String(info.template.default_disk));
    }
  }, [info?.template]);

  useEffect(() => { if (template) setName(''); }, [template]);

  const submit = () => {
    if (!template) return;
    if (!name.trim()) { toast.error(t('templates.name_required')); return; }
    deploy.mutate(
      {
        template_id: template.id,
        name: name.trim(),
        cores: Number(cores) || undefined,
        memory: Number(memory) || undefined,
        disk: Number(disk) || undefined,
        start_after_create: start,
      },
      {
        onSuccess: () => { toast.success(t('templates.deploy_started')); onClose(); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const min = info?.template;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('templates.deploy')}: {template?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t('templates.vm_name')}</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="web-01" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>vCPU</Label><Input type="number" min={min?.min_cores ?? 1} value={cores} onChange={e => setCores(e.target.value)} className="mt-1" /></div>
            <div><Label>{t('nodes.memory')} (MB)</Label><Input type="number" min={min?.min_memory ?? 128} value={memory} onChange={e => setMemory(e.target.value)} className="mt-1" /></div>
            <div><Label>{t('nodes.disk')} (GB)</Label><Input type="number" min={min?.min_disk ?? 1} value={disk} onChange={e => setDisk(e.target.value)} className="mt-1" /></div>
          </div>
          {min && <p className="text-xs text-muted-foreground">{t('templates.minimums')}: {min.min_cores} vCPU / {min.min_memory} MB / {min.min_disk} GB</p>}
          <div className="flex items-center gap-2">
            <input id="deploy_start" type="checkbox" checked={start} onChange={e => setStart(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="deploy_start" className="cursor-pointer">{t('templates.start_after')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={deploy.isPending || !name.trim()}>
            {deploy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('templates.deploy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Download CT template ====================

export function DownloadCTDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: servers = [] } = useServers();
  const [serverId, setServerId] = useState(0);
  const [node, setNode] = useState('');
  const [storage, setStorage] = useState('');
  const [template, setTemplate] = useState('');

  const { data: nodesData } = useNodes(serverId);
  const nodes = nodesData?.nodes ?? [];
  const { data: available = [], isFetching } = useAvailableLXCTemplates(serverId || undefined, node || undefined);
  const { data: storagesRaw = [] } = useStorages(serverId, node);
  const download = useDownloadLXCTemplate(serverId);

  // Storages that accept CT templates (vztmpl content).
  const storages = useMemo(
    () => (storagesRaw as { storage: string; content?: string }[]).filter(
      s => (s.content || '').split(',').includes('vztmpl')
    ),
    [storagesRaw],
  );

  // Default node to the first one.
  useEffect(() => { if (!node && nodes.length) setNode(nodes[0].node); }, [nodes, node]);

  const submit = () => {
    if (!node || !storage || !template) { toast.error(t('templates.download_fields_required')); return; }
    download.mutate({ node, storage, template }, {
      onSuccess: () => { toast.success(t('templates.download_started')); onClose(); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('templates.download_ct')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t('templates.server')}</Label>
            <Select value={serverId ? String(serverId) : ''} onValueChange={v => { if (v) { setServerId(Number(v)); setNode(''); setStorage(''); setTemplate(''); } }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t('templates.select_server')} /></SelectTrigger>
              <SelectContent>{servers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {serverId > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('nodes.title')}</Label>
                  <Select value={node} onValueChange={v => { if (v) { setNode(v); setTemplate(''); setStorage(''); } }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{nodes.map(n => <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('storages.title')}</Label>
                  <Select value={storage} onValueChange={v => { if (v) setStorage(v); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={storages.length ? '' : t('templates.no_vztmpl_storage')} /></SelectTrigger>
                    <SelectContent>{storages.map(s => <SelectItem key={s.storage} value={s.storage}>{s.storage}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('templates.template')} {isFetching && <Loader2 className="inline h-3 w-3 animate-spin" />}</Label>
                <Select value={template} onValueChange={v => { if (v) setTemplate(v); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t('templates.select_template')} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {available.map(a => (
                      <SelectItem key={a.template} value={a.template}>{a.template}{a.headline ? ` — ${a.headline}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={download.isPending || !node || !storage || !template}>
            {download.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('templates.download_btn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
