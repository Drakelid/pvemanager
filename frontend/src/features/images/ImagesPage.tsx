import { useEffect, useMemo, useState } from 'react';
import { Search, Download, HardDriveDownload, Package, ChevronDown, Disc } from 'lucide-react';
import { OsLogo } from '@/features/templates/OsLogo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServers, useNodes } from '@/hooks/use-nodes';
import { useImageCatalog, useImageLXCTemplates, useNodeArch, useNodeIsos } from '@/hooks/use-image-catalog';
import { useProfile } from '@/hooks/use-settings';
import { formatBytes } from '@/lib/format';
import DownloadImageDialog, { type SelectedImage } from './DownloadImageDialog';
import DownloadIsoDialog, { type IsoSource } from './DownloadIsoDialog';
import MirrorsManager from './MirrorsManager';
import type { CatalogImage } from '@/types';

export default function ImagesPage() {
  const [serverId, setServerId] = useState<number | null>(null);
  const [node, setNode] = useState<string>('');
  const [search, setSearch] = useState('');
  // По умолчанию показываем amd64 (доминирующая платформа PVE); уточняется по арх ноды
  const [archFilter, setArchFilter] = useState<string>('amd64');
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(() => localStorage.getItem('images-cloud-open') !== '0');
  const [lxcOpen, setLxcOpen] = useState(() => localStorage.getItem('images-lxc-open') !== '0');
  const [isoOpen, setIsoOpen] = useState(() => localStorage.getItem('images-iso-open') !== '0');
  const [isoSource, setIsoSource] = useState<IsoSource | null>(null);
  const [isoDialogOpen, setIsoDialogOpen] = useState(false);

  const toggleCloud = () => setCloudOpen((v) => { localStorage.setItem('images-cloud-open', v ? '0' : '1'); return !v; });
  const toggleLxc = () => setLxcOpen((v) => { localStorage.setItem('images-lxc-open', v ? '0' : '1'); return !v; });
  const toggleIso = () => setIsoOpen((v) => { localStorage.setItem('images-iso-open', v ? '0' : '1'); return !v; });

  const { data: servers = [] } = useServers();
  const { data: profile } = useProfile();
  const isAdmin = !!profile?.is_admin;
  const { data: nodesResp } = useNodes(serverId ?? 0);
  const nodes = nodesResp?.nodes ?? [];

  const { data: catalog } = useImageCatalog();
  const { data: lxcRepo = [] } = useImageLXCTemplates(serverId ?? undefined, node || undefined);
  const { data: nodeArch } = useNodeArch(serverId ?? undefined, node || undefined);
  const { data: nodeIsosResp } = useNodeIsos(serverId ?? undefined, node || undefined);

  // Авто-выбор первого сервера и ноды
  useEffect(() => {
    if (serverId == null && servers.length > 0) setServerId(servers[0].id);
  }, [servers, serverId]);
  useEffect(() => {
    if (!node && nodes.length > 0) setNode(nodes[0].node);
  }, [nodes, node]);
  // Подстроить фильтр архитектуры под выбранную ноду (если арх определилась)
  useEffect(() => {
    if (nodeArch?.arch) setArchFilter(nodeArch.arch);
  }, [nodeArch?.arch, node]);

  const cloudImages = useMemo<CatalogImage[]>(() => {
    const all = [...(catalog?.builtin ?? []), ...(catalog?.mirrors ?? [])];
    return all.filter((img) => {
      if (img.kind !== 'qcow2') return false;
      if (archFilter && img.arch !== archFilter) return false;
      const q = search.toLowerCase();
      return !q || `${img.name} ${img.os ?? ''} ${img.version ?? ''}`.toLowerCase().includes(q);
    });
  }, [catalog, archFilter, search]);

  // ISO во встроенном каталоге нет — ссылки на дистрибутивы живут в зеркалах пользователя.
  const isoImages = useMemo<CatalogImage[]>(() => {
    const all = [...(catalog?.builtin ?? []), ...(catalog?.mirrors ?? [])];
    const q = search.toLowerCase();
    return all.filter((img) => img.kind === 'iso'
      && (!q || `${img.name} ${img.os ?? ''} ${img.version ?? ''}`.toLowerCase().includes(q)));
  }, [catalog, search]);

  // Реальные ISO-файлы на хранилищах выбранной ноды (в т.ч. существовавшие
  // до подключения ноды к панели). Фильтр по поисковой строке.
  const nodeIsos = useMemo(() => {
    const all = nodeIsosResp?.isos ?? [];
    const q = search.toLowerCase();
    return all.filter((iso) => !q || `${iso.name} ${iso.volid}`.toLowerCase().includes(q));
  }, [nodeIsosResp, search]);

  const openIsoDownload = (src: IsoSource | null) => {
    setIsoSource(src);
    setIsoDialogOpen(true);
  };

  const lxcTemplates = useMemo(() => {
    const q = search.toLowerCase();
    return lxcRepo.filter((t) => !q || `${t.template} ${t.os ?? ''} ${t.headline ?? ''}`.toLowerCase().includes(q));
  }, [lxcRepo, search]);

  const openDownload = (img: SelectedImage) => {
    setSelected(img);
    setDialogOpen(true);
  };

  const canDownload = serverId != null && !!node;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDriveDownload className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Образы</h1>
        </div>
      </div>

      {/* Контекст: сервер + нода */}
      <div className="flex flex-wrap gap-3">
        <Select value={serverId != null ? String(serverId) : ''} onValueChange={(v) => { if (v !== null) { setServerId(Number(v)); setNode(''); } }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Сервер" /></SelectTrigger>
          <SelectContent>
            {servers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={node} onValueChange={(v) => { if (v) setNode(v); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Нода" /></SelectTrigger>
          <SelectContent>
            {nodes.length === 0 && <SelectItem value="__empty__" disabled>Нет доступных нод</SelectItem>}
            {nodes.map((n) => <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Поиск образа..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={archFilter || '__all__'} onValueChange={(v) => { if (v !== null) setArchFilter(v === '__all__' ? '' : v); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Архитектура" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все архитектуры</SelectItem>
            <SelectItem value="amd64">amd64</SelectItem>
            <SelectItem value="arm64">arm64</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cloud-образы (qcow2 → шаблон ВМ) */}
      <section className="space-y-3">
        <button type="button" onClick={toggleCloud}
          className="flex w-full items-center gap-2 text-lg font-semibold">
          <ChevronDown className={`h-5 w-5 transition-transform ${cloudOpen ? '' : '-rotate-90'}`} />
          <Package className="h-5 w-5" /> Cloud-образы ВМ
        </button>
        {cloudOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cloudImages.map((img) => (
            <Card key={img.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <OsLogo name={img.os || img.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{img.name}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="secondary">{img.arch}</Badge>
                    {img.source === 'mirror' && <Badge variant="outline">зеркало</Badge>}
                  </div>
                </div>
                <Button size="sm" disabled={!canDownload}
                  onClick={() => openDownload({ source_id: img.id, kind: 'qcow2', name: img.name, arch: String(img.arch) })}>
                  <Download className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {cloudImages.length === 0 && (
            <div className="text-sm text-muted-foreground col-span-full">Нет образов по фильтру.</div>
          )}
        </div>
        )}
      </section>

      {/* ISO-образы (установочные) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={toggleIso}
            className="flex items-center gap-2 text-lg font-semibold">
            <ChevronDown className={`h-5 w-5 transition-transform ${isoOpen ? '' : '-rotate-90'}`} />
            <Disc className="h-5 w-5" /> ISO-образы
          </button>
          <Button size="sm" variant="outline" disabled={!canDownload}
            onClick={() => openIsoDownload(null)}>
            <Download className="mr-2 h-4 w-4" /> Загрузить по URL
          </Button>
        </div>
        {isoOpen && (<>
          {!canDownload && (
            <div className="text-sm text-muted-foreground">Выберите сервер и ноду, чтобы загрузить образ.</div>
          )}

          {/* Реальные ISO на хранилище ноды (загруженные ранее, в т.ч. до подключения к панели) */}
          {canDownload && nodeIsos.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">На хранилище ноды</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {nodeIsos.map((iso) => (
                  <Card key={iso.volid}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <OsLogo name={iso.name} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate" title={iso.name}>{iso.name}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline">{iso.storage}</Badge>
                          {iso.size != null && <Badge variant="secondary">{formatBytes(iso.size)}</Badge>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Сохранённые ISO-ссылки из каталога/зеркал */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {isoImages.map((img) => (
              <Card key={img.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <OsLogo name={img.os || img.name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{img.name}</div>
                    <div className="text-xs text-muted-foreground truncate" title={img.url ?? ''}>{img.url}</div>
                  </div>
                  <Button size="sm" disabled={!canDownload}
                    onClick={() => openIsoDownload({ source_id: img.id, name: img.name, url: img.url ?? undefined })}>
                    <Download className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {isoImages.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Сохранённых ISO-ссылок нет. Загрузите образ по URL или добавьте зеркало с типом «iso» ниже.
            </div>
          )}
        </>)}
      </section>

      {/* LXC-шаблоны (репозиторий Proxmox) */}
      <section className="space-y-3">
        <button type="button" onClick={toggleLxc}
          className="flex w-full items-center gap-2 text-lg font-semibold">
          <ChevronDown className={`h-5 w-5 transition-transform ${lxcOpen ? '' : '-rotate-90'}`} />
          <Package className="h-5 w-5" /> LXC-шаблоны (репозиторий Proxmox)
        </button>
        {lxcOpen && (<>
        {!canDownload && (
          <div className="text-sm text-muted-foreground">Выберите сервер и ноду, чтобы увидеть список.</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lxcTemplates.map((t) => (
            <Card key={t.template}>
              <CardContent className="flex items-center gap-3 p-4">
                <OsLogo name={t.os || t.template} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate" title={t.template}>{t.headline || t.template}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.template}</div>
                </div>
                <Button size="sm" disabled={!canDownload}
                  onClick={() => openDownload({ kind: 'vztmpl', name: t.template, template: t.template })}>
                  <Download className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        </>)}
      </section>

      {isAdmin && <MirrorsManager />}

      <DownloadImageDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        serverId={serverId ?? 0}
        node={node}
        image={selected}
      />

      <DownloadIsoDialog
        open={isoDialogOpen}
        onClose={() => setIsoDialogOpen(false)}
        serverId={serverId ?? 0}
        node={node}
        source={isoSource}
      />
    </div>
  );
}
