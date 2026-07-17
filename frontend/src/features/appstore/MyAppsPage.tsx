import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Package, Store, ExternalLink, RotateCw, Trash2, Loader2,
  Play, Square, RefreshCcw, FileText, ArrowUpCircle, Undo2, KeyRound, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/shared/status-dot';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  useInstalledApps, useAppstoreRealtime, useRetryApp, useDeleteApp,
  useLifecycleAction, useReconcile, useAppLogs, useUpdateApp, useRollbackApp,
  useAppCredentials,
} from '@/hooks/use-appstore';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import type { InstalledApp } from '@/types/appstore';

export default function MyAppsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  useAppstoreRealtime();
  const { data: apps = [], isLoading } = useInstalledApps();
  const retry = useRetryApp();
  const del = useDeleteApp();
  const lifecycle = useLifecycleAction();
  const reconcile = useReconcile();
  const update = useUpdateApp();
  const rollback = useRollbackApp();
  const [logsApp, setLogsApp] = useState<InstalledApp | null>(null);
  const [credsApp, setCredsApp] = useState<InstalledApp | null>(null);

  // ТЗ 6.6 — реконсиляция статусов при открытии экрана.
  useEffect(() => {
    reconcile.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (a: InstalledApp) => {
    if (!(await confirm(t('appstore.delete_confirm', { name: a.name }), {
      title: t('appstore.delete'),
      confirmLabel: t('appstore.delete'),
      variant: 'destructive',
    }))) return;
    del.mutate(a.id, {
      onSuccess: () => toast.success(t('appstore.deleted')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const act = (a: InstalledApp, action: 'start' | 'stop' | 'restart') => {
    lifecycle.mutate({ id: a.id, action }, {
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const handleRetry = (a: InstalledApp) => {
    retry.mutate(a.id, {
      onSuccess: () => toast.success(t('appstore.install_started')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const handleUpdate = async (a: InstalledApp) => {
    if (!(await confirm(t('appstore.update_confirm', { name: a.name }), {
      title: t('appstore.update'),
      confirmLabel: t('appstore.update'),
    }))) return;
    update.mutate(a.id, {
      onSuccess: () => toast.success(t('appstore.update_started')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const handleRollback = async (a: InstalledApp) => {
    if (!(await confirm(t('appstore.rollback_confirm', { name: a.name }), {
      title: t('appstore.rollback'),
      confirmLabel: t('appstore.rollback'),
    }))) return;
    rollback.mutate(a.id, {
      onSuccess: () => toast.success(t('appstore.rollback_started')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">{t('appstore.my_apps')}</h1>
            <p className="text-sm text-muted-foreground">{t('appstore.my_apps_subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
            {reconcile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            {t('appstore.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/appstore')}>
            <Store className="mr-2 h-4 w-4" />
            {t('appstore.title')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">{t('appstore.loading')}</div>
      ) : apps.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t('appstore.no_installed')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t('appstore.col_name')}</th>
                <th className="px-3 py-2 font-medium">{t('appstore.col_status')}</th>
                <th className="px-3 py-2 font-medium">{t('appstore.col_version')}</th>
                <th className="px-3 py-2 font-medium">{t('appstore.col_address')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('appstore.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => {
                const busy = lifecycle.isPending || del.isPending || retry.isPending || update.isPending || rollback.isPending;
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.app_id} · VMID {a.vmid ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={a.status} pulse />
                        <span className="text-xs">{a.status}</span>
                      </span>
                      {a.status === 'orphaned' && (
                        <div className="text-2xs text-amber-600">{t('appstore.orphaned_hint')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {a.version_installed ?? '—'}
                      {a.update_available && <Badge variant="secondary" className="ml-1.5 text-2xs">update</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          {a.ip}:{a.port} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {a.status === 'stopped' && (
                          <Button size="icon-sm" variant="ghost" title={t('appstore.start')} onClick={() => act(a, 'start')} disabled={busy}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {a.status === 'running' && (
                          <>
                            <Button size="icon-sm" variant="ghost" title={t('appstore.stop')} onClick={() => act(a, 'stop')} disabled={busy}>
                              <Square className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" title={t('appstore.restart')} onClick={() => act(a, 'restart')} disabled={busy}>
                              <RotateCw className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {a.vmid && a.status !== 'orphaned' && (
                          <Button size="icon-sm" variant="ghost" title={t('appstore.logs')} onClick={() => setLogsApp(a)}>
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" title={t('appstore.credentials_btn')} onClick={() => setCredsApp(a)}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        {a.update_available && ['running', 'stopped', 'update_failed'].includes(a.status) && (
                          <Button size="icon-sm" variant="ghost" className="text-primary" title={t('appstore.update')} onClick={() => handleUpdate(a)} disabled={busy}>
                            <ArrowUpCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {a.last_snapshot && (
                          <Button size="icon-sm" variant="ghost" className="text-amber-600" title={t('appstore.rollback')} onClick={() => handleRollback(a)} disabled={busy}>
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {a.status === 'error' && (
                          <Button size="sm" variant="outline" onClick={() => handleRetry(a)} disabled={busy}>
                            <RotateCw className="h-3.5 w-3.5" />
                            <span className="ml-1">{t('appstore.retry')}</span>
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" className="text-destructive" title={t('appstore.delete')} onClick={() => handleDelete(a)} disabled={busy}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <LogsDialog app={logsApp} onClose={() => setLogsApp(null)} />
      <CredentialsDialog app={credsApp} onClose={() => setCredsApp(null)} />
    </div>
  );
}

function CredentialsDialog({ app, onClose }: { app: InstalledApp | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: creds, isFetching } = useAppCredentials(app?.id ?? 0, !!app);
  const entries = Object.entries(creds ?? {});

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success(t('appstore.copied'));
  };

  return (
    <Dialog open={!!app} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('appstore.credentials_title', { name: app?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        {isFetching && !creds ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('appstore.loading')}</div>
        ) : entries.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t('appstore.no_credentials')}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('appstore.credentials_hint')}</p>
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">{k}</span>
                <span className="ml-auto truncate font-mono text-sm">{v}</span>
                <Button size="icon-sm" variant="ghost" title={t('appstore.copy')} onClick={() => copy(v)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LogsDialog({ app, onClose }: { app: InstalledApp | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: logs, isFetching, refetch } = useAppLogs(app?.id ?? 0, !!app);

  return (
    <Dialog open={!!app} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-8">
            {t('appstore.logs_title', { name: app?.name ?? '' })}
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              <span className="ml-1">{t('appstore.refresh')}</span>
            </Button>
          </DialogTitle>
        </DialogHeader>
        <pre className="max-h-[65vh] overflow-auto rounded-md border bg-muted/40 p-3 text-2xs leading-relaxed">
          {isFetching && !logs ? t('appstore.loading') : (logs && logs.trim() ? logs : t('appstore.no_logs'))}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
