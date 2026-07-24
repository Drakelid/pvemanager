import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ImageCatalogResponse,
  ImageTargetStorage,
  ImageMirrorItem,
  ImageMirrorInput,
} from '@/types';
import type { AvailableLXCTemplate } from '@/hooks/use-lxc-templates';

export const imageKeys = {
  catalog: ['image-catalog'] as const,
  lxcRepo: (serverId?: number, node?: string) => ['image-lxc-repo', serverId, node] as const,
  storages: (serverId?: number, node?: string, content?: string) =>
    ['image-storages', serverId, node, content] as const,
};

// Встроенный каталог + кастомные зеркала. Меняется редко — кэш 10 минут.
export function useImageCatalog() {
  return useQuery({
    queryKey: imageKeys.catalog,
    queryFn: () => apiClient.get<ImageCatalogResponse>('/proxmox/api/images/catalog'),
    staleTime: 10 * 60 * 1000,
  });
}

// Динамический список LXC-шаблонов из репозитория Proxmox (aplinfo).
export function useImageLXCTemplates(serverId?: number, node?: string) {
  return useQuery({
    queryKey: imageKeys.lxcRepo(serverId, node),
    queryFn: () =>
      apiClient.get<AvailableLXCTemplate[]>(
        `/proxmox/api/${serverId}/images/lxc-templates?node=${encodeURIComponent(node!)}`,
      ),
    enabled: !!serverId && !!node,
    staleTime: 5 * 60 * 1000,
  });
}

// Архитектура ноды (amd64|arm64) — для дефолтного фильтра образов.
export function useNodeArch(serverId?: number, node?: string) {
  return useQuery({
    queryKey: ['image-node-arch', serverId, node],
    queryFn: () =>
      apiClient.get<{ arch: string | null; machine: string | null }>(
        `/proxmox/api/${serverId}/images/node-arch?node=${encodeURIComponent(node!)}`,
      ),
    enabled: !!serverId && !!node,
    staleTime: 10 * 60 * 1000,
  });
}

// Целевые хранилища ноды по типу контента (import|vztmpl|iso).
export function useImageStorages(serverId?: number, node?: string, content?: string) {
  return useQuery({
    queryKey: imageKeys.storages(serverId, node, content),
    queryFn: () =>
      apiClient.get<ImageTargetStorage[]>(
        `/proxmox/api/${serverId}/images/storages?node=${encodeURIComponent(node!)}&content=${encodeURIComponent(content!)}`,
      ),
    enabled: !!serverId && !!node && !!content,
    staleTime: 5 * 60 * 1000,
  });
}

export interface ImageDownloadRequest {
  node: string;
  storage: string;
  source_id?: string;
  kind?: 'qcow2' | 'vztmpl' | 'iso';
  url?: string;
  template?: string;
  filename?: string;
  checksum?: string;
  checksum_algorithm?: string;
  // Авто-конвертация qcow2 → VM-шаблон
  to_template?: boolean;
  vmid?: number;
  disk_storage?: string;
  cores?: number;
  memory?: number;
  bridge?: string;
  ciuser?: string;
  cipassword?: string;
  ssh_keys?: string;
}

export function useDownloadImage(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImageDownloadRequest) =>
      apiClient.post<{ task_id: number; status: string; name: string }>(
        `/proxmox/api/${serverId}/images/download`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] });
    },
  });
}

export interface ImageUploadRequest {
  node: string;
  storage: string;
  content: 'iso' | 'vztmpl';
  file: File;
  filename?: string;
  checksum?: string;
  checksum_algorithm?: string;
}

// Загрузка локального файла (drag&drop) на ноду: multipart, без JSON.
export function useUploadImageFile(serverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImageUploadRequest) => {
      const form = new FormData();
      form.append('node', data.node);
      form.append('storage', data.storage);
      form.append('content', data.content);
      if (data.filename) form.append('filename', data.filename);
      if (data.checksum) form.append('checksum', data.checksum);
      if (data.checksum_algorithm) form.append('checksum_algorithm', data.checksum_algorithm);
      form.append('file', data.file);
      return apiClient.postForm<{ task_id: number; status: string; name: string }>(
        `/proxmox/api/${serverId}/images/upload`,
        form,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] });
    },
  });
}

// Определить реальное имя файла по URL (Content-Disposition / хвост после редиректов).
export function useResolveFilename() {
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.get<{ filename: string }>(
        `/proxmox/api/images/resolve-filename?url=${encodeURIComponent(url)}`,
      ),
  });
}

// ── Custom mirrors (admin) ───────────────────────────────────────────────────

export function useImageMirrors(enabled = true) {
  return useQuery({
    queryKey: ['image-mirrors'],
    queryFn: () => apiClient.get<ImageMirrorItem[]>('/proxmox/api/images/mirrors'),
    enabled,
  });
}

function invalidateMirrors(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['image-mirrors'] });
  qc.invalidateQueries({ queryKey: imageKeys.catalog });
}

export function useCreateMirror() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImageMirrorInput) =>
      apiClient.post<ImageMirrorItem>('/proxmox/api/images/mirrors', data),
    onSuccess: () => invalidateMirrors(qc),
  });
}

export function useUpdateMirror() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ImageMirrorInput> }) =>
      apiClient.put<ImageMirrorItem>(`/proxmox/api/images/mirrors/${id}`, data),
    onSuccess: () => invalidateMirrors(qc),
  });
}

export function useDeleteMirror() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<{ deleted: boolean }>(`/proxmox/api/images/mirrors/${id}`),
    onSuccess: () => invalidateMirrors(qc),
  });
}
