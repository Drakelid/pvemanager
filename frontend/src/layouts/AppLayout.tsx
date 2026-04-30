import { Link, useLocation, Outlet, useNavigate } from 'react-router';
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
  Sun,
  Moon,
  Menu,
  LogOut,
  Languages,
  ChevronDown,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import NotificationsDropdown from '@/components/shared/NotificationsDropdown';

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Infrastructure',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Instances', icon: Monitor, path: '/instances' },
      { label: 'Nodes', icon: Server, path: '/nodes' },
      { label: 'Templates', icon: HardDrive, path: '/templates' },
      { label: 'Backups', icon: Archive, path: '/backups' },
      { label: 'Tasks', icon: ClipboardList, path: '/tasks' },
    ],
  },
  {
    title: 'Network',
    items: [
      { label: 'IPAM', icon: Globe, path: '/ipam' },
      { label: 'Networks', icon: Network, path: '/networks' },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Users', icon: Users, path: '/users' },
      { label: 'Workspaces', icon: FolderKanban, path: '/workspaces' },
      { label: 'Logs', icon: FileText, path: '/logs' },
      { label: 'Settings', icon: Settings, path: '/settings' },
    ],
  },
];

function SidebarContent() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-20 items-center gap-2 px-4">
        <img src="/logo.png" alt="PVEmanager" className="h-16 w-auto" />
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`nav.${group.title.toLowerCase()}`, group.title)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(`nav.${item.label.toLowerCase()}`, item.label)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <Separator />

      {/* User section */}
      <UserSection />
    </div>
  );
}

function UserSection() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="p-3">
      <DropdownMenu>
        <DropdownMenuTrigger render={<button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent transition-colors" />}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user?.username ?? 'User'}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.is_admin ? 'Admin' : 'User'}
              </p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            {t('nav.settings')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {t('login.logout', 'Logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { data: workspaces = [] } = useWorkspaces();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleSwitch = (id: number | null) => {
    setActiveWorkspace(id);
    // Invalidate all queries to refetch with new workspace
    qc.invalidateQueries();
  };

  if (workspaces.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5 max-w-[200px]" />}>
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs">{active?.name || t('workspaces.all', 'All workspaces')}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuItem onClick={() => handleSwitch(null)}>
          <Building2 className="mr-2 h-3.5 w-3.5" />
          {t('workspaces.all', 'All workspaces')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => handleSwitch(w.id)}>
            <FolderKanban className="mr-2 h-3.5 w-3.5" />
            <span className="truncate">{w.name}</span>
            {w.id === activeWorkspaceId && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar() {
  const { theme, toggleTheme } = useThemeStore();
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[var(--sidebar-width)] p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      <div className="hidden lg:block">
        <WorkspaceSwitcher />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={toggleLanguage} />}>
            <Languages className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>{i18n.language === 'ru' ? 'English' : 'Русский'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={toggleTheme} />}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </TooltipTrigger>
          <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
        </Tooltip>

        <NotificationsDropdown />
      </div>
    </header>
  );
}

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-[var(--sidebar-width)] shrink-0 border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
