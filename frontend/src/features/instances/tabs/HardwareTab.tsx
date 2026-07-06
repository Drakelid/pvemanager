import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Usb, HardDrive, Plus, Trash2, MemoryStick, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useVMConfig, useUpdateConfig, useVMStatus } from '@/hooks/use-instances';
import { useImageStorages } from '@/hooks/use-image-catalog';
import { toast } from 'sonner';
import AddPciDeviceDialog from '../AddPciDeviceDialog';
import AddUsbDeviceDialog from '../AddUsbDeviceDialog';
import AddPhysicalDiskDialog from '../AddPhysicalDiskDialog';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

const BIOS_OPTIONS = [
  { value: 'seabios', label: 'SeaBIOS (default)' },
  { value: 'ovmf', label: 'OVMF (UEFI)' },
];
const MACHINE_OPTIONS = [
  { value: 'pc', label: 'Default (i440fx)' },
  { value: 'q35', label: 'q35' },
];
const VGA_OPTIONS = ['std', 'qxl', 'virtio', 'vmware', 'serial0', 'none'];
const SCSIHW_OPTIONS = [
  'virtio-scsi-single',
  'virtio-scsi-pci',
  'lsi',
  'lsi53c810',
  'megasas',
  'pvscsi',
];

/** Нормализуем machine из конфига (напр. "pc-q35-8.1") к значению селекта. */
function machineToOption(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s.includes('q35')) return 'q35';
  return 'pc';
}

