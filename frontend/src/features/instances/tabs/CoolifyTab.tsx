import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Activity, AppWindow, Boxes, Copy, ExternalLink, Layers3, Loader2, Play, RefreshCw, Rocket, ScrollText, Search, Server, Settings2, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { useHasPermission } from '@/lib/permissions';
import { type CoolifyResource, useCoolifyAction, useCoolifyLogs, useCoolifyMapping, useCoolifyResources, useCoolifyServers, useUpdateCoolifyMapping } from '@/hooks/use-coolify';

type StatusFilter = 'all' | 'running' | 'stopped' | 'attention';
const statusGroup = (status?: string): Exclude<StatusFilter, 'all'> => {
  const value = (status || '').toLowerCase();
  if (value.includes('running') || value.includes('healthy')) return 'running';
  if (value.includes('stopped') || value.includes('exited')) return 'stopped';
  return 'attention';
};
const statusStyle = (status?: string) => statusGroup(status) === 'running'
  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  : statusGroup(status) === 'stopped'
    ? 'border-muted-foreground/20 bg-muted text-muted-foreground'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';

export default function CoolifyTab({ serverId, vmid }: { serverId: number; vmid: number }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canManage = useHasPermission('coolify:manage');
  const canControl = useHasPermission('coolify:control');
  const canDeploy = useHasPermission('coolify:deploy');
  const mappingQuery = useCoolifyMapping(serverId, vmid);
  const serversQuery = useCoolifyServers(canManage);
  const updateMapping = useUpdateCoolifyMapping(serverId, vmid);
  const [selected, setSelected] = useState('');
  const mapped = mappingQuery.data?.coolify_server_uuid || '';
  const resourcesQuery = useCoolifyResources(serverId, vmid, !!mapped);
  const action = useCoolifyAction(serverId, vmid);
  const [logsUuid, setLogsUuid] = useState<string | null>(null);
  const logsQuery = useCoolifyLogs(serverId, vmid, logsUuid);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const servers = serversQuery.data || [];
  const resources = resourcesQuery.data || [];
  const mappedServer = servers.find(server => server.uuid === mapped);

  const counts = useMemo(() => ({
    all: resources.length,
    running: resources.filter(r => statusGroup(r.status) === 'running').length,
    stopped: resources.filter(r => statusGroup(r.status) === 'stopped').length,
    attention: resources.filter(r => statusGroup(r.status) === 'attention').length,
  }), [resources]);
  const visible = useMemo(() => resources.filter(resource => {
    const needle = search.trim().toLowerCase();
    const matches = !needle || [resource.name, resource.type, resource.status, resource.description].some(value => String(value || '').toLowerCase().includes(needle));
    return matches && (filter === 'all' || statusGroup(resource.status) === filter);
  }), [resources, search, filter]);
  const logResource = resources.find(resource => resource.uuid === logsUuid);
  const logText = typeof logsQuery.data === 'string' ? logsQuery.data : JSON.stringify(logsQuery.data ?? '', null, 2);

  if (mappingQuery.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!mapped) return <Card className="overflow-hidden">
    <div className="border-b bg-gradient-to-br from-sky-500/10 via-background to-violet-500/10 p-6"><div className="flex items-start gap-4"><div className="rounded-xl bg-sky-500/15 p-3 text-sky-600"><Boxes className="h-6 w-6" /></div><div><h3 className="text-lg font-semibold">{t('coolify.connect_instance')}</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('coolify.not_mapped')}</p></div></div></div>
    <CardContent className="space-y-4 p-6">{canManage ? <div className="max-w-2xl space-y-3">
      {serversQuery.error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"><p className="font-medium text-destructive">{t('coolify.servers_load_failed')}</p><p className="mt-1 text-muted-foreground">{serversQuery.error.message}</p><p className="mt-1 text-muted-foreground">{t('coolify.read_permission_help')}</p></div>}
      {!serversQuery.error && !serversQuery.isLoading && !servers.length && <div className="rounded-lg border p-4 text-sm text-muted-foreground">{t('coolify.no_servers')}</div>}
      <div className="flex flex-col gap-2 sm:flex-row"><Select value={selected} onValueChange={value => setSelected(String(value || ''))} disabled={serversQuery.isLoading || !!serversQuery.error || !servers.length}><SelectTrigger className="h-9 flex-1"><SelectValue placeholder={serversQuery.isLoading ? t('common.loading') : t('coolify.select_server')} /></SelectTrigger><SelectContent>{servers.map(server => <SelectItem key={server.uuid} value={server.uuid}>{server.name || server.uuid}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" disabled={serversQuery.isFetching} onClick={() => serversQuery.refetch()}><RefreshCw className={`h-4 w-4 ${serversQuery.isFetching ? 'animate-spin' : ''}`} /></Button><Button disabled={!selected || updateMapping.isPending} onClick={() => updateMapping.mutate(selected, { onSuccess: () => toast.success(t('coolify.mapping_saved')), onError: error => toast.error(error.message) })}>{t('coolify.connect')}</Button></div>
      <Button variant="link" className="h-auto p-0" render={<Link to="/settings?tab=coolify" />}><Settings2 className="mr-1.5 h-4 w-4" />{t('coolify.open_settings')}</Button>
    </div> : <p className="text-sm text-muted-foreground">{t('coolify.mapping_admin_required')}</p>}</CardContent>
  </Card>;

  const run = async (resource: CoolifyResource, requested: 'start' | 'stop' | 'restart' | 'deploy') => {
    if (requested === 'stop' && !await confirm(t('coolify.stop_confirm', { name: resource.name }), { variant: 'destructive', confirmLabel: t('common.stop') })) return;
    action.mutate({ uuid: resource.uuid, action: requested }, { onSuccess: () => toast.success(t('coolify.action_sent_named', { action: t(`coolify.actions.${requested}`), name: resource.name })), onError: error => toast.error(error.message) });
  };
  const filters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: t('common.all'), count: counts.all }, { key: 'running', label: t('common.running'), count: counts.running },
    { key: 'stopped', label: t('common.stopped'), count: counts.stopped }, { key: 'attention', label: t('coolify.attention'), count: counts.attention },
  ];

  return <div className="space-y-5">
    <Card className="overflow-hidden"><div className="bg-gradient-to-br from-sky-500/10 via-background to-violet-500/10 p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div className="flex items-center gap-3"><div className="rounded-xl bg-sky-500/15 p-2.5 text-sky-600"><Server className="h-5 w-5" /></div><div><div className="flex items-center gap-2"><h3 className="font-semibold">{mappedServer?.name || t('coolify.mapped_server')}</h3><span className={`h-2 w-2 rounded-full ${mappedServer?.settings?.is_reachable === false ? 'bg-destructive' : 'bg-emerald-500'}`} /></div><p className="font-mono text-xs text-muted-foreground">{mapped}</p></div></div><div className="flex gap-2">{canManage && <Button size="sm" variant="outline" onClick={async () => { if (await confirm(t('coolify.remove_mapping_confirm'))) updateMapping.mutate(null); }}>{t('coolify.remove_mapping')}</Button>}<Button size="sm" variant="outline" onClick={() => resourcesQuery.refetch()} disabled={resourcesQuery.isFetching}><RefreshCw className={`mr-1.5 h-4 w-4 ${resourcesQuery.isFetching ? 'animate-spin' : ''}`} />{t('common.refresh')}</Button></div></div>
      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">{filters.map(item => <button key={item.key} onClick={() => setFilter(item.key)} className={`rounded-lg border px-3 py-2 text-left transition-colors ${filter === item.key ? 'border-primary bg-primary/5' : 'bg-background/70 hover:bg-muted/70'}`}><div className="text-xl font-semibold tabular-nums">{item.count}</div><div className="text-xs text-muted-foreground">{item.label}</div></button>)}</div>
    </div></Card>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder={t('coolify.search_resources')} /></div><p className="text-sm text-muted-foreground">{t('coolify.showing_resources', { shown: visible.length, total: resources.length })}</p></div>
    {resourcesQuery.error && <Card className="border-destructive/40"><CardContent className="flex items-center justify-between gap-3 py-4"><div><p className="font-medium text-destructive">{t('coolify.resources_load_failed')}</p><p className="text-sm text-muted-foreground">{resourcesQuery.error.message}</p></div><Button variant="outline" onClick={() => resourcesQuery.refetch()}>{t('coolify.retry')}</Button></CardContent></Card>}
    {resourcesQuery.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}
    {!resourcesQuery.isLoading && !resourcesQuery.error && !visible.length && <Card><CardContent className="py-12 text-center"><Boxes className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">{search || filter !== 'all' ? t('coolify.no_matching_resources') : t('coolify.no_resources')}</p></CardContent></Card>}
    <div className="grid gap-4 xl:grid-cols-2">{visible.map(resource => {
      const pending = action.isPending && action.variables?.uuid === resource.uuid;
      const running = statusGroup(resource.status) === 'running';
      const Icon = resource.type.toLowerCase().includes('service') ? Layers3 : AppWindow;
      return <Card key={resource.uuid} className="transition-shadow hover:shadow-sm"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-muted p-2 text-muted-foreground"><Icon className="h-5 w-5" /></div><div className="min-w-0"><CardTitle className="truncate text-base">{resource.name}</CardTitle><p className="mt-0.5 truncate text-xs text-muted-foreground">{resource.type}</p></div></div><Badge variant="outline" className={statusStyle(resource.status)}>{resource.status || t('common.unknown', 'Unknown')}</Badge></div></CardHeader><CardContent className="space-y-4">{resource.description && <p className="line-clamp-2 text-sm text-muted-foreground">{resource.description}</p>}{resource.fqdn && <a href={resource.fqdn.split(',')[0]} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate text-sm text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />{resource.fqdn.split(',')[0]}</a>}<div className="flex flex-wrap items-center gap-2 border-t pt-3">{canControl && !running && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(resource, 'start')}><Play className="mr-1 h-3.5 w-3.5" />{t('common.start')}</Button>}{canControl && running && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(resource, 'restart')}><RefreshCw className="mr-1 h-3.5 w-3.5" />{t('common.restart')}</Button>}{canControl && running && <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={() => run(resource, 'stop')}><Square className="mr-1 h-3.5 w-3.5" />{t('common.stop')}</Button>}{canDeploy && <Button size="sm" disabled={pending} onClick={() => run(resource, 'deploy')}>{pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Rocket className="mr-1 h-3.5 w-3.5" />}{t('coolify.deploy')}</Button>}<Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLogsUuid(resource.uuid)}><ScrollText className="mr-1 h-3.5 w-3.5" />{t('coolify.logs')}</Button></div></CardContent></Card>;
    })}</div>
    <Dialog open={!!logsUuid} onOpenChange={open => !open && setLogsUuid(null)}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />{logResource?.name || t('coolify.logs')}</DialogTitle></DialogHeader><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />{t('common.refresh')}</Button><Button size="sm" variant="outline" disabled={!logText} onClick={() => navigator.clipboard.writeText(logText).then(() => toast.success(t('coolify.logs_copied')))}><Copy className="mr-1 h-3.5 w-3.5" />{t('coolify.copy')}</Button></div>{logsQuery.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : logsQuery.error ? <p className="text-sm text-destructive">{logsQuery.error.message}</p> : <pre className="max-h-[60vh] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100 whitespace-pre-wrap">{logText || t('coolify.no_logs')}</pre>}</DialogContent></Dialog>
  </div>;
}
