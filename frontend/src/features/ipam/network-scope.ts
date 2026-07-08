import type { IPAMNetwork } from '@/types';

/**
 * Сети, релевантные для выпадающих списков в мастерах.
 * Список сетей уже отфильтрован бэкендом по активной рабочей области
 * (заголовок X-Active-Workspace), поэтому здесь достаточно отсеять неактивные.
 * Если явно передан workspaceId — дополнительно оставляем только сети этой
 * области плюс глобальные (без привязки).
 */
export function scopedNetworks(
  networks: IPAMNetwork[],
  workspaceId?: number | null,
): IPAMNetwork[] {
  return networks.filter((n) =>
    n.is_active &&
    (!workspaceId || !n.workspace_id || n.workspace_id === workspaceId),
  );
}

/**
 * Автовыбор сети для активной рабочей области: возвращает id IPAM-сети, из пула
 * которой выдаётся IP, либо null (тогда fallback на DHCP/ручной ввод).
 *
 * Правило: среди сетей области — сеть с флагом «по умолчанию», иначе первая
 * сеть области. Глобальные сети (без области) автоматически не выбираем.
 */
export function autoPickNetworkId(
  networks: IPAMNetwork[],
  workspaceId?: number | null,
): number | null {
  const inWs = networks.filter((n) =>
    n.is_active && (workspaceId ? n.workspace_id === workspaceId : !!n.workspace_id),
  );
  if (!inWs.length) return null;
  const def = inWs.find((n) => n.is_default);
  return (def ?? inWs[0]).id;
}
