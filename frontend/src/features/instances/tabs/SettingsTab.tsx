import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVMConfig, useUpdateConfig, useResizeDisk, useVMOwner, useSetVMOwner, useExecuteScript, useSavedConfig } from '@/hooks/use-instances';
import { useProfile } from '@/hooks/use-settings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

const OWNER_NONE = '__none__';

function OwnerCard({ serverId, vmid }: { serverId: number; vmid: number }) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const isAdmin = !!profile?.is_admin;
  const { data: owner } = useVMOwner(serverId, vmid, isAdmin);
  const setOwner = useSetVMOwner(serverId, vmid);
  const [selected, setSelected] = useState<string | null>(null);

  if (!isAdmin) return null;

  const current = owner?.owner_id != null ? String(owner.owner_id) : OWNER_NONE;
  const value = selected ?? current;

  const handleSave = () => {
    const userId = value === OWNER_NONE ? null : Number(value);
    setOwner.mutate(userId, {
      onSuccess: () => { toast.success(t('instances.owner_saved')); setSelected(null); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />{t('instances.owner')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>{t('instances.owner')}</Label>
            <Select value={value} onValueChange={v => { if (v) setSelected(v); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={OWNER_NONE}>{t('instances.no_owner')}</SelectItem>
                {(owner?.users ?? []).map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.username}{u.full_name ? ` (${u.full_name})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleSave} disabled={setOwner.isPending || value === current}>{t('common.save')}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('instances.owner_hint')}</p>
      </CardContent>
    </Card>
  );
}

function ExecuteScriptCard({ serverId, vmid, node }: { serverId: number; vmid: number; node: string }) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const exec = useExecuteScript(serverId, vmid);
  const [script, setScript] = useState('');
  const [interpreter, setInterpreter] = useState('/bin/bash');
  const [timeout, setTimeoutVal] = useState('60');

  if (!profile?.is_admin) return null;

  const run = () => {
    if (!script.trim()) { toast.error(t('instances.script_required')); return; }
    exec.mutate(
      { script, interpreter, node, timeout: Number(timeout) || 60 },
      { onError: (e: Error) => toast.error(e.message) },
    );
  };

  const r = exec.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />{t('instances.execute_script')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('instances.execute_script_hint')}</p>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={'uptime\ndf -h'}
          className="w-full rounded-md border bg-background p-2 font-mono text-xs"
        />
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t('instances.interpreter')}</Label><Input value={interpreter} onChange={e => setInterpreter(e.target.value)} className="mt-1 font-mono" /></div>
          <div><Label>{t('instances.timeout_sec')}</Label><Input type="number" min={1} max={600} value={timeout} onChange={e => setTimeoutVal(e.target.value)} className="mt-1" /></div>
        </div>
        <Button size="sm" onClick={run} disabled={exec.isPending}>
          {exec.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('instances.run_script')}
        </Button>

        {r && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t('instances.exit_code')}:</span>
              <code className={r.exit_code === 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'}>{r.exit_code ?? '—'}</code>
            </div>
            {r.error && <p className="text-xs text-destructive">{r.error}</p>}
            {r.stdout != null && r.stdout !== '' && (
              <div><p className="text-xs font-medium text-muted-foreground">stdout</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{r.stdout}</pre></div>
            )}
            {r.stderr != null && r.stderr !== '' && (
              <div><p className="text-xs font-medium text-muted-foreground">stderr</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap text-destructive">{r.stderr}</pre></div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SavedConfigCard({ serverId, vmid }: { serverId: number; vmid: number }) {
  const { t } = useTranslation();
  const { data } = useSavedConfig(serverId, vmid);
  if (!data?.found || !data.config) return null;
  const c = data.config;

  const rows: [string, string | number | undefined][] = [
    [t('instances.saved_name'), c.name],
    ['vCPU', c.cores],
    [`${t('nodes.memory')} (MB)`, c.memory],
    [`${t('nodes.disk')} (GB)`, c.disk_size],
    ['IP', c.ip_address ? `${c.ip_address}${c.ip_prefix ? `/${c.ip_prefix}` : ''}` : undefined],
    [t('netif.gateway'), c.gateway],
    ['DNS', c.nameserver],
    [t('instances.cloud_user'), c.cloud_init_user],
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />{t('instances.saved_config')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">{t('instances.saved_config_hint')}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {rows.filter(([, v]) => v != null && v !== '').map(([label, v]) => (
            <div key={label} className="flex justify-between gap-2 border-b py-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">{String(v)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type);
  const resizeDisk = useResizeDisk(serverId, vmid, type);

  const [cores, setCores] = useState('');
  const [memory, setMemory] = useState('');
  const [diskSize, setDiskSize] = useState('');
  const [diskDevice, setDiskDevice] = useState('scsi0');

  // Initialize from config
  const currentCores = config?.cores || 0;
  const currentMemory = config?.memory || 0;

  const handleConfigUpdate = () => {
    const updates: Record<string, unknown> = {};
    if (cores && Number(cores) !== currentCores) updates.cores = Number(cores);
    if (memory && Number(memory) !== currentMemory) updates.memory = Number(memory);

    if (Object.keys(updates).length === 0) {
      toast.info('No changes to apply');
      return;
    }

    updateConfig.mutate(updates, {
      onSuccess: () => {
        toast.success('Configuration updated');
        setCores('');
        setMemory('');
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDiskResize = () => {
    if (!diskSize) return;
    resizeDisk.mutate(
      { disk: diskDevice, size: `${diskSize}G` },
      {
        onSuccess: () => {
          toast.success(`Disk resized to ${diskSize}G`);
          setDiskSize('');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <OwnerCard serverId={serverId} vmid={vmid} />

      {type !== 'lxc' && <ExecuteScriptCard serverId={serverId} vmid={vmid} node={node} />}

      {/* CPU & Memory */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Compute Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cores">vCPU Cores</Label>
              <Input
                id="cores"
                type="number"
                min={1}
                max={128}
                placeholder={String(currentCores)}
                value={cores}
                onChange={(e) => setCores(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Current: {currentCores} cores</p>
            </div>
            <div>
              <Label htmlFor="memory">Memory (MB)</Label>
              <Input
                id="memory"
                type="number"
                min={128}
                step={128}
                placeholder={String(currentMemory)}
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Current: {currentMemory} MB</p>
            </div>
          </div>
          <Button onClick={handleConfigUpdate} disabled={updateConfig.isPending} size="sm">
            {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Changes
          </Button>
          <p className="text-xs text-muted-foreground">
            Note: VM may need to be restarted for changes to take effect.
          </p>
        </CardContent>
      </Card>

      {/* Disk Resize */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Disk Resize</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="disk-device">Disk Device</Label>
              <Input
                id="disk-device"
                value={diskDevice}
                onChange={(e) => setDiskDevice(e.target.value)}
                placeholder={t('common.placeholder_disk')}
              />
            </div>
            <div>
              <Label htmlFor="disk-size">New Size (GB)</Label>
              <Input
                id="disk-size"
                type="number"
                min={1}
                value={diskSize}
                onChange={(e) => setDiskSize(e.target.value)}
                placeholder={t('common.placeholder_disk_size')}
              />
            </div>
          </div>
          <Button
            onClick={handleDiskResize}
            disabled={!diskSize || resizeDisk.isPending}
            size="sm"
            variant="outline"
          >
            {resizeDisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resize Disk
          </Button>
          <p className="text-xs text-muted-foreground">
            Disks can only be enlarged. Use the full target size.
          </p>
        </CardContent>
      </Card>

      <SavedConfigCard serverId={serverId} vmid={vmid} />

      {/* Raw Config */}
      {config && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Raw Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs font-mono max-h-64">
              {JSON.stringify(config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
