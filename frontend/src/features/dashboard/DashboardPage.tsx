import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Server,
  Monitor,
  Container,
  AlertTriangle,
  Cpu,
  MemoryStick,
  HardDrive,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';
import { getTasksWebSocket } from '@/lib/websocket';

// ==================== Stat Card ====================
interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}

function StatCard({ label, value, subtitle, icon: Icon, color = 'text-primary' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Resource Card ====================
interface ResourceCardProps {
  label: string;
  percent: number;
  used: string;
  total: string;
  icon: React.ComponentType<{ className?: string }>;
}

function ResourceCard({ label, percent, used, total, icon: Icon }: ResourceCardProps) {
  const barColor =
    percent >= 90 ? 'bg-red' : percent >= 70 ? 'bg-amber' : 'bg-green';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="mb-2 text-2xl font-bold tabular-nums">{percent.toFixed(1)}%</p>
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {used} / {total}
        </p>
      </CardContent>
    </Card>
  );
}

// ==================== Activity Item ====================
interface ActivityItem {
  time: string;
  user?: string;
  action: string;
  resource?: string;
  type?: string;
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const { t } = useTranslation();
  const typeColor: Record<string, string> = {
    success: 'bg-green/20 text-green',
    error: 'bg-red/20 text-red',
    warning: 'bg-amber/20 text-amber',
    info: 'bg-blue/20 text-blue',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{t('dashboard.recent_activity', 'Recent Activity')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('common.no_data', 'No recent activity')}</p>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground font-mono tabular-nums">
                {item.time}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-muted-foreground">{item.user && `${item.user} `}</span>
                <span>{item.action}</span>
                {item.resource && (
                  <span className="font-medium"> {item.resource}</span>
                )}
              </div>
              {item.type && (
                <Badge variant="secondary" className={`shrink-0 text-[10px] ${typeColor[item.type] ?? ''}`}>
                  {item.type}
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Format Helpers ====================
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ==================== Dashboard Page ====================
export default function DashboardPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Fetch all resources
  const { data: resources } = useQuery({
    queryKey: ['resources'],
    queryFn: () => apiClient.get<Record<string, unknown>>('/proxmox/api/resources/all'),
    refetchInterval: 15000,
  });

  // Fetch alerts
  const { data: alerts } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => apiClient.get<{ alerts: unknown[]; count: number }>('/api/dashboard/alerts'),
    refetchInterval: 60000,
  });

  // Fetch recent activity from audit logs
  const { data: recentLogs } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: () => apiClient.get<{ items: Array<{ timestamp: string; username?: string; message: string; category?: string; level?: string }> }>('/logs/api/logs?limit=10'),
    refetchInterval: 30000,
  });

  // Subscribe to WebSocket 'dashboard_metrics' for real-time updates
  useEffect(() => {
    const ws = getTasksWebSocket();
    if (!ws.isConnected) ws.connect();
    const unsub = ws.subscribe('dashboard_metrics', (data: unknown) => {
      const payload = data as { data?: Record<string, unknown> };
      if (payload?.data) {
        qc.setQueryData(['resources'], payload.data);
      }
    });
    return unsub;
  }, [qc]);

  // Parse resource data — API returns { servers: [{vms, containers, nodes}], total_vms, total_containers }
  const serverList = ((resources as Record<string, unknown>)?.servers as Array<Record<string, unknown>>) ?? [];
  const allVMs = serverList.flatMap((s) => [
    ...((s.vms as Array<Record<string, unknown>>) ?? []),
    ...((s.containers as Array<Record<string, unknown>>) ?? []),
  ]);

  const nodesOnline = serverList.filter((s) => !s.error).length;
  const qemuVMs = allVMs.filter((v) => v.type === 'qemu');
  const lxcCTs = allVMs.filter((v) => v.type === 'lxc');
  const runningVMs = qemuVMs.filter((v) => v.status === 'running').length;
  const runningCTs = lxcCTs.filter((v) => v.status === 'running').length;

  // Aggregate resource metrics from node-level data (WS) or fallback to VM-level
  const nodeStats = serverList.flatMap((s) => (s.nodes as Array<Record<string, unknown>>) ?? []);
  let cpuPercent = 0;
  let cpuUsedLabel = '';
  let cpuTotalLabel = '';
  let memPercent = 0;
  let memUsedLabel = '';
  let memTotalLabel = '';
  let diskPercent = 0;
  let diskUsedLabel = '';
  let diskTotalLabel = '';

  if (nodeStats.length > 0) {
    // Use precise node-level stats from WebSocket metrics
    cpuPercent = nodeStats.reduce((s, n) => s + (Number(n.cpu_pct) || 0), 0) / nodeStats.length;
    cpuUsedLabel = `${cpuPercent.toFixed(1)}%`;
    cpuTotalLabel = `${nodeStats.length} nodes`;
    memPercent = nodeStats.reduce((s, n) => s + (Number(n.ram_pct) || 0), 0) / nodeStats.length;
    memUsedLabel = `${memPercent.toFixed(1)}%`;
    memTotalLabel = `${nodeStats.length} nodes`;
    diskPercent = nodeStats.reduce((s, n) => s + (Number(n.disk_pct) || 0), 0) / nodeStats.length;
    diskUsedLabel = `${diskPercent.toFixed(1)}%`;
    diskTotalLabel = `${nodeStats.length} nodes`;
  } else {
    // Fallback: aggregate from VM data
    const totalCPU = allVMs.reduce((s, v) => s + (Number(v.maxcpu) || 0), 0);
    const usedCPU = allVMs.reduce((s, v) => s + (Number(v.cpu) || 0) * (Number(v.maxcpu) || 0), 0);
    cpuPercent = totalCPU > 0 ? (usedCPU / totalCPU) * 100 : 0;
    cpuUsedLabel = `${usedCPU.toFixed(1)} cores`;
    cpuTotalLabel = `${totalCPU} cores`;

    const totalMem = allVMs.reduce((s, v) => s + (Number(v.maxmem) || 0), 0);
    const usedMem = allVMs.reduce((s, v) => s + (Number(v.mem) || 0), 0);
    memPercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;
    memUsedLabel = formatBytes(usedMem);
    memTotalLabel = formatBytes(totalMem);

    const totalDisk = allVMs.reduce((s, v) => s + (Number(v.maxdisk) || 0), 0);
    const usedDisk = allVMs.reduce((s, v) => s + (Number(v.disk) || 0), 0);
    diskPercent = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;
    diskUsedLabel = formatBytes(usedDisk);
    diskTotalLabel = formatBytes(totalDisk);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-semibold">{t('dashboard.title', 'Dashboard')}</h1>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.nodes', 'Nodes')}
          value={serverList.length}
          subtitle={`${nodesOnline} online`}
          icon={Server}
        />
        <StatCard
          label={t('dashboard.virtual_machines', 'Virtual Machines')}
          value={qemuVMs.length}
          subtitle={`${runningVMs} running`}
          icon={Monitor}
          color="text-blue"
        />
        <StatCard
          label={t('dashboard.containers', 'Containers')}
          value={lxcCTs.length}
          subtitle={`${runningCTs} running`}
          icon={Container}
          color="text-green"
        />
        <StatCard
          label={t('dashboard.alerts', 'Alerts')}
          value={alerts?.count ?? 0}
          icon={AlertTriangle}
          color="text-amber"
        />
      </div>

      {/* Resource Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ResourceCard
          label={t('common.cpu')}
          percent={cpuPercent}
          used={cpuUsedLabel}
          total={cpuTotalLabel}
          icon={Cpu}
        />
        <ResourceCard
          label={t('dashboard.memory', 'Memory')}
          percent={memPercent}
          used={memUsedLabel}
          total={memTotalLabel}
          icon={MemoryStick}
        />
        <ResourceCard
          label={t('dashboard.storage', 'Storage')}
          percent={diskPercent}
          used={diskUsedLabel}
          total={diskTotalLabel}
          icon={HardDrive}
        />
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent instances */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{t('dashboard.instances', 'Instances')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allVMs.slice(0, 6).map((vm, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      vm.status === 'running' ? 'bg-green' : 'bg-muted-foreground'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {String(vm.name ?? `VM ${vm.vmid}`)}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {String(vm.type ?? 'vm').toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{String(vm.node ?? '')}</span>
                </div>
              ))}
              {allVMs.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity */}
        <ActivityFeed items={(recentLogs?.items ?? []).map((log) => {
          const d = new Date(log.timestamp);
          return {
            time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
            user: log.username,
            action: log.message,
            type: log.level === 'ERROR' ? 'error' : log.level === 'WARNING' ? 'warning' : log.category === 'auth' ? 'info' : 'success',
          };
        })} />
      </div>
    </div>
  );
}
