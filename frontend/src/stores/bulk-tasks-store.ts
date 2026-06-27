import { create } from 'zustand';

export interface BulkTaskItemRef {
  server_id: number;
  vmid: number;
  name: string;
}

export interface BulkTaskResult {
  server_id: number;
  vmid: number;
  name?: string;
  success: boolean;
  message?: string;
}

export interface BulkTask {
  id: number;
  action: string; // start | stop | restart | shutdown | delete
  items: BulkTaskItemRef[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  failed: number;
  results: BulkTaskResult[];
  created_at: number;
}

interface BulkTasksState {
  tasks: BulkTask[];
  addTask: (task: Omit<BulkTask, 'created_at'>) => void;
  updateTask: (id: number, update: Partial<BulkTask>) => void;
  removeTask: (id: number) => void;
}

// Ephemeral (not persisted): only tracks bulk operations started in the
// current session so the instances list can show live progress like creation.
export const useBulkTasksStore = create<BulkTasksState>((set) => ({
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
      // Only patch tasks we already track (started in this session).
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...update } : t)),
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),
}));
