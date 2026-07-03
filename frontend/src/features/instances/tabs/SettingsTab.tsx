import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Loader2, Power } from 'lucide-react';
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

/** Достать текущий размер диска в ГБ из строки конфига Proxmox
 *  (напр. "local-nvme:vm-106-disk-0.qcow2,...,size=51712M,ssd=1"). */
function parseDiskSizeGb(spec: unknown): number | null {
  if (typeof spec !== 'string') return null;
  const m = spec.match(/(?:^|,)size=(\d+(?:\.\d+)?)([KMGT])?/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const factor: Record<string, number> = { K: 1 / 1048576, M: 1 / 1024, G: 1, T: 1024 };
  return value * (factor[(m[2] || 'G').toUpperCase()] ?? 1);
}

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
          <div className="flex-1 space-y-1.5">
            <Label>{t('instances.owner')}</Label>
            <Select value={value} onValueChange={v => { if (v) setSelected(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div className="space-y-1.5"><Label>{t('instances.interpreter')}</Label><Input value={interpreter} onChange={e => setInterpreter(e.target.value)} className="font-mono" /></div>
          <div className="space-y-1.5"><Label>{t('instances.timeout_sec')}</Label><Input type="number" min={1} max={600} value={timeout} onChange={e => setTimeoutVal(e.target.value)} /></div>
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

/** Разобрать строку startup Proxmox ("order=1,up=30,down=60") на поля. */
function parseStartup(spec: unknown): { order: string; up: string; down: string } {
  const out = { order: '', up: '', down: '' };
  if (typeof spec !== 'string') return out;
  for (const part of spec.split(',')) {
    const [k, v] = part.split('=');
    if (k === 'order') out.order = v ?? '';
    else if (k === 'up') out.up = v ?? '';
    else if (k === 'down') out.down = v ?? '';
  }
  return out;
}

function AutostartCard({ serverId, vmid, type, node }: { serverId: number; vmid: number; type: string; node: string }) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);

  const [onboot, setOnboot] = useState(false);
  const [protection, setProtection] = useState(false);
  const [order, setOrder] = useState('');
  const [up, setUp] = useState('');
  const [down, setDown] = useState('');

  // Инициализация из конфига Proxmox
  useEffect(() => {
    if (!config) return;
    setOnboot(Number(config.onboot) === 1);
    setProtection(Number(config.protection) === 1);
    const s = parseStartup(config.startup);
    setOrder(s.order);
    setUp(s.up);
    setDown(s.down);
  }, [config]);

  const save = () => {
    const updates: Record<string, unknown> = {
      onboot: onboot ? 1 : 0,
      protection: protection ? 1 : 0,
    };
    // Собираем startup=order=..,up=..,down.. — либо удаляем, если всё пусто
    const parts: string[] = [];
    if (order.trim() !== '') parts.push(`order=${Number(order)}`);
    if (up.trim() !== '') parts.push(`up=${Number(up)}`);
    if (down.trim() !== '') parts.push(`down=${Number(down)}`);
    if (parts.length > 0) updates.startup = parts.join(',');
    else updates.delete = 'startup';

    updateConfig.mutate(updates, {
      onSuccess: () => toast.success(t('instances.autostart_saved')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Power className="h-4 w-4" />{t('instances.autostart')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={onboot}
            onChange={e => setOnboot(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span className="text-sm">{t('instances.start_on_boot')}</span>
        </label>
        <p className="text-xs text-muted-foreground -mt-2">{t('instances.start_on_boot_hint')}</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="startup-order">{t('instances.startup_order')}</Label>
            <Input id="startup-order" type="number" min={0} value={order}
              onChange={e => setOrder(e.target.value)} placeholder="any" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startup-up">{t('instances.startup_up_delay')}</Label>
            <Input id="startup-up" type="number" min={0} value={up}
              onChange={e => setUp(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startup-down">{t('instances.startup_down_timeout')}</Label>
            <Input id="startup-down" type="number" min={0} value={down}
              onChange={e => setDown(e.target.value)} placeholder="0" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('instances.startup_order_hint')}</p>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={protection}
            onChange={e => setProtection(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span className="text-sm">{t('instances.protection')}</span>
        </label>
        <p className="text-xs text-muted-foreground -mt-2">{t('instances.protection_hint')}</p>

        <Button size="sm" onClick={save} disabled={updateConfig.isPending}>
          {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Разобрать строку тегов Proxmox ("web;prod") в массив. */
function parseTags(spec: unknown): string[] {
  if (typeof spec !== 'string') return [];
  return spec.split(/[;,\s]+/).map(s => s.trim()).filter(Boolean);
}

function TagsCard({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);

  const [value, setValue] = useState<string | null>(null);
  const current = useMemo(() => parseTags(config?.tags).join(', '), [config]);
  const text = value ?? current;

  const save = () => {
    // Proxmox хранит теги через ';'; пустая строка удаляет все теги.
    const tags = parseTags(text.replace(/,/g, ';')).join(';');
    updateConfig.mutate(
      tags ? { tags } : { delete: 'tags' },
      {
        onSuccess: () => { toast.success(t('instances.tags_saved', 'Теги сохранены')); setValue(null); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />{t('instances.tags', 'Теги')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
          {parseTags(text).length === 0
            ? <span className="text-xs text-muted-foreground">{t('instances.no_tags', 'Нет тегов')}</span>
            : parseTags(text).map(tag => (
              <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{tag}</span>
            ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tags-input">{t('instances.tags_hint', 'Теги через запятую')}</Label>
            <Input id="tags-input" value={text} onChange={e => setValue(e.target.value)} placeholder="web, prod, db" />
          </div>
          <Button size="sm" onClick={save} disabled={updateConfig.isPending || text === current}>
            {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save', 'Сохранить')}
          </Button>
        </div>
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
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);
  const resizeDisk = useResizeDisk(serverId, vmid, type, node);

  const [cores, setCores] = useState('');
  const [memory, setMemory] = useState('');
  const [diskSize, setDiskSize] = useState('');
  const [diskDevice, setDiskDevice] = useState('');
  const [growResult, setGrowResult] = useState<{ grown: boolean; output: string } | null>(null);

  // Initialize from config
  const currentCores = config?.cores || 0;
  const currentMemory = config?.memory || 0;

  // Реальные дисковые устройства из конфига Proxmox (исключая cd-rom).
  // Захардкоженный scsi0 ломал ресайз на VM с другим диском (напр. sata0).
  const diskDevices = useMemo(() => {
    if (!config) return [] as string[];
    const re = /^(rootfs|mp\d+|scsi\d+|sata\d+|virtio\d+|ide\d+)$/;
    return Object.entries(config)
      .filter(([k, v]) => re.test(k) && typeof v === 'string' && !v.includes('media=cdrom'))
      .map(([k]) => k);
  }, [config]);

  // Загрузочный диск из boot=order=... — выбираем по умолчанию.
  const bootDisk = useMemo(() => {
    const order = typeof config?.boot === 'string' ? config.boot : '';
    const first = order.match(/order=([^;]+)/)?.[1]?.split(';')[0]?.trim();
    return first && diskDevices.includes(first) ? first : undefined;
  }, [config?.boot, diskDevices]);

  useEffect(() => {
    if (diskDevices.length === 0) return;
    setDiskDevice((cur) => (diskDevices.includes(cur) ? cur : bootDisk ?? diskDevices[0]));
  }, [diskDevices, bootDisk]);

  // Текущий размер выбранного диска (ГБ). Proxmox не умеет уменьшать диск,
  // поэтому показываем его и не даём ввести значение меньше текущего.
  const currentDiskGb = useMemo(
    () => (diskDevice ? parseDiskSizeGb(config?.[diskDevice]) : null),
    [config, diskDevice]
  );
  const minDiskGb = currentDiskGb != null ? Math.ceil(currentDiskGb) : 1;

  // При смене диска подставляем текущий размер как стартовое значение,
  // чтобы пользователь увеличивал его, а не угадывал.
  useEffect(() => {
    if (currentDiskGb != null) setDiskSize(String(Math.ceil(currentDiskGb)));
  }, [currentDiskGb]);

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
    if (!diskSize || !diskDevice) return;
    if (currentDiskGb != null && Number(diskSize) <= currentDiskGb) {
      toast.error(
        `Новый размер должен быть больше текущего (${currentDiskGb.toFixed(1)} ГБ). Уменьшение диска Proxmox не поддерживает.`
      );
      return;
    }
    resizeDisk.mutate(
      { disk: diskDevice, size: `${diskSize}G` },
      {
        onSuccess: (data) => {
          const res = data as { message?: string; filesystem_grown?: boolean; grow_output?: string };
          const grown = !!res?.filesystem_grown;
          setGrowResult({ grown, output: res?.grow_output ?? '' });
          if (grown) toast.success(res?.message ?? `Disk resized to ${diskSize}G`);
          else toast.warning(res?.message ?? `Диск увеличен до ${diskSize}G, но ФС не расширена`);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <OwnerCard serverId={serverId} vmid={vmid} />

      <AutostartCard serverId={serverId} vmid={vmid} type={type} node={node} />

      <TagsCard serverId={serverId} vmid={vmid} type={type} node={node} />

      {type !== 'lxc' && <ExecuteScriptCard serverId={serverId} vmid={vmid} node={node} />}

      {/* CPU & Memory */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t('instances.compute_resources')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cores">{t('instances.vcpu_cores')}</Label>
              <Input
                id="cores"
                type="number"
                min={1}
                max={128}
                placeholder={String(currentCores)}
                value={cores}
                onChange={(e) => setCores(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('instances.current_cores', { count: currentCores })}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memory">{t('instances.memory_mb')}</Label>
              <Input
                id="memory"
                type="number"
                min={128}
                step={128}
                placeholder={String(currentMemory)}
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('instances.current_memory', { count: currentMemory })}</p>
            </div>
          </div>
          <Button onClick={handleConfigUpdate} disabled={updateConfig.isPending} size="sm">
            {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('instances.apply_changes')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('instances.apply_changes_note')}
          </p>
        </CardContent>
      </Card>

      {/* Disk Resize */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('instances.disk_resize')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="disk-device">{t('instances.disk_device')}</Label>
              {diskDevices.length > 0 ? (
                <Select value={diskDevice} onValueChange={setDiskDevice}>
                  <SelectTrigger id="disk-device">
                    <SelectValue placeholder={t('common.placeholder_disk')} />
                  </SelectTrigger>
                  <SelectContent>
                    {diskDevices.map((dev) => (
                      <SelectItem key={dev} value={dev}>
                        {dev}
                        {dev === bootDisk ? ' (boot)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="disk-device"
                  value={diskDevice}
                  onChange={(e) => setDiskDevice(e.target.value)}
                  placeholder={t('common.placeholder_disk')}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disk-size">{t('instances.new_size_gb')}</Label>
              <Input
                id="disk-size"
                type="number"
                min={minDiskGb}
                value={diskSize}
                onChange={(e) => setDiskSize(e.target.value)}
                placeholder={t('common.placeholder_disk_size')}
              />
              {currentDiskGb != null && (
                <p className="text-xs text-muted-foreground">
                  Текущий размер: {currentDiskGb.toFixed(1)} ГБ
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={handleDiskResize}
            disabled={!diskSize || !diskDevice || resizeDisk.isPending}
            size="sm"
            variant="outline"
          >
            {resizeDisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('instances.resize_disk')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('instances.resize_disk_hint')}
          </p>
          {growResult && (
            <div className="space-y-1.5">
              <p className={`text-xs font-medium ${growResult.grown ? 'text-green-500' : 'text-amber-500'}`}>
                {growResult.grown
                  ? 'Файловая система расширена внутри ОС'
                  : 'Файловая система не расширена — вывод growpart ниже'}
              </p>
              {growResult.output && (
                <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs font-mono whitespace-pre-wrap">
                  {growResult.output}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SavedConfigCard serverId={serverId} vmid={vmid} />

      {/* Raw Config */}
      {config && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('instances.raw_configuration')}</CardTitle>
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
