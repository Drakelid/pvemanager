import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  useProfile, useUpdateProfile, useChangePassword,
  usePanelSettings, useUpdatePanelSettings,
  useSecuritySettings, useUpdateSecuritySettings,
  useNotificationChannels, useUpdateSMTP, useUpdateTelegram,
  useAppVersion, useCheckUpdates,
  useUpdateRepository, useSetUpdateRepository, useUpdateStatus, usePerformUpdate, useResetUpdate,
  useTestSMTP, useTestTelegram,
} from '@/hooks/use-settings';
import {
  useNotificationPreferences, useUpdateNotificationPreferences,
  useChannelsStatus, useSendTestNotification, useVerifyTelegramChat, useTelegramBotInfo,
} from '@/hooks/use-notifications';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SSHKeysManager } from './SSHKeysManager';

export default function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t('settings.profile')}</TabsTrigger>
          <TabsTrigger value="ssh-keys">{t('ssh_keys.title')}</TabsTrigger>
          <TabsTrigger value="panel">{t('settings.panel')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.notifications')}</TabsTrigger>
          <TabsTrigger value="about">{t('settings.about')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="ssh-keys">
          <Card>
            <CardHeader><CardTitle className="text-sm">{t('ssh_keys.title')}</CardTitle></CardHeader>
            <CardContent><SSHKeysManager /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="panel"><PanelTab /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="about"><AboutTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // Init from profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.full_name || '');
      setEmail(profile.email || '');
    }
  }, [profile]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('settings.profile_info')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>{t('settings.username')}</Label><Input value={profile?.username || ''} disabled className="mt-1" /></div>
          <div><Label>{t('settings.display_name')}</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" /></div>
          <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
          <Button size="sm" onClick={() => updateProfile.mutate({ full_name: displayName, email })}>{t('common.save')}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('settings.change_password')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>{t('settings.current_password')}</Label><Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} className="mt-1" /></div>
          <div><Label>{t('settings.new_password')}</Label><Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="mt-1" /></div>
          <div><Label>{t('settings.confirm_password')}</Label><Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} className="mt-1" /></div>
          <Button size="sm" onClick={() => {
            if (newPwd !== confirmPwd) { toast.error(t('settings.password_mismatch')); return; }
            changePassword.mutate({ current_password: currentPwd, new_password: newPwd, confirm_password: confirmPwd });
            setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
          }}>{t('settings.change_password')}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PanelTab() {
  const { t } = useTranslation();
  const { data: settings } = usePanelSettings();
  const updatePanel = useUpdatePanelSettings();
  const [panelName, setPanelName] = useState('');
  const [lang, setLang] = useState('');

  useEffect(() => {
    if (settings) {
      setPanelName(settings.panel_name || '');
      setLang(settings.language || 'ru');
    }
  }, [settings]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('settings.panel_settings')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>{t('settings.panel_name')}</Label><Input value={panelName} onChange={e => setPanelName(e.target.value)} className="mt-1" /></div>
        <div>
          <Label>{t('settings.language')}</Label>
          <select value={lang} onChange={e => setLang(e.target.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm">
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
        <Button size="sm" onClick={() => updatePanel.mutate({ panel_name: panelName, language: lang })}>{t('common.save')}</Button>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const { t } = useTranslation();
  const { data: security } = useSecuritySettings();
  const updateSecurity = useUpdateSecuritySettings();
  const [maxAttempts, setMaxAttempts] = useState('');
  const [lockoutDuration, setLockoutDuration] = useState('');
  const [sessionTimeout, setSessionTimeout] = useState('');

  useEffect(() => {
    if (security) {
      setMaxAttempts(String(security.max_login_attempts ?? 5));
      setLockoutDuration(String(security.lockout_duration ?? 300));
      setSessionTimeout(String(security.session_timeout ?? 3600));
    }
  }, [security]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('settings.security_settings')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>{t('settings.max_attempts')}</Label><Input type="number" value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} className="mt-1" /></div>
        <div><Label>{t('settings.lockout_duration')}</Label><Input type="number" value={lockoutDuration} onChange={e => setLockoutDuration(e.target.value)} className="mt-1" /><p className="text-xs text-muted-foreground mt-1">{t('settings.seconds')}</p></div>
        <div><Label>{t('settings.session_timeout')}</Label><Input type="number" value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className="mt-1" /><p className="text-xs text-muted-foreground mt-1">{t('settings.seconds')}</p></div>
        <Button size="sm" onClick={() => updateSecurity.mutate({
          max_login_attempts: Number(maxAttempts),
          lockout_duration: Number(lockoutDuration),
          session_timeout: Number(sessionTimeout),
        })}>{t('common.save')}</Button>
      </CardContent>
    </Card>
  );
}

function NotificationsTab() {
  const { t } = useTranslation();
  const { data: channels } = useNotificationChannels();
  const updateSmtp = useUpdateSMTP();
  const updateTg = useUpdateTelegram();
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');

  useEffect(() => {
    if (channels?.smtp) {
      setSmtpHost(String(channels.smtp.host ?? ''));
      setSmtpPort(String(channels.smtp.port ?? 587));
      setSmtpUser(String(channels.smtp.username ?? ''));
      setSmtpFrom(String(channels.smtp.from_email ?? ''));
    }
  }, [channels?.smtp]);

  useEffect(() => {
    if (channels?.telegram) {
      setTgToken(String(channels.telegram.telegram_bot_token ?? channels.telegram.bot_token ?? ''));
      setTgChatId(String(channels.telegram.chat_id ?? ''));
    }
  }, [channels?.telegram]);

  const testSmtp = useTestSMTP();
  const testTg = useTestTelegram();
  const botInfo = useTelegramBotInfo();
  const [testEmail, setTestEmail] = useState('');

  const handleTestSmtp = () => {
    if (!testEmail) { toast.error(t('settings.test_email_required')); return; }
    testSmtp.mutate(testEmail, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const handleTestTg = () => {
    if (!tgChatId) { toast.error(t('settings.chat_id_required')); return; }
    testTg.mutate(tgChatId, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const bot = botInfo.data?.bot_info as { username?: string; first_name?: string } | null | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">SMTP</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Host</Label><Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="mt-1" /></div>
            <div><Label>Port</Label><Input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="mt-1" /></div>
            <div><Label>Username</Label><Input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className="mt-1" /></div>
            <div><Label>Password</Label><Input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className="mt-1" /></div>
            <div><Label>From Email</Label><Input value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} className="mt-1" /></div>
          </div>
          <Button size="sm" onClick={() => updateSmtp.mutate({ host: smtpHost, port: Number(smtpPort), username: smtpUser, password: smtpPass || undefined, from_email: smtpFrom })}>{t('common.save')}</Button>
          <div className="flex items-center gap-2 border-t pt-3">
            <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} className="max-w-xs" placeholder={t('settings.test_email_placeholder')} />
            <Button size="sm" variant="outline" onClick={handleTestSmtp} disabled={testSmtp.isPending}>{t('settings.send_test')}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Telegram
            {bot?.username && <Badge variant="outline">@{bot.username}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Bot Token</Label><Input value={tgToken} onChange={e => setTgToken(e.target.value)} className="mt-1" /></div>
          <div><Label>Chat ID</Label><Input value={tgChatId} onChange={e => setTgChatId(e.target.value)} className="mt-1" /></div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => updateTg.mutate({ telegram_bot_token: tgToken })}>{t('common.save')}</Button>
            <Button size="sm" variant="outline" onClick={handleTestTg} disabled={testTg.isPending}>{t('settings.send_test')}</Button>
          </div>
        </CardContent>
      </Card>

      <NotificationPreferencesCard />
    </div>
  );
}

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4" />
      <Label htmlFor={id} className="cursor-pointer">{label}</Label>
    </div>
  );
}

function NotificationPreferencesCard() {
  const { t } = useTranslation();
  const { data: prefs } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const sendTest = useSendTestNotification();
  const verifyTg = useVerifyTelegramChat();
  const { data: channelsStatus } = useChannelsStatus();

  const [enabled, setEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailCritical, setEmailCritical] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgChatId, setTgChatId] = useState('');
  const [webhook, setWebhook] = useState('');
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');
  const [testChannel, setTestChannel] = useState('all');

  useEffect(() => {
    if (!prefs) return;
    setEnabled(prefs.enabled);
    setEmailEnabled(prefs.email_enabled);
    setEmailCritical(prefs.email_critical_only);
    setTgEnabled(prefs.telegram_enabled);
    setTgChatId(prefs.telegram_chat_id ?? '');
    setWebhook(prefs.webhook_url ?? '');
    setQuietStart(prefs.quiet_hours_start ?? '');
    setQuietEnd(prefs.quiet_hours_end ?? '');
  }, [prefs]);

  const handleSave = () => {
    update.mutate({
      enabled, email_enabled: emailEnabled, email_critical_only: emailCritical,
      telegram_enabled: tgEnabled, telegram_chat_id: tgChatId || undefined,
      webhook_url: webhook || undefined,
      quiet_hours_start: quietStart || undefined, quiet_hours_end: quietEnd || undefined,
    }, {
      onSuccess: () => toast.success(t('settings.prefs_saved')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleVerify = () => {
    if (!tgChatId) { toast.error(t('settings.chat_id_required')); return; }
    verifyTg.mutate(tgChatId, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleTest = () => {
    sendTest.mutate(testChannel, {
      onSuccess: () => toast.success(t('settings.test_sent')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('settings.my_notifications')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Toggle id="np_enabled" checked={enabled} onChange={setEnabled} label={t('settings.notifications_enabled')} />
        <Toggle id="np_email" checked={emailEnabled} onChange={setEmailEnabled} label={t('settings.email_enabled')} />
        <Toggle id="np_email_crit" checked={emailCritical} onChange={setEmailCritical} label={t('settings.email_critical_only')} />
        <Toggle id="np_tg" checked={tgEnabled} onChange={setTgEnabled} label={t('settings.telegram_enabled')} />
        <div className="flex items-end gap-2">
          <div className="flex-1"><Label>Telegram Chat ID</Label><Input value={tgChatId} onChange={e => setTgChatId(e.target.value)} className="mt-1" /></div>
          <Button size="sm" variant="outline" onClick={handleVerify} disabled={verifyTg.isPending}>{t('settings.verify')}</Button>
        </div>
        <div><Label>Webhook URL</Label><Input value={webhook} onChange={e => setWebhook(e.target.value)} className="mt-1" placeholder="https://..." /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('settings.quiet_start')}</Label><Input value={quietStart} onChange={e => setQuietStart(e.target.value)} className="mt-1" placeholder="22:00" /></div>
          <div><Label>{t('settings.quiet_end')}</Label><Input value={quietEnd} onChange={e => setQuietEnd(e.target.value)} className="mt-1" placeholder="08:00" /></div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={update.isPending}>{t('common.save')}</Button>

        <div className="flex items-center gap-2 border-t pt-3">
          <Select value={testChannel} onValueChange={v => { if (v) setTestChannel(v); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="inapp">In-app</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleTest} disabled={sendTest.isPending}>{t('settings.send_test_notification')}</Button>
          {channelsStatus && (
            <span className="ml-auto text-xs text-muted-foreground">
              {Object.entries(channelsStatus).map(([k, v]) => {
                const conf = (v as { configured?: boolean })?.configured;
                return typeof conf === 'boolean' ? `${k}: ${conf ? '✓' : '✗'}` : null;
              }).filter(Boolean).join('  ')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AboutTab() {
  const { t } = useTranslation();
  const { data: version } = useAppVersion();
  const checkUpdates = useCheckUpdates();
  const { data: repo } = useUpdateRepository();
  const setRepo = useSetUpdateRepository();
  const performUpdate = usePerformUpdate();
  const resetUpdate = useResetUpdate();

  const check = checkUpdates.data;
  const updating = check?.update_available ?? false;
  // Poll the update status only while an update is running.
  const { data: status } = useUpdateStatus(performUpdate.isSuccess);

  const [repoUrl, setRepoUrl] = useState('');
  const [repoEdit, setRepoEdit] = useState(false);

  useEffect(() => {
    if (repo?.repository_url) setRepoUrl(repo.repository_url);
  }, [repo?.repository_url]);

  const handleSaveRepo = () => {
    setRepo.mutate(repoUrl, {
      onSuccess: () => { toast.success(t('settings.repo_saved')); setRepoEdit(false); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handlePerform = () => {
    if (!confirm(t('settings.update_confirm'))) return;
    performUpdate.mutate(undefined, {
      onSuccess: (r) => r.success ? toast.success(r.message || t('settings.update_started')) : toast.error(r.error || 'Error'),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('settings.about')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('settings.version')}:</span>
          <Badge variant="outline">{version?.version || '—'}</Badge>
        </div>

        {/* Repository */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('settings.update_repository')}</Label>
          {repoEdit ? (
            <div className="flex items-center gap-2">
              <Input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://git.example.com/owner/repo" />
              <Button size="sm" onClick={handleSaveRepo} disabled={setRepo.isPending || !repoUrl}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setRepoEdit(false); setRepoUrl(repo?.repository_url || ''); }}>{t('common.cancel')}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs">{repo?.repository_url || '—'}</code>
              <Button size="sm" variant="ghost" onClick={() => setRepoEdit(true)}>{t('common.edit', 'Edit')}</Button>
            </div>
          )}
        </div>

        {/* Check */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => checkUpdates.mutate()} disabled={checkUpdates.isPending}>
            {t('settings.check_updates')}
          </Button>
          {updating && (
            <Button size="sm" onClick={handlePerform} disabled={performUpdate.isPending || status?.is_updating}>
              {t('settings.perform_update')}
            </Button>
          )}
        </div>

        {check && (
          <div className="space-y-1 text-sm">
            {check.error ? (
              <p className="text-destructive">{check.error}</p>
            ) : check.update_available ? (
              <p className="font-medium text-amber-600 dark:text-amber-500">
                {t('settings.update_available')}: {check.latest_version}
              </p>
            ) : (
              <p className="text-muted-foreground">{t('settings.up_to_date')}</p>
            )}
            {check.changelog && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{check.changelog}</pre>
            )}
          </div>
        )}

        {/* Update in progress banner */}
        {status?.is_updating && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">{t('settings.update_in_progress')}</p>
            <p className="text-xs text-muted-foreground">{status.stage} — {status.progress}%</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => resetUpdate.mutate()} disabled={resetUpdate.isPending}>
              {t('settings.update_reset')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
