import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCoolifySettings, useTestCoolify, useUpdateCoolifySettings } from '@/hooks/use-coolify';

export default function CoolifySettingsTab() {
  const { t } = useTranslation();
  const { data } = useCoolifySettings();
  const save = useUpdateCoolifySettings();
  const test = useTestCoolify();
  const [name, setName] = useState('Coolify');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [verifySsl, setVerifySsl] = useState(true);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => { if (data) { setName(data.name); setUrl(data.base_url); setVerifySsl(data.verify_ssl); setEnabled(data.enabled); } }, [data]);
  const draft = { name, base_url: url, api_token: token || undefined, verify_ssl: verifySsl, enabled };

  return <Card>
    <CardHeader><CardTitle className="text-sm">{t('coolify.integration')}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('coolify.settings_help')}</p>
      <div><Label>{t('coolify.name')}</Label><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label>{t('coolify.url')}</Label><Input className="mt-1" placeholder="https://coolify.example.com" value={url} onChange={e => setUrl(e.target.value)} /></div>
      <div><Label>{t('coolify.api_token')}</Label><Input className="mt-1" type="password" autoComplete="new-password" placeholder={data?.token_configured ? t('coolify.token_preserved') : ''} value={token} onChange={e => setToken(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={verifySsl} onChange={e => setVerifySsl(e.target.checked)} />{t('coolify.verify_ssl')}</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={enabled} onChange={e => setEnabled(e.target.checked)} />{t('coolify.enabled')}</label>
      <div className="flex gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(draft, { onSuccess: () => { setToken(''); toast.success(t('coolify.saved')); }, onError: e => toast.error(e.message) })}>{t('common.save')}</Button>
        <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate({ base_url: url, api_token: token || undefined, verify_ssl: verifySsl }, { onSuccess: r => toast.success(t('coolify.test_success', { count: r.server_count })), onError: e => toast.error(e.message) })}>{t('coolify.test_connection')}</Button>
      </div>
    </CardContent>
  </Card>;
}
