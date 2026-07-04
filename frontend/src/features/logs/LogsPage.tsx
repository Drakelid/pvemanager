import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogs, useLogLevels, useLogStats } from '@/hooks/use-logs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, AlertCircle, ShieldAlert, Activity } from 'lucide-react';
import type { AuditLog } from '@/types';

function levelClass(level?: string) {
  switch ((level || '').toUpperCase()) {
    case 'ERROR':
      return 'bg-danger/10 text-danger';
    case 'WARNING':
    case 'WARN':
      return 'bg-warning/10 text-warning';
    case 'SUCCESS':
      return 'bg-success/10 text-success';
    case 'INFO':
    default:
      return 'bg-primary/10 text-primary';
  }
}

export default function LogsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const params = useMemo(
    () => ({ search: search || undefined, level: level || undefined, page, limit }),
    [search, level, page],
  );

  const logsQuery = useLogs(params);
  const levelsQuery = useLogLevels();
  const statsQuery = useLogStats(24);

  const logs: AuditLog[] = logsQuery.data?.logs ?? [];
  const totalPages = logsQuery.data?.pages ?? 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('logs.title', 'System Logs')}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logsQuery.refetch();
            statsQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('common.refresh', 'Refresh')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('logs.total_24h', 'Total (24h)')}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsQuery.data?.total ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('logs.errors_24h', 'Errors (24h)')}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-danger" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">
              {statsQuery.data?.errors_count ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('logs.failed_logins', 'Failed Logins')}
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {statsQuery.data?.failed_logins ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('logs.current_page', 'On this page')}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('logs.search_placeholder', 'Search by message or user…')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('logs.all_levels', 'All levels')}</option>
              {(levelsQuery.data?.levels ?? []).map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t('common.loading', 'Loading…')}
            </div>
          ) : logsQuery.error ? (
            <div className="p-8 text-center text-danger text-sm">
              {t('logs.load_error', 'Failed to load logs')}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t('logs.empty', 'No log entries')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('logs.time', 'Time')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('logs.level', 'Level')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('logs.category', 'Category')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('logs.user', 'User')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('logs.message', 'Message')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={levelClass(log.level)} variant="secondary">
                          {log.level || 'INFO'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {log.category || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {log.username || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 break-words">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {t('logs.page', 'Page')} {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('common.prev', 'Prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('common.next', 'Next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
