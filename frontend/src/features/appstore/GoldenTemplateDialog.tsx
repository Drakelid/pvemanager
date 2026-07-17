import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, HardDriveDownload, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DialogMinimizeButton } from '@/components/shared/MinimizableDialog';
import { useMinimizedOpsStore, goldenOpKey } from '@/stores/minimized-ops-store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useServers, useNodes } from '@/hooks/use-nodes';
import { useBuildGoldenTemplate, useGoldenTemplateStatus } from '@/hooks/use-appstore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Предвыбор сервера при возврате из глобальной плашки (openGolden в
  // navigation state) — чтобы диалог сразу показал прогресс нужной сборки.
  initialServerId?: number | null;
}

export default function GoldenTemplateDialog({ open, onOpenChange, initialServerId }: Props) {
  const { t } = useTranslation();
  const { data: servers = [] } = useServers();

  const [serverId, setServerId] = useState('');
  const [node, setNode] = useState('');

  // Возврат из глобальной плашки: предвыбираем сервер сборки.
  useEffect(() => {
    if (open && initialServerId && !serverId) setServerId(String(initialServerId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialServerId]);
  const [templateStorage, setTemplateStorage] = useState('local');
  const [rootfsStorage, setRootfsStorage] = useState('local-lvm');
  const [force, setForce] = useState(false);

  const serverIdNum = serverId ? Number(serverId) : 0;
  const { data: nodesData } = useNodes(serverIdNum || 0);
  const nodes = nodesData?.nodes ?? [];

  const build = useBuildGoldenTemplate();

  // Шаблон — файл на storage конкретного сервера, поэтому статус запрашиваем
  // именно по выбранному serverId (иначе покажем шаблон/прогресс другого сервера).
  // Пока операция выполняется — опрашиваем статус каждые 2с для прогресса.
  const { data: status } = useGoldenTemplateStatus(serverIdNum || undefined, open ? 2000 : 0);
  const op = status?.last_operation ?? null;
  const running = op?.status === 'running';
  const lastStep = op?.steps_log?.length ? op.steps_log[op.steps_log.length - 1].step : null;

  const configured = status?.configured_template ?? null;

  const canSubmit = useMemo(
    () => !!serverIdNum && !!templateStorage && !!rootfsStorage && !running && !build.isPending,
    [serverIdNum, templateStorage, rootfsStorage, running, build.isPending],
  );

  const handleBuild = () => {
    if (!serverIdNum) {
      toast.error(t('appstore.golden.pick_server', 'Выберите сервер Proxmox'));
      return;
    }
    build.mutate(
      {
        server_id: serverIdNum,
        node: node || undefined,
        template_storage: templateStorage,
        rootfs_storage: rootfsStorage,
        force,
      },
      {
        onSuccess: () => toast.success(t('appstore.golden.started', 'Сборка шаблона запущена')),
        onError: (e) => toast.error((e as Error).message || t('appstore.golden.failed', 'Не удалось запустить сборку')),
      },
    );
  };

  // Сворачивание — через глобальный стор: «Свернуть» добавляет сборку в
  // MinimizedOpsTray (AppLayout) и закрывает диалог; плашка переживает
  // навигацию, разворачивание — клик по плашке (openGolden в navigation state).
  const addMinimized = useMinimizedOpsStore((s) => s.add);
  const removeMinimized = useMinimizedOpsStore((s) => s.remove);
  // true во время закрытия по «Свернуть» — чтобы handleOpenChange не снял плашку.
  const minimizingRef = useRef(false);

  const minimize = () => {
    if (!serverIdNum) return;  // без сервера нечего отслеживать
    addMinimized({
      key: goldenOpKey(serverIdNum),
      kind: 'golden-template',
      title: t('appstore.golden.title', 'Золотой LXC-шаблон'),
      serverId: serverIdNum,
    });
    minimizingRef.current = true;
    handleOpenChange(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      if (!minimizingRef.current && serverIdNum) removeMinimized(goldenOpKey(serverIdNum));
      minimizingRef.current = false;
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        {!!serverIdNum && (
          <DialogMinimizeButton onClick={minimize} title={t('appstore.minimize')} />
        )}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDriveDownload className="h-5 w-5 text-primary" />
            {t('appstore.golden.title', 'Золотой LXC-шаблон')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('appstore.golden.desc',
              'Автоматическая сборка golden-шаблона (Debian 12 + Docker + Compose) на выбранной ноде. Из него App Store клонирует контейнеры приложений.')}
          </p>

          {/* Текущий шаблон — привязан к выбранному серверу (vztmpl лежит на его storage) */}
          {serverIdNum ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">{t('appstore.golden.current', 'Текущий шаблон')}: </span>
              {configured
                ? <code className="break-all">{configured}</code>
                : <span className="text-amber-600">{t('appstore.golden.none', 'не настроен для этого сервера')}</span>}
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t('appstore.golden.pick_server_hint', 'Выберите сервер, чтобы увидеть его текущий шаблон')}
            </div>
          )}

          {/* Сервер */}
          <div className="space-y-1.5">
            <Label>{t('appstore.golden.server', 'Сервер Proxmox')}</Label>
            <Select value={serverId} onValueChange={(v) => { setServerId(v ?? ''); setNode(''); }}>
              <SelectTrigger><SelectValue placeholder={t('appstore.golden.pick_server', 'Выберите сервер')} /></SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Нода / хранилища */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('appstore.node', 'Нода')}</Label>
              <Select value={node || '__auto__'} onValueChange={(v) => setNode(v && v !== '__auto__' ? v : '')} disabled={!serverIdNum}>
                <SelectTrigger><SelectValue placeholder={t('wizard.auto_select', 'Авто')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">{t('wizard.auto_select', 'Авто')}</SelectItem>
                  {nodes.map((n) => (
                    <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('appstore.golden.template_storage', 'Хранилище шаблона')}</Label>
              <Input value={templateStorage} onChange={(e) => setTemplateStorage(e.target.value)} placeholder="local" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('appstore.golden.rootfs_storage', 'Хранилище rootfs')}</Label>
              <Input value={rootfsStorage} onChange={(e) => setRootfsStorage(e.target.value)} placeholder="local-lvm" />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />
              {t('appstore.golden.force', 'Пересобрать')}
            </label>
          </div>

          {/* Прогресс */}
          {op && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                {running && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {op.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {op.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                <span className="truncate text-muted-foreground">
                  {op.status === 'failed'
                    ? (op.error_text || t('appstore.golden.failed', 'Ошибка сборки'))
                    : (lastStep || t('appstore.golden.working', 'Выполняется...'))}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${op.status === 'failed' ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${op.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.close', 'Закрыть')}
          </Button>
          <Button onClick={handleBuild} disabled={!canSubmit}>
            {(build.isPending || running)
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <HardDriveDownload className="mr-2 h-4 w-4" />}
            {t('appstore.golden.build', 'Собрать шаблон')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
