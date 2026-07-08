import type { IPAMNetwork } from '@/types';

/**
 * Сети, релевантные выбранным серверу/ноде (для выпадающих списков в визардах).
 * Показываем активные сети, которые:
 *  - привязаны к выбранному серверу ИЛИ глобальные (без привязки к серверу);
 *  - привязаны к выбранной ноде ИЛИ без привязки к конкретной ноде.
 */
export function scopedNetworks(
  networks: IPAMNetwork[],
  serverId?: number | null,
  node?: string | null,
): IPAMNetwork[] {
  return networks.filter((n) =>
    n.is_active &&
    (!n.proxmox_server_id || !serverId || n.proxmox_server_id === serverId) &&
    (!n.proxmox_node || !node || n.proxmox_node === node),
  );
}

/**
 * Автовыбор сети исходя из выбранной ноды: возвращает id IPAM-сети, из пула
 * которой нужно выдать IP, либо null (тогда fallback на DHCP/ручной ввод).
 *
 * Правило (детерминированное):
 *  1. сеть, привязанная именно к этой ноде выбранного сервера;
 *  2. иначе — сеть, привязанная к серверу без привязки к ноде;
 *  3. иначе — null (глобальные сети автоматически НЕ выбираем, чтобы не выдать
 *     адрес из чужой подсети).
 */
export function autoPickNetworkId(
  networks: IPAMNetwork[],
  serverId?: number | null,
  node?: string | null,
): number | null {
  if (!serverId) return null;
  const active = networks.filter((n) => n.is_active && n.proxmox_server_id === serverId);
  if (node) {
    const nodeBound = active.find((n) => n.proxmox_node === node);
    if (nodeBound) return nodeBound.id;
  }
  const serverOnly = active.find((n) => !n.proxmox_node);
  return serverOnly ? serverOnly.id : null;
}
