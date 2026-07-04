import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Disc, Eye, EyeOff, Sparkles, Copy, KeyRound, FileText, Terminal as TerminalIcon, Play, Square, RotateCcw, Power, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCloneInstance,
  useMigrateInstance,
  useVMStatus,
  useReinstallInstance,
  useChangePassword,
  useUpdateNotes,
  useExecuteCommand,
  useNodeIsos,
  useAttachIso,
  useDetachIso,
  useVMConfig,
} from '@/hooks/use-instances';
import { useNodes } from '@/hooks/use-nodes';
import { useLXCStorages } from '@/hooks/use-lxc-templates';
import { useUsers } from '@/hooks/use-users';
import { useProfile } from '@/hooks/use-settings';
import { toast } from 'sonner';
import { useDeployTasksStore } from '@/stores/deploy-tasks-store';

export type PowerAction = 'start' | 'stop' | 'restart' | 'shutdown';

export type InstanceAction =
  | 'clone'
  | 'migrate'
  | 'reinstall'
  | 'change-password'
  | 'notes'
  | 'execute'
  | 'iso'
  | null;

interface Props {
  open: InstanceAction;
  onOpenChange: (open: InstanceAction) => void;
  serverId: number;
  vmid: number;
  type: string; // 'qemu' | 'lxc'
  node: string;
  name?: string;
  description?: string;
}

export default function InstanceActionDialogs(props: Props) {
  const { open, onOpenChange, serverId, vmid, type, node, name, description } = props;
  const close = () => onOpenChange(null);
  const shared = { serverId, vmid, type, node, name, description };

  return (
    <>
      <CloneDialog open={open === 'clone'} onClose={close} {...shared} />
      <MigrateDialog open={open === 'migrate'} onClose={close} {...shared} />
      <ReinstallDialog open={open === 'reinstall'} onClose={close} {...shared} />
      <ChangePasswordDialog open={open === 'change-password'} onClose={close} {...shared} />
      <NotesDialog open={open === 'notes'} onClose={close} {...shared} />
      <ExecuteCommandDialog open={open === 'execute'} onClose={close} {...shared} />
      <IsoDialog open={open === 'iso'} onClose={close} {...shared} />
    </>
  );
}

// ==================== Clone ====================

const CLONE_AUTO = '__auto__';

