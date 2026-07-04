import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Loader2, Power, Cpu, HardDrive, Trash2, SlidersHorizontal, LockOpen, ListOrdered, ArrowUp, ArrowDown, Cloud, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVMConfig, useUpdateConfig, useResizeDisk, useVMOwner, useSetVMOwner, useExecuteScript, useSavedConfig, useMoveDisk, useAddDisk, useDetachDisk, useUnlockInstance, useUpdateCloudInit } from '@/hooks/use-instances';
import { useLXCStorages } from '@/hooks/use-lxc-templates';
import { useProfile } from '@/hooks/use-settings';
import { useConfirm } from '@/components/shared/ConfirmDialog';
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
              <code className={r.exit_code === 0 ? 'text-success' : 'text-destructive'}>{r.exit_code ?? '—'}</code>
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

// ==================== Cloud-Init ====================

function CloudInitCard({ serverId, vmid, type, node }: { serverId: number; vmid: number; type: string; node: string }) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const update = useUpdateCloudInit(serverId, vmid, node);

  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [ipMode, setIpMode] = useState<'dhcp' | 'static' | 'none'>('dhcp');
  const [ipCidr, setIpCidr] = useState('');
  const [gateway, setGateway] = useState('');
  const [nameserver, setNameserver] = useState('');
  const [searchdomain, setSearchdomain] = useState('');
  const [sshkeys, setSshkeys] = useState('');

  // Наличие cloud-init диска (ide2/scsiN со значением *-cloudinit)
  const hasCloudInit = useMemo(() => {
    if (!config) return false;
    return Object.values(config).some(v => typeof v === 'string' && v.includes('cloudinit'));
  }, [config]);

  useEffect(() => {
    if (!config) return;
    setUser(typeof config.ciuser === 'string' ? config.ciuser : '');
    setNameserver(typeof config.nameserver === 'string' ? config.nameserver : '');
    setSearchdomain(typeof config.searchdomain === 'string' ? config.searchdomain : '');
    // sshkeys приходит URL-кодированным
    let keys = typeof config.sshkeys === 'string' ? config.sshkeys : '';
    try { keys = decodeURIComponent(keys); } catch { /* оставляем как есть */ }
    setSshkeys(keys);
    // ipconfig0
    const ip = typeof config.ipconfig0 === 'string' ? config.ipconfig0 : '';
    if (!ip) { setIpMode('none'); setIpCidr(''); setGateway(''); }
    else if (ip.includes('ip=dhcp')) { setIpMode('dhcp'); setIpCidr(''); setGateway(''); }
    else {
      setIpMode('static');
      setIpCidr(ip.match(/ip=([^,]+)/)?.[1] ?? '');
      setGateway(ip.match(/gw=([^,]+)/)?.[1] ?? '');
    }
  }, [config]);

  const save = () => {
    let ipconfig0: string | undefined;
    if (ipMode === 'dhcp') ipconfig0 = 'ip=dhcp';
    else if (ipMode === 'none') ipconfig0 = '';
    else {
      if (!ipCidr.trim()) { toast.error(t('instances.ci_ip_required')); return; }
      ipconfig0 = `ip=${ipCidr.trim()}${gateway.trim() ? `,gw=${gateway.trim()}` : ''}`;
    }
    const payload: Record<string, string> = {
      ciuser: user,
      ipconfig0,
      nameserver,
      searchdomain,
      sshkeys,
    };
    if (password) payload.cipassword = password; // пусто = не менять

    update.mutate(payload, {
      onSuccess: () => { toast.success(t('instances.ci_saved')); setPassword(''); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Cloud className="h-4 w-4" />{t('instances.cloud_init')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasCloudInit && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            {t('instances.ci_no_drive')}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('instances.cloud_user')}</Label>
            <Input value={user} onChange={e => setUser(e.target.value)} placeholder={t('common.placeholder_ubuntu')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('wizard.ci_password')}</Label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('instances.ci_password_keep')} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setShowPw(s => !s)}>
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t('instances.ci_ip_mode')}</Label>
            <Select value={ipMode} onValueChange={(v) => v && setIpMode(v as 'dhcp' | 'static' | 'none')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dhcp">DHCP</SelectItem>
                <SelectItem value="static">{t('instances.ci_static')}</SelectItem>
                <SelectItem value="none">{t('instances.ci_ip_none')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ipMode === 'static' && (
            <>
              <div className="space-y-1.5">
                <Label>{t('instances.ci_ip_cidr')}</Label>
                <Input value={ipCidr} onChange={e => setIpCidr(e.target.value)} placeholder="10.0.0.5/24" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('netif.gateway')}</Label>
                <Input value={gateway} onChange={e => setGateway(e.target.value)} placeholder="10.0.0.1" />
              </div>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>DNS ({t('instances.ci_nameserver')})</Label>
            <Input value={nameserver} onChange={e => setNameserver(e.target.value)} placeholder="1.1.1.1" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('instances.ci_searchdomain')}</Label>
            <Input value={searchdomain} onChange={e => setSearchdomain(e.target.value)} placeholder="example.com" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('wizard.ssh_keys')}</Label>
          <textarea
            value={sshkeys}
            onChange={e => setSshkeys(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={t('common.placeholder_ssh_key')}
            className="w-full rounded-md border bg-background p-2 font-mono text-xs"
          />
        </div>

        <Button size="sm" onClick={save} disabled={update.isPending}>
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('instances.ci_reboot_hint')}</p>
      </CardContent>
    </Card>
  );
}

