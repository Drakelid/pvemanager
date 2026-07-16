import {
  LayoutDashboard,
  Server,
  Monitor,
  Network,
  HardDrive,
  HardDriveDownload,
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
} from 'lucide-react';

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
      { label: 'Images', icon: HardDriveDownload, path: '/images', permission: 'template:manage' },
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
      { label: 'Settings', icon: Settings, path: '/settings', permission: 'setting:view' },
    ],
  },
];

/** Whether the current user may see a given nav item. Admins see everything. */
export function canSeeNavItem(
  item: NavItem,
  isAdmin: boolean,
  permissions: Record<string, boolean> | undefined,
): boolean {
  if (isAdmin) return true;
  if (!item.permission) return false; // admin-only item
  return !!permissions?.[item.permission];
}
