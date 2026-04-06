import { useState } from 'react';
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
} from '@/hooks/use-settings';

export default function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t('settings.profile')}</TabsTrigger>
          <TabsTrigger value="panel">{t('settings.panel')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.notifications')}</TabsTrigger>
          <TabsTrigger value="about">{t('settings.about')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
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
  const inited = displayName || email;
  if (profile && !inited) {
    setDisplayName(profile.full_name || '');
    setEmail(profile.email || '');
  }

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

  if (settings && !panelName) {
    setPanelName(settings.panel_name || '');
    setLang(settings.language || 'ru');
  }

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

  if (security && !maxAttempts) {
    setMaxAttempts(String(security.max_login_attempts ?? 5));
    setLockoutDuration(String(security.lockout_duration ?? 300));
    setSessionTimeout(String(security.session_timeout ?? 3600));
  }

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

  if (channels?.smtp && !smtpHost) {
    setSmtpHost(String(channels.smtp.host ?? ''));
    setSmtpPort(String(channels.smtp.port ?? 587));
    setSmtpUser(String(channels.smtp.username ?? ''));
    setSmtpFrom(String(channels.smtp.from_email ?? ''));
  }
  if (channels?.telegram && !tgToken) {
    setTgToken(String(channels.telegram.telegram_bot_token ?? channels.telegram.bot_token ?? ''));
    setTgChatId(String(channels.telegram.chat_id ?? ''));
  }

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
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Telegram</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Bot Token</Label><Input value={tgToken} onChange={e => setTgToken(e.target.value)} className="mt-1" /></div>
          <div><Label>Chat ID</Label><Input value={tgChatId} onChange={e => setTgChatId(e.target.value)} className="mt-1" /></div>
          <Button size="sm" onClick={() => updateTg.mutate({ telegram_bot_token: tgToken })}>{t('common.save')}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AboutTab() {
  const { t } = useTranslation();
  const { data: version } = useAppVersion();
  const checkUpdates = useCheckUpdates();

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('settings.about')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('settings.version')}:</span>
          <Badge variant="outline">{version?.version || '—'}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => checkUpdates.mutate()}>
          {t('settings.check_updates')}
        </Button>
        {checkUpdates.data && (
          <p className="text-sm">{checkUpdates.data.has_update ? `${t('settings.update_available')}: ${checkUpdates.data.latest_version}` : t('settings.up_to_date')}</p>
        )}
      </CardContent>
    </Card>
  );
}
