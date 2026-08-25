import {
  LayoutDashboard,
  Server,
  Monitor,
  Network,
  HardDrive,
  Archive,
  Globe,
  Settings,
  Users,
  FileText,
  ClipboardList,
  FolderKanban,
  Store,
  Package,
  Terminal,
  UserCog,
  Waypoints,
} from 'lucide-react';
import { hasPermission } from './permissions';

export interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  // Permission ("resource:action") the destination page requires. When set, the
  // item is hidden unless the user is an admin or has that permission granted.
  // When omitted, the item is admin-only.
  permission?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Each item is gated by the permission its page's API actually requires, so a
// menu only appears when the user can use the page behind it. Admins bypass all
// checks. Items without a `permission` are admin-only (no user-facing API).
// Shared by the sidebar (AppLayout) and the command palette so both stay in
// sync with a single source of truth.
export const navGroups: NavGroup[] = [
  {
    title: 'Infrastructure',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', permission: 'dashboard:view' },
      { label: 'Instances', icon: Monitor, path: '/instances', permission: 'vm:view' },
      { label: 'Nodes', icon: Server, path: '/nodes', permission: 'server:view' },
      { label: 'Cluster', icon: Network, path: '/cluster', permission: 'cluster:manage' },
      { label: 'Templates', icon: HardDrive, path: '/templates', permission: 'template:view' },
      { label: 'Backups', icon: Archive, path: '/backups', permission: 'backup:view' },
      { label: 'Tasks', icon: ClipboardList, path: '/tasks', permission: 'vm:view' },
    ],
  },
  {
    title: 'Applications',
    items: [
      { label: 'App Store', icon: Store, path: '/appstore', permission: 'app:view' },
      { label: 'My Apps', icon: Package, path: '/my-apps', permission: 'app:view' },
      { label: 'Scripts', icon: Terminal, path: '/scripts', permission: 'script:view' },
    ],
  },
  {
    title: 'Network',
    items: [
      { label: 'Topology', icon: Waypoints, path: '/topology', permission: 'network:view' },
      { label: 'IPAM', icon: Globe, path: '/ipam', permission: 'ipam:view' },
      { label: 'Networks', icon: Network, path: '/networks', permission: 'server:manage' },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Users', icon: Users, path: '/users', permission: 'user:view' },
      { label: 'Workspaces', icon: FolderKanban, path: '/workspaces' }, // admin-only
      { label: 'Logs', icon: FileText, path: '/logs', permission: 'log:view' },
      // Panel-wide settings only; a user's own account is /profile below.
      { label: 'Settings', icon: Settings, path: '/settings', permission: 'setting:view' },
    ],
  },
];

/**
 * Pages every logged-in user may open. They are self-scoped (the endpoints
 * behind them only require a session), so unlike `navGroups` these carry no
 * permission — the type omits the field so they can never be mistaken for
 * admin-only entries. Reached from the user menu, not the sidebar groups.
 */
export const personalNavItems: Omit<NavItem, 'permission'>[] = [
  { label: 'Profile', icon: UserCog, path: '/profile' },
];

/** Whether the current user may see a given nav item. Admins see everything. */
export function canSeeNavItem(
  item: NavItem,
  isAdmin: boolean,
  permissions: Record<string, boolean> | undefined,
): boolean {
  return hasPermission(isAdmin, permissions, item.permission);
}

/**
 * Path of the first nav item the user may open, falling back to their own
 * profile when no permission-gated page is reachable. Used as the landing page
 * for users who lack `dashboard:view` and as the redirect target when a route
 * guard denies access.
 */
export function firstAccessiblePath(
  isAdmin: boolean,
  permissions: Record<string, boolean> | undefined,
): string | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (canSeeNavItem(item, isAdmin, permissions)) return item.path;
    }
  }
  return personalNavItems[0]?.path ?? null;
}
