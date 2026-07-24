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

/** Предзаполнение из сохранённого зеркала; без него диалог работает по произвольному URL. */
export interface IsoSource {
  source_id?: string;
  name?: string;
  url?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  serverId: number;
  node: string;
  source?: IsoSource | null;
}

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(0)} GB`;
}

/** Имя файла из URL: хвост пути без query-строки. */
function filenameFromUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.split('/').pop() || '';
}

export default function DownloadIsoDialog({ open, onClose, serverId, node, source }: Props) {
  const fromMirror = !!source?.source_id;

  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [storage, setStorage] = useState('');
  const [checksum, setChecksum] = useState('');
  const [checksumAlgo, setChecksumAlgo] = useState('sha256');

  const { data: storages = [], isLoading: storagesLoading } = useImageStorages(
    open ? serverId : undefined,
    open ? node : undefined,
    open ? 'iso' : undefined,
  );

  const download = useDownloadImage(serverId);
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  useEffect(() => {
    if (!open) return;
    setUrl(source?.url ?? '');
    setFilename(source?.url ? filenameFromUrl(source.url) : '');
    setChecksum('');
    setChecksumAlgo('sha256');
  }, [open, source?.url]);

  useEffect(() => {
    if (open) setStorage(storages.length === 1 ? storages[0].storage : '');
  }, [open, storages]);

  // Пользователь мог не тронуть имя — тогда ведём его за URL.
  const effectiveFilename = filename.trim() || filenameFromUrl(url);
  const submitDisabled =
    !storage || download.isPending || (!fromMirror && (!url.trim() || !effectiveFilename));

  const submit = () => {
    if (submitDisabled) return;
    download.mutate(
      {
        node,
        storage,
        kind: 'iso',
        source_id: source?.source_id,
        url: fromMirror ? undefined : url.trim(),
        filename: fromMirror ? undefined : effectiveFilename,
        checksum: checksum.trim() || undefined,
        checksum_algorithm: checksum.trim() ? checksumAlgo : undefined,
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
          toast.success('Загрузка ISO запущена в фоне');
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
          <DialogTitle>Загрузить ISO</DialogTitle>
          <DialogDescription>
            {fromMirror ? source?.name : 'Proxmox скачает образ по ссылке прямо на ноду'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Нода: <span className="font-medium text-foreground">{node}</span>
          </div>

          {!fromMirror && (
            <>
              <div>
                <Label htmlFor="iso-url">URL образа</Label>
                <Input
                  id="iso-url"
                  placeholder="https://releases.example.org/linux-24.04-amd64.iso"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="iso-filename">Имя файла в хранилище</Label>
                <Input
                  id="iso-filename"
                  placeholder={filenameFromUrl(url) || 'linux-24.04-amd64.iso'}
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Proxmox принимает только .iso и .img — иначе расширение будет добавлено автоматически.
                </p>
              </div>
            </>
          )}

          <div>
            <Label>Хранилище (iso)</Label>
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
                Нет хранилища с типом контента ISO. Включите ISO в настройках хранилища.
              </p>
            )}
          </div>

          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <Label htmlFor="iso-checksum">Контрольная сумма (необязательно)</Label>
              <Input
                id="iso-checksum"
                placeholder="e3b0c44298fc1c14..."
                value={checksum}
                onChange={(e) => setChecksum(e.target.value)}
              />
            </div>
            <div>
              <Label>Алгоритм</Label>
              <Select value={checksumAlgo} onValueChange={(v) => { if (v) setChecksumAlgo(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sha256">sha256</SelectItem>
                  <SelectItem value="sha512">sha512</SelectItem>
                  <SelectItem value="sha1">sha1</SelectItem>
                  <SelectItem value="md5">md5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={submitDisabled}>
            {download.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Скачать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
