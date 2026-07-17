import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Store, Search, RefreshCw, Loader2, Package, HardDriveDownload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useCatalog, useCatalogMeta, useInstalledApps, useSyncCatalog } from '@/hooks/use-appstore';
import { useAuthStore } from '@/stores/auth-store';
import GoldenTemplateDialog from './GoldenTemplateDialog';

export default function AppStorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [goldenOpen, setGoldenOpen] = useState(false);
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const location = useLocation();
  // Возврат из глобальной плашки сборки шаблона: открываем диалог с нужным сервером.
  const [goldenServerId, setGoldenServerId] = useState<number | null>(null);
  useEffect(() => {
    const sid = (location.state as { openGolden?: number } | null)?.openGolden;
    if (sid) {
      setGoldenServerId(sid);
      setGoldenOpen(true);
      navigate('.', { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const { data: catalog, isLoading } = useCatalog(search, category, source);
  const { data: meta } = useCatalogMeta();
  const { data: installed = [] } = useInstalledApps();
  const sync = useSyncCatalog();

  const installedIds = useMemo(
    () => new Set(installed.map((a) => a.app_id).filter(Boolean)),
    [installed],
  );

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: (r) => toast.success(t('appstore.sync_done', { total: r.stats.total })),
      onError: (e) => toast.error((e as Error).message || t('appstore.sync_failed')),
    });
  };

  const items = catalog?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">{t('appstore.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('appstore.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/my-apps')}>
            <Package className="mr-2 h-4 w-4" />
            {t('appstore.my_apps')}
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setGoldenOpen(true)}>
              <HardDriveDownload className="mr-2 h-4 w-4" />
              {t('appstore.golden.button', 'Золотой шаблон')}
            </Button>
          )}
          <Button size="sm" onClick={handleSync} disabled={sync.isPending}>
            {sync.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
            {t('appstore.refresh_catalog')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t('appstore.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? '')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('appstore.all_categories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('appstore.all_categories')}</SelectItem>
            {(meta?.categories ?? []).map((c) => (
              <SelectItem key={c} value={c}>{t(`appstore.categories.${c}`, c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(meta?.sources?.length ?? 0) > 1 && (
          <Select value={source} onValueChange={(v) => setSource(v ?? '')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('appstore.all_sources')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('appstore.all_sources')}</SelectItem>
              {(meta?.sources ?? []).map((s) => (
                <SelectItem key={s} value={s}>{t(`appstore.sources.${s}`, s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {meta?.last_synced_at && (
          <span className="text-xs text-muted-foreground">
            {t('appstore.last_synced')}: {new Date(meta.last_synced_at).toLocaleString()}
          </span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">{t('appstore.loading')}</div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Store className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t('appstore.no_apps')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((app) => (
            <Card
              key={app.app_id}
              className="group flex cursor-pointer flex-col gap-2 p-3 transition-colors hover:border-primary/40"
              onClick={() => navigate(`/appstore/${app.app_id}`)}
            >
              <div className="flex items-start gap-3">
                {app.logo_url ? (
                  <img src={app.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{app.name}</p>
                    {installedIds.has(app.app_id) && (
                      <Badge variant="secondary" className="shrink-0">{t('appstore.installed_badge')}</Badge>
                    )}
                  </div>
                  <p className="line-clamp-3 text-xs text-muted-foreground">{app.short_desc}</p>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1">
                {(meta?.sources?.length ?? 0) > 1 && app.source && (
                  <Badge variant="secondary" className="text-2xs capitalize">
                    {t(`appstore.sources.${app.source}`, app.source)}
                  </Badge>
                )}
                {(app.categories ?? []).slice(0, 2).map((c) => (
                  <Badge key={c} variant="outline" className="text-2xs">{t(`appstore.categories.${c}`, c)}</Badge>
                ))}
                {app.port && (
                  <Badge variant="outline" className="text-2xs">{t('appstore.port')}: {app.port}</Badge>
                )}
                {!app.available && (
                  <Badge variant="destructive" className="text-2xs">{t('appstore.unavailable')}</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Атрибуция (риск п.13, юр.) */}
      <div className="pt-2 text-center text-2xs text-muted-foreground">
        <a href="https://github.com/runtipi/runtipi-appstore" target="_blank" rel="noreferrer" className="hover:underline">
          {t('appstore.powered_by')}
        </a>
      </div>

      {isAdmin && (
        <GoldenTemplateDialog
          open={goldenOpen}
          onOpenChange={(o) => { setGoldenOpen(o); if (!o) setGoldenServerId(null); }}
          initialServerId={goldenServerId}
        />
      )}
    </div>
  );
}
