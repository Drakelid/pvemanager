import { create } from 'zustand';

interface WorkspaceState {
  activeWorkspaceId: number | null;
  setActiveWorkspace: (id: number | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspaceId: (() => {
    const stored = localStorage.getItem('pve-active-workspace');
    return stored ? Number(stored) : null;
  })(),
  setActiveWorkspace: (id) => {
    if (id !== null) {
      localStorage.setItem('pve-active-workspace', String(id));
    } else {
      localStorage.removeItem('pve-active-workspace');
    }
    set({ activeWorkspaceId: id });
  },
}));