function PlatformCard({
  serverId, vmid, node, config,
}: Props & { config?: Record<string, unknown> }) {
  const { t } = useTranslation();
  const updateConfig = useUpdateConfig(serverId, vmid, 'qemu', node);

  const [bios, setBios] = useState('seabios');
  const [machine, setMachine] = useState('pc');
  const [vga, setVga] = useState('std');
  const [scsihw, setScsihw] = useState('virtio-scsi-single');
  const [sockets, setSockets] = useState('');
  const [efiStorage, setEfiStorage] = useState('');

  const hasEfiDisk = !!config?.efidisk0;
  // EFI-диск нужно создать, только если переключаемся на OVMF и его ещё нет.
  const needsEfiDisk = bios === 'ovmf' && !hasEfiDisk;

  // Хранилища ноды, поддерживающие образы дисков (content=images) — для efidisk0.
  const { data: storages, isLoading: storagesLoading } = useImageStorages(
    serverId, node, needsEfiDisk ? 'images' : undefined,
  );

  useEffect(() => {
    if (!config) return;
    setBios(typeof config.bios === 'string' ? config.bios : 'seabios');
    setMachine(machineToOption(config.machine));
    setVga(typeof config.vga === 'string' ? String(config.vga).split(',')[0] : 'std');
    setScsihw(typeof config.scsihw === 'string' ? config.scsihw : 'virtio-scsi-single');
    setSockets(config.sockets != null ? String(config.sockets) : '');
  }, [config]);

  const save = () => {
    if (needsEfiDisk && !efiStorage) {
      toast.error(t('hw.err_efi_storage', 'Выберите хранилище для EFI-диска'));
      return;
    }
    const updates: Record<string, unknown> = { bios, machine, vga, scsihw };
    if (sockets.trim() !== '') updates.sockets = Number(sockets);
    // При переходе на OVMF без существующего EFI-диска создаём efidisk0.
    // Формат как в web-интерфейсе PVE: <storage>:1,efitype=4m,pre-enrolled-keys=1
    if (needsEfiDisk) {
      updates.efidisk0 = `${efiStorage}:1,efitype=4m,pre-enrolled-keys=1`;
    }
    updateConfig.mutate(updates, {
      onSuccess: () => {
        toast.success(t('hw.platform_saved', 'Оборудование обновлено'));
        setEfiStorage('');
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MemoryStick className="h-4 w-4" />
          {t('hw.platform', 'Платформа')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('hw.bios', 'BIOS')}</Label>
            <Select value={bios} onValueChange={(v) => setBios(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIOS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('hw.machine', 'Тип платформы')}</Label>
            <Select value={machine} onValueChange={(v) => setMachine(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MACHINE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('hw.vga', 'Дисплей (VGA)')}</Label>
            <Select value={vga} onValueChange={(v) => setVga(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VGA_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('hw.scsihw', 'SCSI-контроллер')}</Label>
            <Select value={scsihw} onValueChange={(v) => setScsihw(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCSIHW_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hw-sockets">{t('hw.sockets', 'CPU-сокеты')}</Label>
            <Input id="hw-sockets" type="number" min={1} max={4} value={sockets}
              onChange={(e) => setSockets(e.target.value)} placeholder="1" />
          </div>
        </div>

        {/* EFI-диск: обязателен для OVMF, показываем выбор хранилища */}
        {needsEfiDisk && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" />
              {t('hw.efi_required_title', 'Для OVMF (UEFI) нужен EFI-диск')}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('hw.efi_required_hint', 'EFI-диск будет создан автоматически. Выберите хранилище для него.')}
            </p>
            <div className="space-y-1.5">
              <Label>{t('hw.efi_storage', 'Хранилище EFI-диска')}</Label>
              <Select value={efiStorage} onValueChange={(v) => setEfiStorage(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    storagesLoading
                      ? t('common.loading', 'Загрузка…')
                      : t('hw.select_storage', 'Выберите хранилище')
                  } />
                </SelectTrigger>
                <SelectContent>
                  {(storages ?? []).map((s) => (
                    <SelectItem key={s.storage} value={s.storage}>{s.storage}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Button size="sm" onClick={save} disabled={updateConfig.isPending}>
          {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save', 'Сохранить')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t('hw.platform_hint', 'Изменения оборудования применяются после выключения и повторного запуска VM.')}
        </p>
      </CardContent>
    </Card>
  );
}

export default function HardwareTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const { data: status } = useVMStatus(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, 'qemu', node);

  const [showAddPci, setShowAddPci] = useState(false);
  const [showAddUsb, setShowAddUsb] = useState(false);
  const [showAddDisk, setShowAddDisk] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const cfg = config as Record<string, unknown> | undefined;
  // Проброс PCI/USB нельзя менять на работающей VM — устройства не поддерживают hotplug.
  const isRunning = status?.status === 'running';

  // Проброшенные устройства: hostpciN (PCI), usbN (USB) и физдиски (scsiN/virtioN/sataN
  // со значением-путём /dev/...). Обычные диски (storage:size) сюда не попадают.
  const passthrough = useMemo(() => {
    if (!cfg) return [] as Array<{ key: string; value: string; kind: 'pci' | 'usb' | 'disk' }>;
    return Object.entries(cfg)
      .filter(([k, v]) =>
        /^(hostpci|usb)\d+$/.test(k) ||
        (/^(scsi|virtio|sata|ide)\d+$/.test(k) && typeof v === 'string' && v.startsWith('/dev/')))
      .map(([key, value]) => ({
        key,
        value: String(value),
        kind: key.startsWith('hostpci')
          ? ('pci' as const)
          : key.startsWith('usb')
            ? ('usb' as const)
            : ('disk' as const),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [cfg]);

  const removeDevice = () => {
    if (!deleteTarget) return;
    updateConfig.mutate(
      { delete: deleteTarget },
      {
        onSuccess: () => {
          toast.success(t('hw.device_removed', 'Устройство {{key}} удалено', { key: deleteTarget }));
          setDeleteTarget(null);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <PlatformCard serverId={serverId} vmid={vmid} type={type} node={node} config={cfg} />

      {/* Passthrough devices */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              {t('hw.passthrough', 'Проброс устройств')}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={isRunning}
                title={isRunning ? t('hw.stop_first', 'Выключите VM для изменения проброса') : undefined}
                onClick={() => setShowAddPci(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />PCI
              </Button>
              <Button size="sm" variant="outline" disabled={isRunning}
                title={isRunning ? t('hw.stop_first', 'Выключите VM для изменения проброса') : undefined}
                onClick={() => setShowAddUsb(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />USB
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => setShowAddDisk(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />{t('hw.disk', 'Диск')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isRunning && (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t('hw.running_lock', 'VM запущена — проброс устройств нельзя добавить или удалить. Выключите VM.')}
            </div>
          )}
          {passthrough.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('hw.no_passthrough', 'Нет проброшенных устройств')}
            </p>
          )}
          {passthrough.map(({ key, value, kind }) => (
            <div key={key} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {kind === 'pci'
                    ? <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    : kind === 'usb'
                      ? <Usb className="h-3.5 w-3.5 text-muted-foreground" />
                      : <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />}
                  <Badge variant="outline">{key}</Badge>
                  <span className="font-mono text-xs">{value}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={isRunning && kind !== 'disk'}
                  onClick={() => setDeleteTarget(key)}
                  title={isRunning && kind !== 'disk'
                    ? t('hw.stop_first', 'Выключите VM для изменения проброса')
                    : t('hw.remove_device', 'Удалить устройство')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {t('hw.passthrough_hint', 'Проброс PCI/USB требует выключенной VM и включённого IOMMU на хосте.')}
          </p>
        </CardContent>
      </Card>

      <AddPciDeviceDialog
        open={showAddPci}
        onClose={() => setShowAddPci(false)}
        serverId={serverId}
        vmid={vmid}
        node={node}
        config={cfg}
      />
      <AddUsbDeviceDialog
        open={showAddUsb}
        onClose={() => setShowAddUsb(false)}
        serverId={serverId}
        vmid={vmid}
        node={node}
        config={cfg}
      />
      <AddPhysicalDiskDialog
        open={showAddDisk}
        onClose={() => setShowAddDisk(false)}
        serverId={serverId}
        vmid={vmid}
        node={node}
        config={cfg}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('hw.remove_title', 'Удалить устройство?')}</DialogTitle>
            <DialogDescription>
              {t('hw.remove_description', 'Устройство {{key}} будет удалено из конфигурации VM.', { key: deleteTarget ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel', 'Отмена')}
            </Button>
            <Button variant="destructive" onClick={removeDevice} disabled={updateConfig.isPending}>
              {t('common.delete', 'Удалить')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
