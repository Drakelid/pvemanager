import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, X, ClipboardList, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllTasks, useCancelTask, useClearCompletedTasks } from '@/hooks/use-tasks';

export default function TasksPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: tasksData, refetch } = useAllTasks();
  const tasks = tasksData?.tasks ?? [];
  const cancelTask = useCancelTask();
  const clearCompleted = useClearCompletedTasks();

  const filtered = tasks.filter(task => {
    if (statusFilter === 'all') return true;
    return task.status === statusFilter;
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': case 'in_progress': return 'default';
      case 'completed': case 'success': return 'secondary';
      case 'failed': case 'error': return 'destructive';
      case 'queued': case 'pending': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{t('nav.tasks')}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />{t('common.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => clearCompleted.mutate()}>
            <Trash2 className="h-4 w-4 mr-1" />{t('tasks.clear_completed')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={v => { if (v !== null) setStatusFilter(v); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="running">{t('tasks.running')}</SelectItem>
                <SelectItem value="queued">{t('tasks.queued')}</SelectItem>
                <SelectItem value="completed">{t('tasks.completed')}</SelectItem>
                <SelectItem value="failed">{t('tasks.failed')}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{filtered.length} {t('tasks.tasks_count')}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('common.type')}</TableHead>
                <TableHead>{t('tasks.description')}</TableHead>
                <TableHead>{t('tasks.server')}</TableHead>
                <TableHead>{t('tasks.node')}</TableHead>
                <TableHead>{t('common.user')}</TableHead>
                <TableHead>{t('tasks.started')}</TableHead>
                <TableHead>{t('tasks.progress')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((task, i) => (
                <TableRow key={task.id ?? task.upid ?? i}>
                  <TableCell><Badge variant={statusColor(task.status) as any}>{task.status}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{task.type || String(task.task_type ?? '') || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[250px] truncate">{String(task.description ?? '') || task.upid || '—'}</TableCell>
                  <TableCell className="text-xs">{task.server_name || '—'}</TableCell>
                  <TableCell className="text-xs">{task.node || '—'}</TableCell>
                  <TableCell className="text-xs">{task.user || '—'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{task.starttime ? new Date(task.starttime * 1000).toLocaleString() : task.created_at ? new Date(task.created_at).toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-xs">
                    {task.progress != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.progress}%` }} />
                        </div>
                        <span>{Number(task.progress ?? 0)}%</span>
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {(task.status === 'running' || task.status === 'queued' || task.status === 'in_progress') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelTask.mutate(Number(task.id ?? 0))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
