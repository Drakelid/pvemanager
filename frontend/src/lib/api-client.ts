import type { ApiError } from '@/types';

const API_BASE = '';

function getActiveWorkspaceId(): number | null {
  const stored = localStorage.getItem('pve-active-workspace');
  return stored ? Number(stored) : null;
}

class ApiClient {
  private token: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.token = localStorage.getItem('access_token');
    if (this.token) {
      this.scheduleRefresh();
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('access_token', token);
      this.scheduleRefresh();
    } else {
      localStorage.removeItem('access_token');
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private getTokenExpiry(): number | null {
    if (!this.token) return null;
    try {
      const payload = JSON.parse(atob(this.token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const expiry = this.getTokenExpiry();
    if (!expiry) return;

    const refreshIn = expiry - Date.now() - 2 * 60 * 1000; // 2 min before expiry
    if (refreshIn <= 0) {
      this.refreshToken();
      return;
    }

    this.refreshTimer = setTimeout(() => this.refreshToken(), refreshIn);
  }

  private async refreshToken() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        this.setToken(data.access_token);
      } else {
        this.setToken(null);
        window.location.href = '/login';
      }
    } catch {
      // Network error, try again later
    }
  }

  async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const wsId = getActiveWorkspaceId();
    if (wsId) {
      headers['X-Active-Workspace'] = String(wsId);
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        detail: `HTTP ${res.status}: ${res.statusText}`,
      }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
