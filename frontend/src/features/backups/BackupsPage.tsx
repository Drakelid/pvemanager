import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Play, Calendar } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useServers } from '@/hooks/use-nodes';
import { useBackupJobs, useBackupList, useBackupStorages, useToggleBackupJob, useRunBackupJob } from '@/hooks/use-backups';
import { formatBytes } from '@/lib/format';
import { toast } from 'sonner';

export default function BackupsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('files');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedStorage, setSelectedStorage] = useState('');

  const { data: servers = [] } = useServers();
  const sid = selectedServer ? Number(selectedServer) : 0;
  const { data: storagesData } = useBackupStorages(sid);
  const { data: backupsData } = useBackupList(sid, selectedNode, selectedStorage);
  const { data: jobsData } = useBackupJobs();
  const toggleJob = useToggleBackupJob();
  const runJob = useRunBackupJob();

  const storages = (storagesData?.storages || []) as { storage: string; type: string; content: string; used: number; total: number }[];
  const backups = (backupsData?.backups || []) as { volid: string; vmid: number; size: number; ctime: number; format: string; notes?: string }[];
  const jobs = (jobsData?.jobs || []) as { id: number; server_id: number; vmids: number[]; storage: string; mode: string; cron_expression: string; enabled: boolean; notes?: string }[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.backups')}</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="files">{t('backups.files')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('backups.scheduled_jobs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={selectedServer} onValueChange={v => { if (v !== null) { setSelectedServer(v); setSelectedNode(''); setSelectedStorage(''); } }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder={t('backups.select_server')} /></SelectTrigger>
              <SelectContent>
                {servers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="w-[160px]" placeholder={t('backups.node')} value={selectedNode} onChange={e => setSelectedNode(e.target.value)} />
            <Select value={selectedStorage} onValueChange={v => { if (v !== null) setSelectedStorage(v); }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder={t('backups.select_storage')} /></SelectTrigger>
              <SelectContent>
                {storages.map(s => <SelectItem key={s.storage} value={s.storage}>{s.storage} ({s.type})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Backup files table */}
          {backups.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>VMID</TableHead>
                    <TableHead>{t('backups.volume')}</TableHead>
                    <TableHead>{t('backups.size')}</TableHead>
                    <TableHead>{t('backups.date')}</TableHead>
                    <TableHead>{t('backups.format')}</TableHead>
                    <TableHead>{t('backups.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{b.vmid}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[300px] truncate">{b.volid}</TableCell>
                      <TableCell>{formatBytes(b.size)}</TableCell>
                      <TableCell>{new Date(b.ctime * 1000).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{b.format}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Archive className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <p>{selectedServer ? t('backups.no_backups') : t('backups.select_server_first')}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4 mt-4">
          {jobs.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>{t('backups.vmids')}</TableHead>
                    <TableHead>{t('backups.storage_col')}</TableHead>
                    <TableHead>{t('backups.schedule')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map(job => (
                    <TableRow key={job.id}>
                      <TableCell>{job.id}</TableCell>
                      <TableCell className="font-mono text-xs">{job.vmids?.join(', ') || '—'}</TableCell>
                      <TableCell>{job.storage}</TableCell>
                      <TableCell className="font-mono text-xs">{job.cron_expression}</TableCell>
                      <TableCell>
                        <Badge variant={job.enabled ? 'default' : 'secondary'}>
                          {job.enabled ? t('backups.enabled') : t('backups.disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => toggleJob.mutate(job.id)}>
                            {job.enabled ? t('backups.disable') : t('backups.enable')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { runJob.mutate(job.id); toast.success(t('backups.job_started')); }}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <p>{t('backups.no_jobs')}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
