import { useAuthStore } from '@/stores/auth-store';

/**
 * Whether a user holding `permissions` may use `permission`.
 *
 * Mirrors the backend `PermissionEngine.has_permission`: admins bypass every
 * check. A missing `permission` means "admin only" — the same convention the
 * nav items use for entries without a user-facing API.
 */
export function hasPermission(
  isAdmin: boolean,
  permissions: Record<string, boolean> | undefined,
  permission?: string,
): boolean {
  if (isAdmin) return true;
  if (!permission) return false; // admin-only
  return !!permissions?.[permission];
}

/**
 * Reactive `hasPermission` for the logged-in user. Use it to hide admin-only
 * UI (tabs, cards, actions); the backend still enforces the same permission,
 * so this is UX, not a security boundary.
 */
export function useHasPermission(permission?: string): boolean {
  return useAuthStore((s) => hasPermission(!!s.user?.is_admin, s.user?.permissions, permission));
}
