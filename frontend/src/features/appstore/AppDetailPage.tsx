import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Package, ExternalLink, Download, AlertTriangle, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useCatalogApp } from '@/hooks/use-appstore';
import { Markdown } from '@/components/shared/Markdown';
import InstallWizard from './InstallWizard';

export default function AppDetailPage() {
  const { appId = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: app, isLoading } = useCatalogApp(appId);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">{t('appstore.loading')}</div>;
  }
  if (!app) {
    return <div className="py-20 text-center text-muted-foreground">{t('appstore.no_apps')}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/appstore')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('appstore.back')}
      </Button>

      <div className="flex items-start gap-4">
        {app.logo_url ? (
          <img src={app.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-contain" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{app.name}</h1>
            {!app.available && <Badge variant="destructive">{t('appstore.unavailable')}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{app.short_desc}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {app.version && <span>{t('appstore.version')}: {app.version}</span>}
            {app.author && <span>{t('appstore.by')} {app.author}</span>}
            {(app.categories ?? []).map((c) => <Badge key={c} variant="outline" className="text-2xs">{c}</Badge>)}
          </div>
        </div>
        <Button onClick={() => setWizardOpen(true)} disabled={!app.available}>
          <Download className="mr-2 h-4 w-4" />
          {t('appstore.install')}
        </Button>
      </div>

      {/* Disclaimer (S-3) */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p>{t('appstore.disclaimer')}</p>
          <div className="flex gap-3">
            {app.source_url && (
              <a href={app.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />{t('appstore.source')}
              </a>
            )}
            {app.compose_yaml && (
              <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setShowCompose((s) => !s)}>
                <Code className="h-3 w-3" />{t('appstore.view_compose')}
              </button>
            )}
          </div>
        </div>
      </div>

      {showCompose && app.compose_yaml && (
        <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">{app.compose_yaml}</pre>
      )}

      {app.description_md && (
        <Card className="p-4">
          <Markdown content={app.description_md} />
        </Card>
      )}

      <InstallWizard app={app} open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
