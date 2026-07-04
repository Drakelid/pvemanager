import { useEffect, useState } from 'react';
import { Loader2, Download } from 'lucide-react';
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
import { useImageStorages, useDownloadImage } from '@/hooks/use-image-catalog';
import { useDeployTasksStore } from '@/stores/deploy-tasks-store';
import { toast } from 'sonner';

export interface SelectedImage {
  source_id?: string;
  kind: 'qcow2' | 'vztmpl';
  name: string;
  template?: string | null;
  arch?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  serverId: number;
  node: string;
  image: SelectedImage | null;
}

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(0)} GB`;
}

export default function DownloadImageDialog({ open, onClose, serverId, node, image }: Props) {
  const isQcow2 = image?.kind === 'qcow2';

  const [storage, setStorage] = useState('');        // download storage (import / vztmpl)
  const [toTemplate, setToTemplate] = useState(true);
  const [diskStorage, setDiskStorage] = useState(''); // VM disk storage (images)
  const [vmid, setVmid] = useState<string>('');       // желаемый VMID шаблона (пусто = авто)
  const [cores, setCores] = useState(2);
  const [memory, setMemory] = useState(2048);
  const [bridge, setBridge] = useState('vmbr0');
  const [ciuser, setCiuser] = useState('');
  const [cipassword, setCipassword] = useState('');

  // qcow2 кладём как образ для импорта (PVE 8.2+ content=import), vztmpl — как шаблон CT
  const content = isQcow2 ? 'import' : 'vztmpl';
  const { data: storages = [], isLoading: storagesLoading } = useImageStorages(
    open ? serverId : undefined,
    open ? node : undefined,
    open ? content : undefined,
  );
  // Хранилища для диска ВМ (только при конвертации в шаблон)
  const { data: diskStorages = [] } = useImageStorages(
    open && isQcow2 && toTemplate ? serverId : undefined,
    open && isQcow2 && toTemplate ? node : undefined,
    open && isQcow2 && toTemplate ? 'images' : undefined,
  );

  const download = useDownloadImage(serverId);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  useEffect(() => {
    if (open) {
      setStorage(storages.length === 1 ? storages[0].storage : '');
      setToTemplate(true);
      setVmid('');
    }
  }, [open, storages]);

  useEffect(() => {
    if (open) setDiskStorage(diskStorages.length === 1 ? diskStorages[0].storage : '');
  }, [open, diskStorages]);

  if (!image) return null;

  const makeTemplate = isQcow2 && toTemplate;
  const submitDisabled =
    !storage || download.isPending || (makeTemplate && !diskStorage);

  const submit = () => {
    if (submitDisabled) return;
    download.mutate(
      {
        node,
        storage,
        source_id: image.source_id,
        kind: image.kind,
        template: image.source_id ? undefined : image.template || undefined,
        to_template: makeTemplate,
        vmid: makeTemplate && vmid.trim() ? Number(vmid) : undefined,
        disk_storage: makeTemplate ? diskStorage : undefined,
        cores: makeTemplate ? cores : undefined,
        memory: makeTemplate ? memory : undefined,
        bridge: makeTemplate ? bridge : undefined,
        ciuser: makeTemplate && ciuser ? ciuser : undefined,
        cipassword: makeTemplate && cipassword ? cipassword : undefined,
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
            node,
            error_message: null,
            kind: makeTemplate ? 'image_template' : 'image_download',
            server_id: serverId,
          });
          toast.success(makeTemplate ? 'Создание шаблона запущено в фоне' : 'Загрузка образа запущена в фоне');
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{makeTemplate ? 'Создать шаблон из образа' : 'Скачать образ'}</DialogTitle>
          <DialogDescription>{image.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Нода: <span className="font-medium text-foreground">{node}</span>
            {image.arch ? <> · Архитектура: <span className="font-medium text-foreground">{image.arch}</span></> : null}
          </div>

          <div>
            <Label>{isQcow2 ? 'Хранилище загрузки (import)' : 'Хранилище (vztmpl)'}</Label>
            <Select value={storage || '__none__'} onValueChange={(v) => { if (v !== null) setStorage(v === '__none__' ? '' : v); }}>
              <SelectTrigger>
                <SelectValue placeholder={storagesLoading ? 'Загрузка...' : 'Выберите хранилище'} />
              </SelectTrigger>
              <SelectContent>
                {storages.map((s) => (
                  <SelectItem key={s.storage} value={s.storage}>
                    {s.storage} ({s.type}){s.avail ? ` · ${fmtSize(s.avail)} свободно` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!storagesLoading && storages.length === 0 && (
              <p className="mt-2 text-sm text-warning">
                {content === 'import'
                  ? 'Нет хранилища с поддержкой импорта (content=import). Нужен dir/NFS storage с типом контента «Import» (PVE 8.2+).'
                  : 'Нет хранилища с поддержкой шаблонов контейнеров (vztmpl).'}
              </p>
            )}
          </div>

          {isQcow2 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={toTemplate} onChange={(e) => setToTemplate(e.target.checked)} />
              <span>Сделать VM-шаблоном после загрузки (импорт диска + cloud-init)</span>
            </label>
          )}

          {makeTemplate && (
            <div className="space-y-4 rounded-md border p-3">
              <div>
                <Label>Хранилище диска ВМ (images)</Label>
                <Select value={diskStorage || '__none__'} onValueChange={(v) => { if (v !== null) setDiskStorage(v === '__none__' ? '' : v); }}>
                  <SelectTrigger><SelectValue placeholder="Выберите хранилище" /></SelectTrigger>
                  <SelectContent>
                    {diskStorages.map((s) => (
                      <SelectItem key={s.storage} value={s.storage}>
                        {s.storage} ({s.type}){s.avail ? ` · ${fmtSize(s.avail)} свободно` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {diskStorages.length === 0 && (
                  <p className="mt-2 text-sm text-warning">
                    Нет хранилища для дисков ВМ (content=images).
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="img-vmid">VMID шаблона (пусто = авто)</Label>
                <Input id="img-vmid" type="number" min={100} placeholder="напр. 9001"
                  value={vmid} onChange={(e) => setVmid(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="img-cores">Ядра</Label>
                  <Input id="img-cores" type="number" min={1} value={cores} onChange={(e) => setCores(Number(e.target.value) || 1)} />
                </div>
                <div>
                  <Label htmlFor="img-mem">Память (MB)</Label>
                  <Input id="img-mem" type="number" min={256} step={256} value={memory} onChange={(e) => setMemory(Number(e.target.value) || 512)} />
                </div>
                <div>
                  <Label htmlFor="img-bridge">Мост</Label>
                  <Input id="img-bridge" value={bridge} onChange={(e) => setBridge(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="img-ciuser">cloud-init пользователь</Label>
                  <Input id="img-ciuser" placeholder="напр. ubuntu" value={ciuser} onChange={(e) => setCiuser(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="img-cipass">cloud-init пароль</Label>
                  <Input id="img-cipass" type="password" value={cipassword} onChange={(e) => setCipassword(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={submitDisabled}>
            {download.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {makeTemplate ? 'Создать шаблон' : 'Скачать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
