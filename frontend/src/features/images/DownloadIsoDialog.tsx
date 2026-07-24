import { useEffect, useRef, useState } from 'react';
import { Loader2, Download, Upload, Wand2, FileUp, X } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  useImageStorages,
  useDownloadImage,
  useUploadImageFile,
  useResolveFilename,
} from '@/hooks/use-image-catalog';
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

/** Размер выбранного локального файла: MB до 1 GB, иначе GB. */
function fmtFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Имя файла из URL: хвост пути без query-строки (грубая догадка на лету). */
function filenameFromUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.split('/').pop() || '';
}

type Mode = 'url' | 'local';

export default function DownloadIsoDialog({ open, onClose, serverId, node, source }: Props) {
  const fromMirror = !!source?.source_id;

  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [storage, setStorage] = useState('');
  const [checksum, setChecksum] = useState('');
  const [checksumAlgo, setChecksumAlgo] = useState('sha256');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: storages = [], isLoading: storagesLoading } = useImageStorages(
    open ? serverId : undefined,
    open ? node : undefined,
    open ? 'iso' : undefined,
  );

  const download = useDownloadImage(serverId);
  const uploadFile = useUploadImageFile(serverId);
  const resolveFilename = useResolveFilename();
  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  useEffect(() => {
    if (!open) return;
    setMode('url');
    setUrl(source?.url ?? '');
    setFilename(source?.url ? filenameFromUrl(source.url) : '');
    setChecksum('');
    setChecksumAlgo('sha256');
    setSelectedFile(null);
    setIsDragging(false);
  }, [open, source?.url]);

  useEffect(() => {
    if (open) setStorage(storages.length === 1 ? storages[0].storage : '');
  }, [open, storages]);

  // Пользователь мог не тронуть имя — тогда ведём его за URL.
  const effectiveFilename = filename.trim() || filenameFromUrl(url);
  const isPending = download.isPending || uploadFile.isPending;
  const submitDisabled =
    !storage || isPending ||
    (fromMirror ? false : mode === 'url' ? (!url.trim() || !effectiveFilename) : !selectedFile);

  const handleDetectFilename = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    resolveFilename.mutate(trimmed, {
      onSuccess: (data) => {
        if (data.filename) setFilename(data.filename);
        else toast.error('Не удалось определить имя файла');
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    setSelectedFile(file);
  };

  const onSuccess = (data: { task_id: number; status: string; name: string }, msg: string) => {
    addDeployTask({
      id: data.task_id,
      name: data.name,
      status: 'pending',
      step: 'В очереди...',
      progress: 0,
      vmid: null,
      node,
      error_message: null,
      kind: mode === 'local' ? 'image_upload' : 'image_download',
      server_id: serverId,
    });
    toast.success(msg);
    onClose();
  };

  const submit = () => {
    if (submitDisabled) return;

    if (mode === 'local' && !fromMirror) {
      if (!selectedFile) return;
      uploadFile.mutate(
        {
          node,
          storage,
          content: 'iso',
          file: selectedFile,
          checksum: checksum.trim() || undefined,
          checksum_algorithm: checksum.trim() ? checksumAlgo : undefined,
        },
        {
          onSuccess: (data) => onSuccess(data, 'Загрузка ISO на ноду запущена в фоне'),
          onError: (e: Error) => toast.error(e.message),
        },
      );
      return;
    }

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
        onSuccess: (data) => onSuccess(data, 'Загрузка ISO запущена в фоне'),
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
            {fromMirror
              ? source?.name
              : mode === 'local'
                ? 'Файл будет передан на ноду через панель'
                : 'Proxmox скачает образ по ссылке прямо на ноду'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Нода: <span className="font-medium text-foreground">{node}</span>
          </div>

          {!fromMirror && (
            <Tabs value={mode} onValueChange={(v) => v && setMode(v as Mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="url" className="flex-1">
                  <Download className="mr-1.5 h-4 w-4" />По ссылке (URL)
                </TabsTrigger>
                <TabsTrigger value="local" className="flex-1">
                  <FileUp className="mr-1.5 h-4 w-4" />Локальный файл
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="iso-url">URL образа</Label>
                  <div className="flex gap-2">
                    <Input
                      id="iso-url"
                      placeholder="https://releases.example.org/linux-24.04-amd64.iso"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDetectFilename}
                      disabled={!url.trim() || resolveFilename.isPending}
                      title="Определить имя файла по ссылке"
                    >
                      {resolveFilename.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Wand2 className="h-4 w-4" />}
                    </Button>
                  </div>
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
                    Кнопка со звёздочкой рядом с URL определяет настоящее имя файла (по Content-Disposition
                    или итоговой ссылке после редиректов), если оно не видно из самого URL.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="local" className="mt-4 space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".iso,.img"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
                {!selectedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      pickFile(e.dataTransfer.files?.[0]);
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                      isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Перетащите ISO-файл сюда</p>
                    <p className="text-xs text-muted-foreground">или нажмите, чтобы выбрать (.iso, .img)</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedFile(null)}
                      title="Убрать файл"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Имя файла в хранилище назначается автоматически — из имени выбранного файла.
                </p>
              </TabsContent>
            </Tabs>
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
            {isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : mode === 'local' && !fromMirror
                ? <Upload className="mr-2 h-4 w-4" />
                : <Download className="mr-2 h-4 w-4" />}
            {mode === 'local' && !fromMirror ? 'Загрузить' : 'Скачать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
