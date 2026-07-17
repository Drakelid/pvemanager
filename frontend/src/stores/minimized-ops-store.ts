import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Глобальный список свёрнутых долгих операций (установка приложения, сборка
 * золотого шаблона). Живёт вне страниц, поэтому плашки переживают навигацию:
 * прогресс опрашивает глобальный трей (MinimizedOpsTray в AppLayout), а не
 * свёрнутый диалог. Хранится в localStorage — переживает и перезагрузку
 * страницы: операции идут на сервере, трей просто заново подпишется на их
 * прогресс. Плашки несуществующих операций трей убирает сам (см. tray).
 */

export type MinimizedOpKind = 'appstore-install' | 'golden-template';

export interface MinimizedOp {
  key: string;
  kind: MinimizedOpKind;
  title: string;
  installedAppId?: number;  // appstore-install
  appId?: string;           // appstore-install: app_id каталога для возврата на страницу
  serverId?: number;        // golden-template
}

interface MinimizedOpsState {
  items: MinimizedOp[];
  add: (op: MinimizedOp) => void;
  remove: (key: string) => void;
}

export const useMinimizedOpsStore = create<MinimizedOpsState>()(
  persist(
    (set) => ({
      items: [],
      add: (op) => set((s) => (s.items.some((i) => i.key === op.key) ? s : { items: [...s.items, op] })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
    }),
    { name: 'pvemanager-minimized-ops' },
  ),
);

export const installOpKey = (installedAppId: number) => `appstore-install:${installedAppId}`;
export const goldenOpKey = (serverId: number) => `golden-template:${serverId}`;
