import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useNodeTasks, useNodeTaskLog, type NodeTask } from '@/hooks/use-node-admin';

function fmtTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function statusVariant(status?: string): 'default' | 'secondary' | 'destructive' {
  if (!status) return 'secondary';       // running
  if (status === 'OK') return 'default';
  return 'destructive';
}

/** История задач ноды (аналог Task History в Proxmox) + просмотр лога задачи. */
export default function NodeTasks({ serverId, node }: { serverId: number; node: string }) {
  const { t } = useTranslation();
  const { data, refetch, isFetching } = useNodeTasks(serverId, node);
  const [upid, setUpid] = useState<string | null>(null);
  const { data: logData } = useNodeTaskLog(serverId, node, upid);

  const tasks = data?.tasks ?? [];
  const logLines = logData?.log ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('nodeadm.tasks_hint', 'Задачи Proxmox, выполненные на ноде')}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Обновить')}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t('nodeadm.task_start', 'Начало')}</TableHead>
              <TableHead>{t('nodeadm.task_type', 'Тип')}</TableHead>
              <TableHead>{t('nodeadm.task_id', 'Объект')}</TableHead>
              <TableHead>{t('nodeadm.task_user', 'Пользователь')}</TableHead>
              <TableHead>{t('common.status', 'Статус')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {tasks.map((task: NodeTask) => (
                <TableRow key={task.upid} className="cursor-pointer" onClick={() => setUpid(task.upid)}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtTime(task.starttime)}</TableCell>
                  <TableCell className="font-mono text-xs">{task.type || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{task.id || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{task.user || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(task.status)} className="text-2xs">
                      {task.status ?? t('nodeadm.task_running', 'выполняется')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!upid} onOpenChange={(open) => { if (!open) setUpid(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-xs break-all">{upid}</DialogTitle>
          </DialogHeader>
          <div className="h-[400px] overflow-auto rounded-lg border bg-[#09090B] p-3 font-mono text-xs leading-relaxed text-[#e0e0e0]">
            {logLines.length === 0 ? (
              <p className="text-muted-foreground">{t('common.loading', 'Загрузка…')}</p>
            ) : (
              logLines.map((l) => (
                <div key={l.n} className="whitespace-pre-wrap break-all">{l.t}</div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
