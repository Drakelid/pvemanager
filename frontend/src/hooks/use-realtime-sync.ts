import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getTasksWebSocket } from '@/lib/websocket';
import { vmKeys } from './use-instances';
import { nodeKeys } from './use-nodes';

/**
 * Глобальная подписка на real-time события WebSocket, которая инвалидирует
 * соответствующие React Query кэши.
 *
 * Покрывает события:
 *   - vm_status_update / vm_created / vm_deleted — изменения VM/LXC.
 *   - server_added / server_updated / server_deleted — изменения списка
 *     Proxmox-серверов (в т.ч. их статус is_online).
 *
 * Подключается один раз в AppLayout — действует на всех страницах, чтобы
 * данные обновлялись мгновенно без обновления страницы.
 */
export function useGlobalRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const ws = getTasksWebSocket();
    ws.connect();

    // ── VM events ──────────────────────────────────────────────────────────
    const unsubVmStatus = ws.onType('vm_status_update', (data: unknown) => {
      const msg = data as { vmid: number; server_id: number; status: string };
      qc.setQueryData<Array<Record<string, unknown>>>(vmKeys.all, (old) =>
        old?.map((vm) =>
          vm.server_id === msg.server_id && vm.vmid === msg.vmid
            ? { ...vm, status: msg.status }
            : vm
        )
      );
    });

    const unsubVmDeleted = ws.onType('vm_deleted', (data: unknown) => {
      const msg = data as { vmid: number; server_id: number };
      qc.setQueryData<Array<Record<string, unknown>>>(vmKeys.all, (old) =>
        old?.filter((vm) => !(vm.server_id === msg.server_id && vm.vmid === msg.vmid))
      );
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    });

    const unsubVmCreated = ws.onType('vm_created', () => {
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    });

    // ── Server events ──────────────────────────────────────────────────────
    const invalidateServerCaches = () => {
      qc.invalidateQueries({ queryKey: nodeKeys.servers });
      qc.invalidateQueries({ queryKey: nodeKeys.topology });
      // Список VM/LXC зависит от набора серверов и их online-статуса
      qc.invalidateQueries({ queryKey: vmKeys.all });
      qc.invalidateQueries({ queryKey: vmKeys.resourcesAll });
    };

    const unsubServerAdded = ws.onType('server_added', invalidateServerCaches);
    const unsubServerUpdated = ws.onType('server_updated', invalidateServerCaches);
    const unsubServerDeleted = ws.onType('server_deleted', (data: unknown) => {
      const msg = data as { server_id?: number };
      // Локально удаляем VM удалённого сервера, чтобы UI отреагировал мгновенно
      if (msg?.server_id != null) {
        qc.setQueryData<Array<Record<string, unknown>>>(vmKeys.all, (old) =>
          old?.filter((vm) => vm.server_id !== msg.server_id)
        );
      }
      invalidateServerCaches();
    });

    return () => {
      unsubVmStatus();
      unsubVmDeleted();
      unsubVmCreated();
      unsubServerAdded();
      unsubServerUpdated();
      unsubServerDeleted();
    };
  }, [qc]);
}
