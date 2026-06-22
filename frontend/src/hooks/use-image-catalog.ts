import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ImageCatalogResponse,
  ImageTargetStorage,
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
  kind?: 'qcow2' | 'vztmpl';
  url?: string;
  template?: string;
  filename?: string;
  checksum?: string;
  checksum_algorithm?: string;
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
