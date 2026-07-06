import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { User, LoginRequest, AuthResponse } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginRequest) => Promise<{ twoFactorRequired: boolean }>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  error: null,

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient.post<AuthResponse>('/api/auth/login', credentials);

      // Password accepted but a second factor is still required.
      if (data.two_factor_required || !data.access_token) {
        set({ isLoading: false });
        return { twoFactorRequired: true };
      }

      apiClient.setToken(data.access_token);
      set({ token: data.access_token, isAuthenticated: true, isLoading: false });

      // Load user info
      const user = await apiClient.get<User>('/api/auth/me');
      set({ user });
      return { twoFactorRequired: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      // Ignore logout errors
    }
    apiClient.setToken(null);
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      apiClient.setToken(token);
      const user = await apiClient.get<User>('/api/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      apiClient.setToken(null);
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
