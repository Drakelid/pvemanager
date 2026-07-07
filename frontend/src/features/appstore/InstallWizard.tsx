import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Copy, ExternalLink } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { useServers } from '@/hooks/use-nodes';
import { useIPAMNetworks, useIPAMPools } from '@/hooks/use-ipam';
import { useInstallApp, useInstalledApp, useOperationProgress } from '@/hooks/use-appstore';
import type { AppOperation, CatalogApp } from '@/types/appstore';

interface Props {
  app: CatalogApp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'form' | 'progress' | 'done' | 'failed';

export default function InstallWizard({ app, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: servers = [] } = useServers();
  const install = useInstallApp();

  const [name, setName] = useState(app.app_id);
  const [serverId, setServerId] = useState<string>('');
  const [node, setNode] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const [cores, setCores] = useState(2);
  const [memory, setMemory] = useState(2048);
  const [disk, setDisk] = useState(8);
  const [storage, setStorage] = useState('local-lvm');
  const [bridge, setBridge] = useState('vmbr0');
  const [ipamNetworkId, setIpamNetworkId] = useState<string>('');
  const [ipamPoolId, setIpamPoolId] = useState<string>('');

  const { data: ipamNetworks = [] } = useIPAMNetworks();
  const { data: ipamPools = [] } = useIPAMPools(ipamNetworkId ? Number(ipamNetworkId) : undefined);

  const [phase, setPhase] = useState<Phase>('form');
  const [installedAppId, setInstalledAppId] = useState<number | null>(null);
  const [op, setOp] = useState<AppOperation | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const { data: installedApp } = useInstalledApp(phase === 'done' ? (installedAppId ?? 0) : 0);

  const onOp = useCallback((o: AppOperation) => {
    setOp(o);
    if (o.status === 'completed') setPhase('done');
    else if (o.status === 'failed') setPhase('failed');
  }, []);
  useOperationProgress(phase === 'progress' ? installedAppId : null, onOp);

  // видимые поля формы (random генерируются на сервере, пользователю не показываем)
  const visibleFields = useMemo(
    () => (app.form_fields ?? []).filter((f) => (f.type || '').toLowerCase() !== 'random'),
    [app.form_fields],
  );

  const reset = () => {
    setPhase('form'); setOp(null); setInstalledAppId(null); setSecrets({});
    setName(app.app_id); setServerId(''); setNode(''); setAnswers({});
    setAdvanced(false); setCores(2); setMemory(2048); setDisk(8);
    setStorage('local-lvm'); setBridge('vmbr0');
    setIpamNetworkId(''); setIpamPoolId('');
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleInstall = () => {
    if (!serverId) { toast.error(t('appstore.select_server')); return; }
    install.mutate(
      {
        app_id: app.app_id, name, server_id: Number(serverId), node: node || undefined,
        form_answers: answers, cores, memory, disk, storage, bridge,
        ipam_network_id: ipamNetworkId ? Number(ipamNetworkId) : undefined,
        ipam_pool_id: ipamPoolId ? Number(ipamPoolId) : undefined,
      },
      {
        onSuccess: (r) => {
          setInstalledAppId(r.installed_app_id);
          setSecrets(r.secrets || {});
          setPhase('progress');
          toast.success(t('appstore.install_started'));
        },
        onError: (e) => {
          const msg = (e as Error).message || '';
          toast.error(
            msg.includes('APPSTORE_GOLDEN_TEMPLATE')
              ? t('appstore.golden_missing')
              : (msg || t('appstore.install_failed')),
          );
        },
      },
    );
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast.success(t('appstore.copied'));
  };

  const progress = op?.progress ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('appstore.install_title', { name: app.name })}</DialogTitle>
        </DialogHeader>

        {phase === 'form' && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>{t('appstore.app_name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('appstore.server')}</Label>
              <Select value={serverId} onValueChange={(v) => setServerId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder={t('appstore.select_server')} /></SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Динамические поля form_fields */}
            {visibleFields.map((f) => {
              const type = (f.type || 'text').toLowerCase();
              const val = answers[f.env_variable] ?? '';
              const set = (v: string) => setAnswers((a) => ({ ...a, [f.env_variable]: v }));
              return (
                <div key={f.env_variable} className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    {f.label || f.env_variable}
                    {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  {type === 'boolean' ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={val === 'true'}
                        onChange={(e) => set(e.target.checked ? 'true' : 'false')}
                      />
                      {f.hint}
                    </label>
                  ) : (
                    <Input
                      type={type === 'password' ? 'password' : type === 'number' ? 'number' : type === 'email' ? 'email' : 'text'}
                      value={val}
                      placeholder={f.hint}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            {/* Advanced */}
            <div>
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setAdvanced((a) => !a)}
              >
                {advanced ? '▾ ' : '▸ '}{t('appstore.step_advanced')}
              </button>
              {advanced && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <NumField label={t('appstore.cores')} value={cores} onChange={setCores} />
                  <NumField label={t('appstore.memory')} value={memory} onChange={setMemory} />
                  <NumField label={t('appstore.disk')} value={disk} onChange={setDisk} />
                  <div className="space-y-1.5">
                    <Label>{t('appstore.node')}</Label>
                    <Input value={node} onChange={(e) => setNode(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('appstore.storage')}</Label>
                    <Input value={storage} onChange={(e) => setStorage(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('appstore.bridge')}</Label>
                    <Input value={bridge} onChange={(e) => setBridge(e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t('appstore.ipam_network')}</Label>
                    <Select
                      value={ipamNetworkId || 'dhcp'}
                      onValueChange={(v) => {
                        const nv = !v || v === 'dhcp' ? '' : v;
                        setIpamNetworkId(nv);
                        setIpamPoolId('');
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dhcp">{t('appstore.ipam_dhcp')}</SelectItem>
                        {ipamNetworks.map((n) => (
                          <SelectItem key={n.id} value={String(n.id)}>
                            {n.name} ({n.network})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {ipamNetworkId && ipamPools.length > 0 && (
                    <div className="col-span-2 space-y-1.5">
                      <Label>{t('appstore.ipam_pool')}</Label>
                      <Select
                        value={ipamPoolId || 'auto'}
                        onValueChange={(v) => setIpamPoolId(!v || v === 'auto' ? '' : v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t('appstore.ipam_pool_auto')}</SelectItem>
                          {ipamPools.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name} ({p.range_start}–{p.range_end})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {(phase === 'progress' || phase === 'failed') && (
          <div className="space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${phase === 'failed' ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs">
              {(op?.steps_log ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span>{s.step}</span>
                  <span className="text-muted-foreground">{s.progress}%</span>
                </div>
              ))}
              {!op && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('appstore.installing')}</div>}
            </div>
            {phase === 'failed' && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{op?.error_text || t('appstore.install_failed')}</span>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              {t('appstore.done')}
            </div>
            {installedApp?.url && (
              <Button variant="outline" className="w-full" onClick={() => window.open(installedApp.url!, '_blank')}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {installedApp.url}
              </Button>
            )}
            {Object.keys(secrets).length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t('appstore.credentials')}</p>
                {Object.entries(secrets).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono text-2xs">{k}</Badge>
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-xs">{v}</code>
                    <Button size="icon-sm" variant="ghost" onClick={() => copy(v)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'form' && (
            <Button onClick={handleInstall} disabled={install.isPending}>
              {install.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('appstore.start_install')}
            </Button>
          )}
          {phase === 'done' && (
            <>
              <Button variant="outline" onClick={() => navigate('/my-apps')}>{t('appstore.my_apps')}</Button>
              <Button onClick={() => handleClose(false)}>{t('appstore.close')}</Button>
            </>
          )}
          {(phase === 'progress' || phase === 'failed') && (
            <Button variant="outline" onClick={() => handleClose(false)}>{t('appstore.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}
