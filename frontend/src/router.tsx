import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import ConsoleLayout from '@/layouts/ConsoleLayout';
import { ProtectedRoute, PublicRoute } from '@/components/shared/route-guards';
import LoginPage from '@/features/auth/LoginPage';
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage.tsx'));
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage.tsx'));
import DashboardPage from '@/features/dashboard/DashboardPage';
import InstancesPage from '@/features/instances/InstancesPage';
import InstanceDetailPage from '@/features/instances/InstanceDetailPage';
const SnapshotArchivesPage = lazy(() => import('./features/instances/SnapshotArchivesPage.tsx'));
import ConsolePage from '@/features/console/ConsolePage';
const NodeShellPage = lazy(() => import('./features/console/NodeShellPage.tsx'));

// Lazy-loaded pages
// NOTE: явные относительные пути с расширением .tsx — обход бага rolldown-vite
// (vite 8.0.5), который не добавляет расширение для dynamic import() с alias '@/'.
const CreateInstanceWizard = lazy(() => import('./features/instances/CreateInstanceWizard.tsx'));
const NodesPage = lazy(() => import('./features/nodes/NodesPage.tsx'));
const NodeDetailPage = lazy(() => import('./features/nodes/NodeDetailPage.tsx'));
const ClusterPage = lazy(() => import('./features/cluster/ClusterPage.tsx'));
const TemplatesPage = lazy(() => import('./features/templates/TemplatesPage.tsx'));
const ImagesPage = lazy(() => import('./features/images/ImagesPage.tsx'));
const BackupsPage = lazy(() => import('./features/backups/BackupsPage.tsx'));
const TasksPage = lazy(() => import('./features/tasks/TasksPage.tsx'));
const IPAMDashboardPage = lazy(() => import('./features/ipam/IPAMDashboardPage.tsx'));
const IPAMNetworksPage = lazy(() => import('./features/ipam/IPAMNetworksPage.tsx'));
const IPAMNetworkDetailPage = lazy(() => import('./features/ipam/IPAMNetworkDetailPage.tsx'));
const IPAMAllocationsPage = lazy(() => import('./features/ipam/IPAMAllocationsPage.tsx'));
const IPAMHistoryPage = lazy(() => import('./features/ipam/IPAMHistoryPage.tsx'));
const IPAMToolsPage = lazy(() => import('./features/ipam/IPAMToolsPage.tsx'));
const UsersPage = lazy(() => import('./features/users/UsersPage.tsx'));
const WorkspacesPage = lazy(() => import('./features/workspaces/WorkspacesPage.tsx'));
const LogsPage = lazy(() => import('./features/logs/LogsPage.tsx'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage.tsx'));

function LazyFallback() {
  return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading…</div>;
}

function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LazyFallback />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <SuspenseWrap><ForgotPasswordPage /></SuspenseWrap> },
          { path: '/reset-password', element: <SuspenseWrap><ResetPasswordPage /></SuspenseWrap> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      // Console — separate layout (no sidebar)
      {
        path: '/console/node/:serverId/:node',
        element: <ConsoleLayout />,
        children: [{ index: true, element: <SuspenseWrap><NodeShellPage /></SuspenseWrap> }],
      },
      {
        path: '/console/:serverId/:vmid',
        element: <ConsoleLayout />,
        children: [{ index: true, element: <ConsolePage /> }],
      },
      // Main app layout
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/instances', element: <InstancesPage /> },
          { path: '/instances/create', element: <SuspenseWrap><CreateInstanceWizard /></SuspenseWrap> },
          { path: '/instances/snapshot-archives', element: <SuspenseWrap><SnapshotArchivesPage /></SuspenseWrap> },
          { path: '/instances/:serverId/:vmid', element: <InstanceDetailPage /> },
          { path: '/nodes', element: <SuspenseWrap><NodesPage /></SuspenseWrap> },
          { path: '/nodes/:serverId', element: <SuspenseWrap><NodeDetailPage /></SuspenseWrap> },
          { path: '/cluster', element: <SuspenseWrap><ClusterPage /></SuspenseWrap> },
          { path: '/templates', element: <SuspenseWrap><TemplatesPage /></SuspenseWrap> },
          { path: '/images', element: <SuspenseWrap><ImagesPage /></SuspenseWrap> },
          { path: '/backups', element: <SuspenseWrap><BackupsPage /></SuspenseWrap> },
          { path: '/tasks', element: <SuspenseWrap><TasksPage /></SuspenseWrap> },
          { path: '/ipam', element: <SuspenseWrap><IPAMDashboardPage /></SuspenseWrap> },
          { path: '/ipam/networks', element: <SuspenseWrap><IPAMNetworksPage /></SuspenseWrap> },
          { path: '/ipam/network/:id', element: <SuspenseWrap><IPAMNetworkDetailPage /></SuspenseWrap> },
          { path: '/ipam/allocations', element: <SuspenseWrap><IPAMAllocationsPage /></SuspenseWrap> },
          { path: '/ipam/history', element: <SuspenseWrap><IPAMHistoryPage /></SuspenseWrap> },
          { path: '/ipam/tools', element: <SuspenseWrap><IPAMToolsPage /></SuspenseWrap> },
          { path: '/networks', element: <SuspenseWrap><IPAMNetworksPage /></SuspenseWrap> },
          { path: '/users', element: <SuspenseWrap><UsersPage /></SuspenseWrap> },
          { path: '/workspaces', element: <SuspenseWrap><WorkspacesPage /></SuspenseWrap> },
          { path: '/logs', element: <SuspenseWrap><LogsPage /></SuspenseWrap> },
          { path: '/settings', element: <SuspenseWrap><SettingsPage /></SuspenseWrap> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