// ==================== Boot order ====================

/** Человекочитаемая подпись загрузочного устройства по его конфигу. */
function bootDeviceLabel(dev: string, spec: unknown, t: (k: string) => string): string {
  if (dev.startsWith('net')) return `${dev} · ${t('instances.boot_network')}`;
  if (typeof spec === 'string' && spec.includes('media=cdrom')) return `${dev} · CD-ROM`;
  return `${dev} · ${t('nodes.disk')}`;
}

function BootOrderCard({ serverId, vmid, type, node }: { serverId: number; vmid: number; type: string; node: string }) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);

  // Все загрузочные устройства из конфига: диски (вкл. cdrom) + сетевые.
  const allDevices = useMemo(() => {
    if (!config) return [] as string[];
    const re = /^(scsi\d+|sata\d+|virtio\d+|ide\d+|net\d+)$/;
    return Object.entries(config)
      .filter(([k, v]) => re.test(k) && typeof v === 'string' && !v.includes('cloudinit'))
      .map(([k]) => k);
  }, [config]);

  // Текущий порядок из boot=order=dev1;dev2
  const currentOrder = useMemo(() => {
    const raw = typeof config?.boot === 'string' ? config.boot : '';
    const list = raw.match(/order=([^,]+)/)?.[1]?.split(';').map(s => s.trim()).filter(Boolean) ?? [];
    return list.filter(d => allDevices.includes(d));
  }, [config?.boot, allDevices]);

  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(currentOrder); }, [currentOrder]);

  const disabled = allDevices.filter(d => !order.includes(d));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const enable = (dev: string) => setOrder([...order, dev]);
  const disable = (dev: string) => setOrder(order.filter(d => d !== dev));

  const dirty = order.join(';') !== currentOrder.join(';');

  const save = () => {
    updateConfig.mutate(
      { boot: `order=${order.join(';')}` },
      {
        onSuccess: () => toast.success(t('instances.boot_order_saved')),
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ListOrdered className="h-4 w-4" />{t('instances.boot_order')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('instances.boot_order_hint')}</p>

        {/* Активный порядок */}
        <div className="space-y-1.5">
          {order.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('instances.boot_none_enabled')}</p>
          ) : order.map((dev, i) => (
            <div key={dev} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
              <span className="flex-1 font-mono text-xs">{bootDeviceLabel(dev, config?.[dev], t)}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => disable(dev)}>
                {t('instances.boot_disable')}
              </Button>
            </div>
          ))}
        </div>

        {/* Отключённые устройства */}
        {disabled.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-xs text-muted-foreground">{t('instances.boot_disabled')}</Label>
            {disabled.map((dev) => (
              <div key={dev} className="flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm">
                <span className="flex-1 font-mono text-xs text-muted-foreground">{bootDeviceLabel(dev, config?.[dev], t)}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => enable(dev)}>
                  {t('instances.boot_enable')}
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button size="sm" onClick={save} disabled={!dirty || updateConfig.isPending}>
          {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ==================== VM options & unlock ====================

const HOTPLUG_DEFAULT = 'network,disk,usb';

/** Простой тумблер-строка. */
function OptionToggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer py-1">
      <div>
        <span className="text-sm">{label}</span>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary" />
    </label>
  );
}

function VmOptionsCard({ serverId, vmid, type, node }: { serverId: number; vmid: number; type: string; node: string }) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);
  const unlock = useUnlockInstance(serverId, vmid, type, node);

  const [agent, setAgent] = useState(false);
  const [tablet, setTablet] = useState(true);
  const [kvm, setKvm] = useState(true);
  const [hotplug, setHotplug] = useState(true);

  useEffect(() => {
    if (!config) return;
    const agentRaw = typeof config.agent === 'string' ? config.agent : String(config.agent ?? '');
    setAgent(agentRaw.startsWith('1'));
    setTablet(config.tablet == null ? true : Number(config.tablet) === 1);
    setKvm(config.kvm == null ? true : Number(config.kvm) === 1);
    const hp = typeof config.hotplug === 'string' ? config.hotplug : '';
    setHotplug(config.hotplug == null ? true : hp !== '0' && hp !== '');
  }, [config]);

  const lock = typeof config?.lock === 'string' ? config.lock : '';

  const save = () => {
    const updates: Record<string, unknown> = {
      agent: agent ? 1 : 0,
      tablet: tablet ? 1 : 0,
      kvm: kvm ? 1 : 0,
      hotplug: hotplug ? HOTPLUG_DEFAULT : '0',
    };
    updateConfig.mutate(updates, {
      onSuccess: () => toast.success(t('instances.vm_options_saved')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const doUnlock = () => {
    unlock.mutate(undefined, {
      onSuccess: () => toast.success(t('instances.unlocked')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />{t('instances.vm_options')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <OptionToggle label={t('instances.opt_agent')} hint={t('instances.opt_agent_hint')} checked={agent} onChange={setAgent} />
        <OptionToggle label={t('instances.opt_tablet')} hint={t('instances.opt_tablet_hint')} checked={tablet} onChange={setTablet} />
        <OptionToggle label={t('instances.opt_kvm')} hint={t('instances.opt_kvm_hint')} checked={kvm} onChange={setKvm} />
        <OptionToggle label={t('instances.opt_hotplug')} hint={t('instances.opt_hotplug_hint')} checked={hotplug} onChange={setHotplug} />
        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={updateConfig.isPending}>
            {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </div>

        {/* Unlock */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <div>
            <span className="text-sm">{t('instances.unlock')}</span>
            <p className="text-xs text-muted-foreground">
              {lock ? t('instances.lock_current', { lock }) : t('instances.no_lock')}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={doUnlock} disabled={unlock.isPending}>
            {unlock.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockOpen className="mr-2 h-4 w-4" />}
            {t('instances.unlock')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== CPU options ====================

const CPU_TYPES = ['default', 'host', 'x86-64-v2', 'x86-64-v2-AES', 'x86-64-v3', 'x86-64-v4', 'kvm64', 'qemu64'];

function CpuOptionsCard({ serverId, vmid, type, node }: { serverId: number; vmid: number; type: string; node: string }) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type, node);

  const [cpuType, setCpuType] = useState('default');
  const [sockets, setSockets] = useState('');
  const [cpulimit, setCpulimit] = useState('');
  const [cpuunits, setCpuunits] = useState('');
  const [numa, setNuma] = useState(false);

  useEffect(() => {
    if (!config) return;
    // cpu из конфига может быть "host" или "cputype=host,flags=..."
    const raw = typeof config.cpu === 'string' ? config.cpu : '';
    const parsed = raw.includes('cputype=') ? (raw.match(/cputype=([^,]+)/)?.[1] ?? '') : raw;
    setCpuType(parsed && CPU_TYPES.includes(parsed) ? parsed : (parsed ? parsed : 'default'));
    setSockets(config.sockets != null ? String(config.sockets) : '');
    setCpulimit(config.cpulimit != null ? String(config.cpulimit) : '');
    setCpuunits(config.cpuunits != null ? String(config.cpuunits) : '');
    setNuma(Number(config.numa) === 1);
  }, [config]);

  const save = () => {
    const updates: Record<string, unknown> = {
      sockets: sockets ? Number(sockets) : 1,
      numa: numa ? 1 : 0,
    };
    if (cpuType && cpuType !== 'default') updates.cpu = cpuType;
    else updates.delete = 'cpu';
    // cpulimit: 0 = без лимита; cpuunits: вес планировщика
    updates.cpulimit = cpulimit ? Number(cpulimit) : 0;
    if (cpuunits) updates.cpuunits = Number(cpuunits);

    updateConfig.mutate(updates, {
      onSuccess: () => toast.success(t('instances.cpu_saved')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Cpu className="h-4 w-4" />{t('instances.cpu_options')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('instances.cpu_type')}</Label>
            <Select value={cpuType} onValueChange={(v) => v && setCpuType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CPU_TYPES.map((c) => (
                  <SelectItem key={c} value={c}>{c === 'default' ? `default (kvm64)` : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('instances.cpu_type_hint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('instances.sockets')}</Label>
            <Input type="number" min={1} max={8} value={sockets} onChange={(e) => setSockets(e.target.value)} placeholder="1" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('instances.cpulimit')}</Label>
            <Input type="number" min={0} max={128} step="0.1" value={cpulimit} onChange={(e) => setCpulimit(e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">{t('instances.cpulimit_hint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('instances.cpuunits')}</Label>
            <Input type="number" min={1} max={262144} value={cpuunits} onChange={(e) => setCpuunits(e.target.value)} placeholder="100" />
            <p className="text-xs text-muted-foreground">{t('instances.cpuunits_hint')}</p>
          </div>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={numa} onChange={(e) => setNuma(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
          <span className="text-sm">{t('instances.numa')}</span>
        </label>
        <Button size="sm" onClick={save} disabled={updateConfig.isPending}>
          {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('instances.apply_changes_note')}</p>
      </CardContent>
    </Card>
  );
}

// ==================== Disk management (move / add / detach) ====================

/** Достать имя хранилища из спецификации диска ("local-lvm:vm-100-disk-0,size=32G"). */
function parseDiskStorage(spec: unknown): string | null {
  if (typeof spec !== 'string') return null;
  return spec.split(':', 1)[0] || null;
}

/** Следующее свободное имя устройства для заданной шины (scsi/virtio/sata). */
function nextFreeDevice(bus: string, existing: string[]): string {
  for (let i = 0; i < 31; i++) {
    const name = `${bus}${i}`;
    if (!existing.includes(name)) return name;
  }
  return `${bus}0`;
}

function DiskManagementCard({ serverId, vmid, type, node }: { serverId: number; vmid: number; type: string; node: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const { data: storages = [] } = useLXCStorages(serverId, node);
  const moveDisk = useMoveDisk(serverId, vmid, node);
  const addDisk = useAddDisk(serverId, vmid, node);
  const detachDisk = useDetachDisk(serverId, vmid, node);

  // Реальные дисковые устройства (без cd-rom и cloudinit)
  const disks = useMemo(() => {
    if (!config) return [] as string[];
    const re = /^(scsi\d+|sata\d+|virtio\d+|ide\d+)$/;
    return Object.entries(config)
      .filter(([k, v]) => re.test(k) && typeof v === 'string'
        && !v.includes('media=cdrom') && !v.includes('cloudinit'))
      .map(([k]) => k);
  }, [config]);

  const [moveDiskDev, setMoveDiskDev] = useState('');
  const [moveStorage, setMoveStorage] = useState('');
  const [moveDelete, setMoveDelete] = useState(true);

  const [addBus, setAddBus] = useState('scsi');
  const [addStorage, setAddStorage] = useState('');
  const [addSize, setAddSize] = useState('16');
  const [addSsd, setAddSsd] = useState(false);
  const [addDiscard, setAddDiscard] = useState(false);

  useEffect(() => {
    if (disks.length && !disks.includes(moveDiskDev)) setMoveDiskDev(disks[0]);
  }, [disks, moveDiskDev]);

  const doMove = () => {
    if (!moveDiskDev || !moveStorage) return;
    moveDisk.mutate(
      { disk: moveDiskDev, target_storage: moveStorage, delete: moveDelete },
      {
        onSuccess: () => { toast.success(t('instances.disk_moved')); setMoveStorage(''); },
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  const doAdd = () => {
    if (!addStorage || !addSize) return;
    const dev = nextFreeDevice(addBus, disks);
    addDisk.mutate(
      { disk: dev, storage: addStorage, size_gb: Number(addSize), ssd: addSsd, discard: addDiscard },
      {
        onSuccess: () => { toast.success(t('instances.disk_added', { dev })); },
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  const doDetach = async (dev: string) => {
    const destroy = await confirm(t('instances.disk_detach_confirm', { dev }));
    if (!destroy) return;
    detachDisk.mutate(
      { disk: dev, destroy: true },
      {
        onSuccess: () => toast.success(t('instances.disk_detached')),
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4" />{t('instances.disk_management')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Список дисков */}
        <div className="space-y-1.5">
          {disks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('instances.no_disks')}</p>
          ) : disks.map((d) => (
            <div key={d} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <span className="font-mono">{d}</span>
              <span className="text-xs text-muted-foreground">{parseDiskStorage(config?.[d]) ?? '—'}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title={t('common.delete')} onClick={() => doDetach(d)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Move disk */}
        <div className="space-y-2 border-t pt-3">
          <Label className="text-xs font-medium">{t('instances.disk_move')}</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={moveDiskDev} onValueChange={(v) => v && setMoveDiskDev(v)}>
              <SelectTrigger><SelectValue placeholder={t('instances.disk_device')} /></SelectTrigger>
              <SelectContent>{disks.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={moveStorage} onValueChange={(v) => v && setMoveStorage(v)}>
              <SelectTrigger><SelectValue placeholder={t('instances.migrate_target_storage')} /></SelectTrigger>
              <SelectContent>{storages.map((s) => <SelectItem key={s.storage} value={s.storage}>{s.storage} ({s.type})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={moveDelete} onChange={(e) => setMoveDelete(e.target.checked)} />
            <span>{t('instances.disk_move_delete')}</span>
          </label>
          <Button size="sm" variant="outline" onClick={doMove} disabled={!moveStorage || moveDisk.isPending}>
            {moveDisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('instances.disk_move')}
          </Button>
        </div>

        {/* Add disk */}
        <div className="space-y-2 border-t pt-3">
          <Label className="text-xs font-medium">{t('instances.disk_add')}</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label className="text-2xs">{t('instances.disk_bus')}</Label>
              <Select value={addBus} onValueChange={(v) => v && setAddBus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scsi">scsi</SelectItem>
                  <SelectItem value="virtio">virtio</SelectItem>
                  <SelectItem value="sata">sata</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-2xs">{t('instances.migrate_target_storage')}</Label>
              <Select value={addStorage} onValueChange={(v) => v && setAddStorage(v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{storages.map((s) => <SelectItem key={s.storage} value={s.storage}>{s.storage}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-2xs">{t('instances.new_size_gb')}</Label>
              <Input type="number" min={1} value={addSize} onChange={(e) => setAddSize(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={addSsd} onChange={(e) => setAddSsd(e.target.checked)} /><span>SSD</span></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={addDiscard} onChange={(e) => setAddDiscard(e.target.checked)} /><span>Discard</span></label>
          </div>
          <Button size="sm" variant="outline" onClick={doAdd} disabled={!addStorage || !addSize || addDisk.isPending}>
            {addDisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('instances.disk_add')}
          </Button>
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

      {type !== 'lxc' && <CloudInitCard serverId={serverId} vmid={vmid} type={type} node={node} />}

      {type !== 'lxc' && <BootOrderCard serverId={serverId} vmid={vmid} type={type} node={node} />}

      {type !== 'lxc' && <VmOptionsCard serverId={serverId} vmid={vmid} type={type} node={node} />}

      {type !== 'lxc' && <CpuOptionsCard serverId={serverId} vmid={vmid} type={type} node={node} />}

      {type !== 'lxc' && <DiskManagementCard serverId={serverId} vmid={vmid} type={type} node={node} />}

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
                <Select value={diskDevice} onValueChange={(v) => setDiskDevice(v ?? "")}>
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
              <p className={`text-xs font-medium ${growResult.grown ? 'text-success' : 'text-warning'}`}>
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
