import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, RefreshCw, Rocket, ScrollText, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHasPermission } from '@/lib/permissions';
import { useCoolifyAction, useCoolifyLogs, useCoolifyMapping, useCoolifyResources, useCoolifyServers, useUpdateCoolifyMapping } from '@/hooks/use-coolify';

export default function CoolifyTab({ serverId, vmid }: { serverId: number; vmid: number }) {
  const { t } = useTranslation();
  const canManage = useHasPermission('coolify:manage');
  const canControl = useHasPermission('coolify:control');
  const canDeploy = useHasPermission('coolify:deploy');
  const { data: mapping, isLoading } = useCoolifyMapping(serverId, vmid);
  const { data: servers = [], isLoading: serversLoading, isFetching: serversFetching, error: serversError, refetch: refetchServers } = useCoolifyServers(canManage);
  const updateMapping = useUpdateCoolifyMapping(serverId, vmid);
  const [selected, setSelected] = useState('');
  const mapped = mapping?.coolify_server_uuid || '';
  const { data: resources = [], isFetching, refetch } = useCoolifyResources(serverId, vmid, !!mapped);
  const action = useCoolifyAction(serverId, vmid);
  const [logsUuid, setLogsUuid] = useState<string | null>(null);
  const { data: logs, isLoading: logsLoading } = useCoolifyLogs(serverId, vmid, logsUuid);
  const logText = typeof logs === 'string' ? logs : JSON.stringify(logs ?? '', null, 2);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!mapped) return <Card><CardHeader><CardTitle className="text-sm">{t('coolify.integration')}</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">{t('coolify.not_mapped')}</p>
    {canManage && <div className="max-w-xl space-y-3">
      {serversError && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">{t('coolify.servers_load_failed')}</p>
        <p className="mt-1 text-muted-foreground">{serversError.message}</p>
        <p className="mt-1 text-muted-foreground">{t('coolify.read_permission_help')}</p>
      </div>}
      {!serversError && !serversLoading && servers.length === 0 && <div className="rounded-md border p-3 text-sm text-muted-foreground">{t('coolify.no_servers')}</div>}
      <div className="flex gap-2">
        <Select value={selected} onValueChange={value => setSelected(String(value || ''))} disabled={serversLoading || !!serversError || servers.length === 0}>
          <SelectTrigger><SelectValue placeholder={serversLoading ? t('common.loading') : t('coolify.select_server')} /></SelectTrigger>
          <SelectContent>{servers.map(server => <SelectItem key={server.uuid} value={server.uuid}>{server.name || server.uuid}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="icon" title={t('common.refresh')} disabled={serversFetching} onClick={() => refetchServers()}><RefreshCw className={`h-4 w-4 ${serversFetching ? 'animate-spin' : ''}`} /></Button>
        <Button disabled={!selected || updateMapping.isPending} onClick={() => updateMapping.mutate(selected, { onSuccess: () => toast.success(t('coolify.mapping_saved')), onError: e => toast.error(e.message) })}>{t('common.save')}</Button>
      </div>
      {(serversError || (!serversLoading && servers.length === 0)) && <Button variant="link" className="h-auto p-0" render={<Link to="/settings?tab=coolify" />}>{t('coolify.open_settings')}</Button>}
    </div>}
  </CardContent></Card>;

  const run = (uuid: string, requested: 'start' | 'stop' | 'restart' | 'deploy') => action.mutate({ uuid, action: requested }, {
    onSuccess: () => toast.success(t('coolify.action_sent')),
    onError: e => toast.error(e.message),
  });

  return <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div><h3 className="font-medium">{t('coolify.resources')}</h3><p className="text-sm text-muted-foreground">{t('coolify.mapped_server')}: {servers.find(s => s.uuid === mapped)?.name || mapped}</p></div>
      <div className="flex gap-2">
        {canManage && <Button size="sm" variant="outline" onClick={() => updateMapping.mutate(null)}>{t('coolify.remove_mapping')}</Button>}
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />{t('common.refresh')}</Button>
      </div>
    </div>
    {!resources.length && !isFetching && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{t('coolify.no_resources')}</CardContent></Card>}
    <div className="grid gap-3 md:grid-cols-2">{resources.map(resource => <Card key={resource.uuid}>
      <CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{resource.name}</CardTitle><Badge variant="outline">{resource.status || t('common.unknown', 'Unknown')}</Badge></div></CardHeader>
      <CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{resource.type}</p>
        <div className="flex flex-wrap gap-2">
          {canControl && <><Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(resource.uuid, 'start')}><Play className="mr-1 h-3.5 w-3.5" />{t('common.start')}</Button><Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(resource.uuid, 'stop')}><Square className="mr-1 h-3.5 w-3.5" />{t('common.stop')}</Button><Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(resource.uuid, 'restart')}><RefreshCw className="mr-1 h-3.5 w-3.5" />{t('common.restart')}</Button></>}
          {canDeploy && <Button size="sm" disabled={action.isPending} onClick={() => run(resource.uuid, 'deploy')}><Rocket className="mr-1 h-3.5 w-3.5" />{t('coolify.deploy')}</Button>}
          <Button size="sm" variant="ghost" onClick={() => setLogsUuid(resource.uuid)}><ScrollText className="mr-1 h-3.5 w-3.5" />{t('coolify.logs')}</Button>
        </div>
      </CardContent>
    </Card>)}</div>
    <Dialog open={!!logsUuid} onOpenChange={open => !open && setLogsUuid(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{t('coolify.logs')}</DialogTitle></DialogHeader>{logsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{logText}</pre>}</DialogContent></Dialog>
  </div>;
}
