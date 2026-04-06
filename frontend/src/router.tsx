import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import ConsoleLayout from '@/layouts/ConsoleLayout';
import { ProtectedRoute, PublicRoute } from '@/components/shared/route-guards';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import InstancesPage from '@/features/instances/InstancesPage';
import InstanceDetailPage from '@/features/instances/InstanceDetailPage';
import ConsolePage from '@/features/console/ConsolePage';

// Lazy-loaded pages
const CreateInstanceWizard = lazy(() => import('@/features/instances/CreateInstanceWizard'));
const NodesPage = lazy(() => import('@/features/nodes/NodesPage'));
const NodeDetailPage = lazy(() => import('@/features/nodes/NodeDetailPage'));
const TemplatesPage = lazy(() => import('@/features/templates/TemplatesPage'));
const BackupsPage = lazy(() => import('@/features/backups/BackupsPage'));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'));
const IPAMDashboardPage = lazy(() => import('@/features/ipam/IPAMDashboardPage'));
const IPAMNetworksPage = lazy(() => import('@/features/ipam/IPAMNetworksPage'));
const IPAMNetworkDetailPage = lazy(() => import('@/features/ipam/IPAMNetworkDetailPage'));
const IPAMAllocationsPage = lazy(() => import('@/features/ipam/IPAMAllocationsPage'));
const IPAMHistoryPage = lazy(() => import('@/features/ipam/IPAMHistoryPage'));
const UsersPage = lazy(() => import('@/features/users/UsersPage'));
const WorkspacesPage = lazy(() => import('@/features/workspaces/WorkspacesPage'));
const LogsPage = lazy(() => import('@/features/logs/LogsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

function LazyFallback() {
  return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading…</div>;
}

function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LazyFallback />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <PublicRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ index: true, element: <LoginPage /> }],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      // Console — separate layout (no sidebar)
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
          { path: '/instances/:serverId/:vmid', element: <InstanceDetailPage /> },
          { path: '/nodes', element: <SuspenseWrap><NodesPage /></SuspenseWrap> },
          { path: '/nodes/:serverId', element: <SuspenseWrap><NodeDetailPage /></SuspenseWrap> },
          { path: '/templates', element: <SuspenseWrap><TemplatesPage /></SuspenseWrap> },
          { path: '/backups', element: <SuspenseWrap><BackupsPage /></SuspenseWrap> },
          { path: '/tasks', element: <SuspenseWrap><TasksPage /></SuspenseWrap> },
          { path: '/ipam', element: <SuspenseWrap><IPAMDashboardPage /></SuspenseWrap> },
          { path: '/ipam/networks', element: <SuspenseWrap><IPAMNetworksPage /></SuspenseWrap> },
          { path: '/ipam/network/:id', element: <SuspenseWrap><IPAMNetworkDetailPage /></SuspenseWrap> },
          { path: '/ipam/allocations', element: <SuspenseWrap><IPAMAllocationsPage /></SuspenseWrap> },
          { path: '/ipam/history', element: <SuspenseWrap><IPAMHistoryPage /></SuspenseWrap> },
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
