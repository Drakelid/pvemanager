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
  const [storage, setStorage] = useState('');

  // qcow2 кладём как образ для импорта (PVE 8.2+ content=import), vztmpl — как шаблон CT
  const content = image?.kind === 'vztmpl' ? 'vztmpl' : 'import';
  const { data: storages = [], isLoading: storagesLoading } = useImageStorages(
    open ? serverId : undefined,
    open ? node : undefined,
    open ? content : undefined,
  );

  const download = useDownloadImage(serverId);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  useEffect(() => {
    if (open) {
      // Авто-выбор единственного хранилища
      setStorage(storages.length === 1 ? storages[0].storage : '');
    }
  }, [open, storages]);

  if (!image) return null;

  const submit = () => {
    if (!storage) return;
    download.mutate(
      {
        node,
        storage,
        source_id: image.source_id,
        kind: image.kind,
        template: image.source_id ? undefined : image.template || undefined,
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
            kind: 'image_download',
            server_id: serverId,
          });
          toast.success('Загрузка образа запущена в фоне');
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
          <DialogTitle>Скачать образ</DialogTitle>
          <DialogDescription>{image.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Нода: <span className="font-medium text-foreground">{node}</span>
            {image.arch ? <> · Архитектура: <span className="font-medium text-foreground">{image.arch}</span></> : null}
          </div>

          <div>
            <Label>Хранилище ({content})</Label>
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
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                {content === 'import'
                  ? 'Нет хранилища с поддержкой импорта (content=import). Нужен dir/NFS storage с типом контента «Import» (PVE 8.2+).'
                  : 'Нет хранилища с поддержкой шаблонов контейнеров (vztmpl).'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={!storage || download.isPending}>
            {download.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Скачать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
