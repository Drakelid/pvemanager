import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DeployTask {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  step: string | null;
  progress: number;
  vmid: number | null;
  node: string | null;
  error_message: string | null;
  created_at: number;
  kind?: 'deploy' | 'reinstall' | 'clone' | 'change_password';
  server_id?: number | null;
}

interface DeployTasksState {
  tasks: DeployTask[];
  addTask: (task: Omit<DeployTask, 'created_at'>) => void;
  updateTask: (id: number, update: Partial<DeployTask>) => void;
  removeTask: (id: number) => void;
  clearCompleted: () => void;
}

export const useDeployTasksStore = create<DeployTasksState>()(
  persist(
    (set) => ({
      tasks: [],
      addTask: (task) =>
        set((state) => ({
          tasks: [
            ...state.tasks.filter((t) => t.id !== task.id),
            { ...task, created_at: Date.now() },
          ],
        })),
      updateTask: (id, update) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...update } : t)),
        })),
      removeTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        })),
      clearCompleted: () =>
        set((state) => ({
          tasks: state.tasks.filter(
            (t) => t.status !== 'completed' && t.status !== 'failed',
          ),
        })),
    }),
    {
      name: 'pve-deploy-tasks',
      partialize: (state) => ({
        // Don't persist completed tasks
        tasks: state.tasks.filter((t) => t.status !== 'completed'),
      }),
    },
  ),
);