function CloneDialog({ open, onClose, serverId, vmid, type, node, name }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const [newName, setNewName] = useState('');
  const [full, setFull] = useState(true);
  const [targetNode, setTargetNode] = useState('');
  const [targetStorage, setTargetStorage] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const clone = useCloneInstance(serverId, vmid, type, node);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  const { data: profile } = useProfile();
  const isAdmin = !!profile?.is_admin;
  const { data: allUsers = [] } = useUsers();
  const { data: nodesResp } = useNodes(serverId);
  const nodes = nodesResp?.nodes ?? [];
  const effectiveNode = targetNode || node;
  const { data: storages = [] } = useLXCStorages(serverId, effectiveNode);

  // Reset form whenever the dialog is opened for a fresh instance.
  useEffect(() => {
    if (open) {
      setNewName('');
      setFull(true);
      setTargetNode('');
      setTargetStorage('');
      setDescription('');
      setOwnerId(null);
    }
  }, [open]);

  const submit = () => {
    if (!newName.trim()) return;
    clone.mutate(
      {
        new_name: newName.trim(),
        full,
        target_node: targetNode || undefined,
        target_storage: targetStorage || undefined,
        description: description.trim() || undefined,
        owner_id: isAdmin && ownerId ? ownerId : undefined,
      },
      {
        onSuccess: (data) => {
          addDeployTask({
            id: data.task_id,
            name: data.name,
            status: 'pending',
            step: 'В очереди...',
            progress: 0,
            vmid: null,
            node: targetNode || node,
            error_message: null,
            kind: 'clone',
            server_id: serverId,
          });
          toast.success('Клонирование запущено в фоне');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy className="h-4 w-4" /> Клонировать</DialogTitle>
          <DialogDescription>Создать копию <strong>{name ?? `#${vmid}`}</strong></DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clone-name">Имя новой инстанции</Label>
            <Input id="clone-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`${name || 'instance'}-clone`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Целевой узел</Label>
              <Select value={targetNode || CLONE_AUTO} onValueChange={(v) => { setTargetNode(v && v !== CLONE_AUTO ? v : ''); setTargetStorage(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLONE_AUTO}>Тот же узел ({node})</SelectItem>
                  {nodes.filter((n) => n.node !== node).map((n) => (
                    <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Хранилище</Label>
              <Select value={targetStorage || CLONE_AUTO} onValueChange={(v) => setTargetStorage(v && v !== CLONE_AUTO ? v : '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLONE_AUTO}>Как у источника</SelectItem>
                  {storages.map((s) => (
                    <SelectItem key={s.storage} value={s.storage}>{s.storage} ({s.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Владелец</Label>
              <Select value={ownerId ? String(ownerId) : CLONE_AUTO} onValueChange={(v) => setOwnerId(v === CLONE_AUTO ? null : Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLONE_AUTO}>Я ({profile?.username})</SelectItem>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.username}{u.full_name ? ` (${u.full_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="clone-desc">Описание <span className="text-muted-foreground">(необязательно)</span></Label>
            <Input id="clone-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Заметка для новой инстанции" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
            <span>Полный клон (full clone)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={!newName.trim() || clone.isPending}>
            {clone.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Клонировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Migrate ====================

const MIGRATE_SAME_STORAGE = '__same__';

function MigrateDialog({ open, onClose, serverId, vmid, type, node, name }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [targetNode, setTargetNode] = useState('');
  const [targetStorage, setTargetStorage] = useState('');
  const [online, setOnline] = useState(false);
  const migrate = useMigrateInstance(serverId, vmid, type, node);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  const { data: nodesResp } = useNodes(serverId);
  const nodes = (nodesResp?.nodes ?? []).filter((n) => n.node !== node);
  const { data: status } = useVMStatus(serverId, vmid, type, node, open);
  const isRunning = status?.status === 'running';
  const { data: storages = [] } = useLXCStorages(serverId, targetNode || node);

  // Сброс формы при открытии; online по умолчанию = инстанс запущен.
  useEffect(() => {
    if (open) {
      setTargetNode('');
      setTargetStorage('');
      setOnline(isRunning);
    }
  }, [open, isRunning]);

  const submit = () => {
    if (!targetNode) return;
    migrate.mutate(
      {
        target_node: targetNode,
        target_storage: targetStorage || undefined,
        online,
      },
      {
        onSuccess: (data) => {
          addDeployTask({
            id: data.task_id,
            name: data.name,
            status: 'pending',
            step: 'В очереди...',
            progress: 0,
            vmid,
            node: targetNode,
            error_message: null,
            kind: 'migrate',
            server_id: serverId,
          });
          toast.success(t('instances.migrate_started'));
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> {t('instances.migrate')}</DialogTitle>
          <DialogDescription>{t('instances.migrate_desc')} <strong>{name ?? `#${vmid}`}</strong> ({node})</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('instances.migrate_target_node')}</Label>
            <Select value={targetNode} onValueChange={(v) => { if (v) { setTargetNode(v); setTargetStorage(''); } }}>
              <SelectTrigger><SelectValue placeholder={t('instances.migrate_select_node')} /></SelectTrigger>
              <SelectContent>
                {nodes.map((n) => (
                  <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {nodes.length === 0 && (
              <p className="text-xs text-warning">{t('instances.migrate_no_targets')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('instances.migrate_target_storage')}</Label>
            <Select value={targetStorage || MIGRATE_SAME_STORAGE} onValueChange={(v) => setTargetStorage(!v || v === MIGRATE_SAME_STORAGE ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MIGRATE_SAME_STORAGE}>{t('instances.migrate_same_storage')}</SelectItem>
                {storages.map((s) => (
                  <SelectItem key={s.storage} value={s.storage}>{s.storage} ({s.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
            <span className="text-sm">{t('instances.migrate_online')}</span>
          </label>
          <p className="text-xs text-muted-foreground -mt-2">
            {isRunning ? t('instances.migrate_online_hint_running') : t('instances.migrate_online_hint_stopped')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={!targetNode || migrate.isPending}>
            {migrate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('instances.migrate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Reinstall ====================

function ReinstallDialog({ open, onClose, serverId, vmid, node, name, type }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const [confirm, setConfirm] = useState('');
  const reinstall = useReinstallInstance(serverId, vmid, node);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);
  const expected = name || String(vmid);

  // Reinstall via this endpoint currently supports only saved-template instances.
  const submit = () => {
    if (confirm !== expected) return;
    reinstall.mutate(undefined, {
      onSuccess: (data) => {
        addDeployTask({
          id: data.task_id,
          name: data.name || expected,
          status: 'pending',
          step: 'В очереди...',
          progress: 0,
          vmid,
          node,
          error_message: null,
          kind: 'reinstall',
          server_id: serverId,
        });
        toast.success('Переустановка запущена в фоне');
        setConfirm('');
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Переустановить</DialogTitle>
          <DialogDescription>
            Это пересоздаст инстанс <strong>{expected}</strong> из исходного шаблона. Все данные будут утеряны.
            {type === 'lxc' && (
              <span className="mt-2 block text-warning">Поддержка LXC — экспериментальная.</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Введите <strong className="text-foreground">{expected}</strong> для подтверждения</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={expected} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button variant="destructive" onClick={submit} disabled={confirm !== expected || reinstall.isPending}>
            {reinstall.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Переустановить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Change Password ====================

function ChangePasswordDialog({ open, onClose, serverId, vmid, type, node, name }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const mut = useChangePassword(serverId, vmid, type, node);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  const submit = () => {
    if (!password || password.length < 4) {
      toast.error('Password must be at least 4 chars');
      return;
    }
    mut.mutate(
      { username, password },
      {
        onSuccess: (data) => {
          addDeployTask({
            id: data.task_id,
            name: data.name || (name || `#${vmid}`),
            status: 'pending',
            step: 'В очереди...',
            progress: 0,
            vmid,
            node,
            error_message: null,
            kind: 'change_password',
            server_id: serverId,
          });
          toast.success('Смена пароля запущена в фоне');
          setPassword('');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Изменить пароль</DialogTitle>
          <DialogDescription>
            {type === 'qemu'
              ? 'Требуется установленный qemu-guest-agent внутри VM.'
              : 'Контейнер должен быть запущен.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Пользователь</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('common.placeholder_root')} />
          </div>
          <div>
            <Label>Новый пароль</Label>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7"
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={!password || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Изменить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Notes ====================

function NotesDialog({ open, onClose, serverId, vmid, type, node, description }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const config = useVMConfig(serverId, vmid, type, node, open);
  const remote = (config.data?.description as string | undefined) ?? description ?? '';
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  // Sync remote → local when dialog opens or config loads, unless user typed
  useEffect(() => {
    if (open && !touched) setValue(remote);
    if (!open) setTouched(false);
  }, [open, remote, touched]);

  const mut = useUpdateNotes(serverId, vmid, type, node);

  const submit = () => {
    mut.mutate(
      { description: value },
      {
        onSuccess: () => {
          toast.success('Notes saved');
          setTouched(false);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Примечание</DialogTitle>
          <DialogDescription>Свободный текст / markdown, видимый в Proxmox UI.</DialogDescription>
        </DialogHeader>
        <textarea
          value={value}
          onChange={(e) => { setTouched(true); setValue(e.target.value); }}
          rows={8}
          className="min-h-32 w-full rounded-md border bg-background p-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
          placeholder="Описание / заметки об инстансе..."
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Execute Command ====================

function ExecuteCommandDialog({ open, onClose, serverId, vmid, node, type }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [command, setCommand] = useState('');
  const [timeout, setTimeoutVal] = useState(30);
  const exec = useExecuteCommand(serverId, vmid);
  const result = exec.data;

  const submit = () => {
    if (!command.trim()) return;
    exec.mutate({ node, command, timeout });
  };

  if (type !== 'qemu') {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Запуск команд недоступен</DialogTitle>
            <DialogDescription>Поддержка через qemu-guest-agent — только для KVM (qemu) инстансов.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TerminalIcon className="h-4 w-4" /> Запуск команды (qemu-agent)</DialogTitle>
          <DialogDescription>Команда выполняется внутри VM через guest-agent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <Label>Команда</Label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('common.placeholder_command')}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              />
            </div>
            <div>
              <Label>Таймаут (с)</Label>
              <Input
                type="number"
                min={1}
                max={300}
                value={timeout}
                onChange={(e) => setTimeoutVal(Number(e.target.value) || 30)}
              />
            </div>
          </div>
          {result && (
            <div className="space-y-2">
              <div className="text-xs">
                exit_code: <span className={result.exit_code === 0 ? 'text-success' : 'text-danger'}>{result.exit_code}</span>
              </div>
              {result.stdout && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">stdout</p>
                  <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs font-mono">{result.stdout}</pre>
                </div>
              )}
              {result.stderr && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">stderr</p>
                  <pre className="max-h-32 overflow-auto rounded-md bg-danger/10 p-2 text-xs font-mono text-danger">{result.stderr}</pre>
                </div>
              )}
              {result.error && <p className="text-xs text-danger">{result.error}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрыть</Button>
          <Button onClick={submit} disabled={!command.trim() || exec.isPending}>
            {exec.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Выполнить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== ISO mount/unmount ====================

function IsoDialog({ open, onClose, serverId, vmid, node, type }: Omit<Props, 'open' | 'onOpenChange'> & { open: boolean; onClose: () => void }) {
  const [device, setDevice] = useState('ide2');
  const [volid, setVolid] = useState<string>('');
  const isQemu = type === 'qemu';
  const isos = useNodeIsos(serverId, node, open && isQemu);
  const config = useVMConfig(serverId, vmid, type, node, open && isQemu);
  const attach = useAttachIso(serverId, vmid, node);
  const detach = useDetachIso(serverId, vmid, node);

  const currentIso = useMemo(() => {
    const v = config.data?.[device];
    if (typeof v !== 'string') return null;
    if (v.startsWith('none')) return null;
    return v;
  }, [config.data, device]);

  if (!isQemu) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ISO недоступно для LXC</DialogTitle>
            <DialogDescription>Подключение ISO-образов поддерживается только для KVM (qemu) виртуальных машин.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Disc className="h-4 w-4" /> ISO образ</DialogTitle>
          <DialogDescription>Подключите ISO к виртуальному CD-ROM устройству.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Устройство</Label>
              <Select value={device} onValueChange={(v) => v && setDevice(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ide0">ide0</SelectItem>
                  <SelectItem value="ide1">ide1</SelectItem>
                  <SelectItem value="ide2">ide2</SelectItem>
                  <SelectItem value="ide3">ide3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground self-end">
              Сейчас: <span className="font-mono">{currentIso || 'пусто'}</span>
            </div>
          </div>
          <div>
            <Label>Образ</Label>
            <Select value={volid} onValueChange={(v) => v && setVolid(v)}>
              <SelectTrigger>
                <SelectValue placeholder={isos.isLoading ? 'Загрузка...' : 'Выберите ISO'} />
              </SelectTrigger>
              <SelectContent>
                {(isos.data?.isos || []).map((iso) => (
                  <SelectItem key={iso.volid} value={iso.volid}>{iso.name || iso.volid}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isos.data?.isos?.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">На ноде нет загруженных ISO образов.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => detach.mutate({ device }, {
              onSuccess: () => { toast.success('ISO отключён'); onClose(); },
              onError: (e) => toast.error(e.message),
            })}
            disabled={detach.isPending || !currentIso}
          >
            {detach.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Отключить
          </Button>
          <Button
            onClick={() => attach.mutate({ volid, device }, {
              onSuccess: () => { toast.success('ISO подключён'); onClose(); },
              onError: (e) => toast.error(e.message),
            })}
            disabled={!volid || attach.isPending}
          >
            {attach.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Подключить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Power Confirm ====================

type ActionConfig = {
  icon: React.ReactNode;
  title: string;
  description: string;
  btnLabel: string;
  btnVariant: 'default' | 'outline' | 'destructive';
  btnClass: string;
};

const POWER_ACTION_CONFIG: Record<PowerAction, ActionConfig> = {
  start: {
    icon: <Play className="h-4 w-4 text-success" />,
    title: 'Запустить',
    description: 'Запустить инстанс',
    btnLabel: 'Запустить',
    btnVariant: 'default',
    btnClass: 'bg-success text-success-foreground hover:bg-success/90 border-0',
  },
  restart: {
    icon: <RotateCcw className="h-4 w-4 text-warning" />,
    title: 'Перезапустить',
    description: 'Перезапустить инстанс',
    btnLabel: 'Перезапустить',
    btnVariant: 'outline',
    btnClass: 'border-warning text-warning hover:bg-warning/10',
  },
  shutdown: {
    icon: <Power className="h-4 w-4 text-orange-500" />,
    title: 'Выключить',
    description: 'Мягко выключить инстанс (ACPI shutdown)',
    btnLabel: 'Выключить',
    btnVariant: 'outline',
    btnClass: 'border-orange-500 text-orange-500 hover:bg-orange-500/10',
  },
  stop: {
    icon: <Square className="h-4 w-4" />,
    title: 'Остановить',
    description: 'Принудительно остановить инстанс. Несохранённые данные могут быть утеряны',
    btnLabel: 'Остановить',
    btnVariant: 'destructive',
    btnClass: '',
  },
};

export function PowerConfirmDialog({
  open,
  onClose,
  onConfirm,
  action,
  vmName,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  action: PowerAction | null;
  vmName?: string;
  isPending?: boolean;
}) {
  if (!action) return null;
  const cfg = POWER_ACTION_CONFIG[action];
  const displayName = vmName ? `«${vmName}»` : 'выбранный инстанс';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cfg.icon}
            {cfg.title}
          </DialogTitle>
          <DialogDescription>
            {cfg.description} {displayName}?
            {action === 'stop' && (
              <span className="mt-2 flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Это аналог «выдернуть кабель из розетки».
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
          <Button
            variant={cfg.btnVariant}
            className={cfg.btnClass || undefined}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cfg.btnLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
