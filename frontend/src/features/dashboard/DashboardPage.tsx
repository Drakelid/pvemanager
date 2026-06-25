import { useEffect, useState } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts'
import { apiClient } from '@/lib/api-client'
import { getTasksWebSocket } from '@/lib/websocket'
import { useInstancesMetricsSync } from '@/hooks/use-instances'
import { useAllTasks, useActiveTaskCount } from '@/hooks/use-tasks'
import { useIPAMNetworks } from '@/hooks/use-ipam'
import { useNodeRrddata } from '@/hooks/use-nodes'

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']

type Rec = Record<string, unknown>

// ==================== Helpers ====================
function barColor(pct: number) {
  return pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
}

function gaugeStroke(pct: number) {
  return pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
}

// ==================== Resource Bar ====================
function ResourceBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ==================== SVG Circular Gauge ====================
function CircularGauge({ label, value }: { label: string; value: number }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const clamped = Math.min(Math.max(value, 0), 100)
  const offset = circ * (1 - clamped / 100)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-[68px] h-[68px]">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
          <circle
            cx="36" cy="36" r={r}
            fill="none" stroke={gaugeStroke(value)} strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-bold tabular-nums">{Math.round(clamped)}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground tracking-wide">{label}</span>
    </div>
  )
}

// ==================== Cluster Overview Card ====================
function ClusterOverviewCard({ serverList, nodeStats, allVMs, memPercent, diskPercent, availableIPs }: {
  serverList: Rec[]; nodeStats: Rec[]; allVMs: Rec[]
  memPercent: number; diskPercent: number; availableIPs: number
}) {
  const clusterName =
    (serverList[0]?.cluster_name as string) ||
    (serverList[0]?.server_name as string) ||
    'Кластер'
  const totalVMs = allVMs.filter(v => v.type === 'qemu').length
  const totalCTs = allVMs.filter(v => v.type === 'lxc').length
  const totalNodeMem = nodeStats.reduce((s, n) => s + (Number(n.maxmem) || 0), 0)
  const totalVMMem = allVMs.reduce((s, v) => s + (Number(v.maxmem) || 0), 0)
  const overselling = (totalNodeMem > 0 ? totalVMMem / totalNodeMem : 1).toFixed(1)

  const cols = availableIPs > 0 ? 'grid-cols-3' : 'grid-cols-2'

  return (
    <Card className="h-full">
      <CardContent className="p-5 flex flex-col gap-4 h-full">
        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-1.5 group text-left">
            <span className="text-base font-semibold group-hover:text-primary transition-colors">{clusterName}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className={`grid ${cols} gap-4`}>
          {availableIPs > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">IPv4 доступно</p>
              <p className="text-3xl font-bold tabular-nums text-green-400">{availableIPs.toLocaleString()}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Узлов</p>
            <p className="text-3xl font-bold tabular-nums">{nodeStats.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">VM</p>
            <p className="text-3xl font-bold tabular-nums">{totalVMs + totalCTs}</p>
          </div>
        </div>

        <div className="space-y-2.5 flex-1">
          <ResourceBar label="RAM" percent={memPercent} />
          <ResourceBar label="Storage" percent={diskPercent} />
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-muted-foreground">
            Оверселлинг RAM = <span className="text-foreground font-medium">{overselling}</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <ExternalLink className="h-3 w-3" /> Grafana
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ==================== Tasks Today Card ====================
function TasksTodayCard() {
  const { data: tasksData } = useAllTasks({ limit: 500 })
  const { data: activeData } = useActiveTaskCount()

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const startTs = startOfDay.getTime() / 1000

  const all = tasksData?.tasks ?? []
  const today = all.filter(t => {
    if (t.created_at) return new Date(t.created_at) >= startOfDay
    if (t.starttime != null) return Number(t.starttime) >= startTs
    return false
  })

  const completed = today.filter(t =>
    t.exitstatus === 'OK' || t.status === 'ok' || t.status === 'completed'
  ).length
  const running = activeData?.count ?? today.filter(t => t.started_at && !t.completed_at && !t.endtime).length
  const queued = today.filter(t => t.status === 'queued' || t.status === 'pending').length
  const errors = today.filter(t =>
    t.exitstatus === 'ERROR' || t.status === 'error' || t.status === 'failed'
  ).length

  const rows = [
    { label: 'Выполнено:', value: completed, red: false },
    { label: 'Выполняются:', value: running, red: false },
    { label: 'В очереди:', value: queued, red: false },
    { label: 'Ошибки:', value: errors, red: errors > 0 },
  ]

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-5 px-5">
        <CardTitle className="text-sm font-semibold">Задачи за сутки</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-2.5">
        {rows.map(({ label, value, red }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className={`text-sm font-semibold tabular-nums ${red ? 'text-red-500' : ''}`}>{value}</span>
          </div>
        ))}
        <div className="border-t border-border pt-2.5 flex items-center justify-between">
          <span className="text-sm font-medium">Всего</span>
          <span className="text-sm font-bold tabular-nums">{today.length}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ==================== Node Stats Card ====================
function NodeStatsCard({ cpuPercent, memPercent, serverName, serverCount }: {
  cpuPercent: number; memPercent: number; serverName: string; serverCount: number
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-5 px-5">
        <CardTitle className="text-sm font-semibold truncate">{serverName || 'Сервер'}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        <div className="flex justify-around">
          <CircularGauge label="CPU, %" value={cpuPercent} />
          <CircularGauge label="RAM" value={memPercent} />
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Серверов:</span>
            <span className="font-medium">{serverCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Платформа:</span>
            <span className="font-medium">Proxmox VE</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ==================== Cluster Nodes Section ====================
function ClusterNodesSection({ serverList, nodeStats }: { serverList: Rec[]; nodeStats: Rec[] }) {
  const [tab, setTab] = useState<'now' | 'day'>('now')
  const timeframe = tab === 'now' ? 'hour' : 'day'

  // Top-5 nodes by disk% for chart data
  const chartNodes = [...nodeStats]
    .sort((a, b) => (Number(b.disk_pct) || 0) - (Number(a.disk_pct) || 0))
    .slice(0, 5)

  // Fetch RRD for each of those nodes in parallel
  const rrdResults = useQueries({
    queries: chartNodes.map(n => ({
      queryKey: ['node-rrd', Number(n.server_id) || 0, String(n.node || ''), timeframe],
      queryFn: () =>
        apiClient.get<Rec[]>(
          `/proxmox/api/${n.server_id}/node/rrddata?node=${n.node}&timeframe=${timeframe}`
        ),
      enabled: !!n.server_id && !!n.node,
    })),
  })

  // Align series by index (all PVE nodes produce same-length RRD arrays)
  const baseData = (rrdResults[0]?.data as Rec[]) ?? []
  const chartData = baseData.map((d, i) => {
    const point: Rec = {
      t: new Date((Number(d.time) || 0) * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
    }
    chartNodes.forEach((n, j) => {
      const row = ((rrdResults[j]?.data as Rec[]) ?? [])[i]
      if (row) {
        point[`n${j}`] = +(
          ((Number(row.diskread) || 0) + (Number(row.diskwrite) || 0)) / 1_048_576
        ).toFixed(2)
      }
    })
    return point
  })

  const sorted = [...nodeStats]
    .sort((a, b) =>
      tab === 'now'
        ? (Number(b.cpu_pct) || 0) - (Number(a.cpu_pct) || 0)
        : (Number(b.disk_pct) || 0) - (Number(a.disk_pct) || 0)
    )
    .slice(0, 10)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Node table */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-sm font-semibold">Узлы кластера</CardTitle>
            <div className="flex gap-1">
              {(['now', 'day'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tab === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'now' ? 'Топ-10 сейчас' : 'Топ-10 за сутки'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-[1fr_56px_56px_56px] gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
            <span>Название узлов</span>
            <span className="text-right">CPU, %</span>
            <span className="text-right">RAM</span>
            <span className="text-right">Disk</span>
          </div>
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Нет данных</p>
          ) : (
            sorted.map((n, i) => {
              const cpu = Number(n.cpu_pct) || 0
              const ram = Number(n.ram_pct) || 0
              const disk = Number(n.disk_pct) || 0
              const online = n.status !== 'offline'
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_56px_56px_56px] gap-2 items-center px-2 py-2 rounded hover:bg-muted/40 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-green-500' : 'bg-red-400'}`} />
                    <span className="truncate">{String(n.node || n.name || `node-${i + 1}`)}</span>
                    {n.server_name && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        #{String(n.server_name)}
                      </span>
                    )}
                  </div>
                  <span className={`text-right tabular-nums text-xs font-medium ${cpu >= 90 ? 'text-red-400' : cpu >= 70 ? 'text-amber-400' : ''}`}>
                    {cpu.toFixed(0)}
                  </span>
                  <span className={`text-right tabular-nums text-xs ${ram >= 90 ? 'text-red-400' : ram >= 70 ? 'text-amber-400' : ''}`}>
                    {ram.toFixed(0)}
                  </span>
                  <span className="text-right tabular-nums text-xs text-muted-foreground">{disk.toFixed(0)}</span>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Disk stats chart — Grafana style, one line per node */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">ТОП статистика по диску</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-4">
          {chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
              {chartNodes.length > 0 ? 'Загрузка...' : 'Нет данных'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  {chartNodes.map((_, j) => (
                    <linearGradient key={j} id={`g${j}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[j % CHART_COLORS.length]} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART_COLORS[j % CHART_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false} axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false} axisLine={false}
                  unit=" MB"
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number, _: string, props: { dataKey?: string }) => {
                    const idx = Number(String(props.dataKey ?? '').replace('n', ''))
                    const name = String(chartNodes[idx]?.node ?? `node-${idx}`)
                    return [`${v} MB/s`, name]
                  }}
                />
                <Legend
                  formatter={(_, entry) => {
                    const idx = Number(String((entry as { dataKey?: string }).dataKey ?? '').replace('n', ''))
                    return <span style={{ fontSize: 11 }}>{String(chartNodes[idx]?.node ?? `node-${idx}`)}</span>
                  }}
                  iconType="line"
                  iconSize={10}
                />
                {chartNodes.map((_, j) => (
                  <Area
                    key={j}
                    type="monotone"
                    dataKey={`n${j}`}
                    stroke={CHART_COLORS[j % CHART_COLORS.length]}
                    fill={`url(#g${j})`}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== Dashboard Page ====================
export default function DashboardPage() {
  const qc = useQueryClient()
  const liveMetrics = useInstancesMetricsSync()
  const { data: ipamNetworks } = useIPAMNetworks()

  const { data: resources } = useQuery({
    queryKey: ['resources'],
    queryFn: () => apiClient.get<Rec>('/proxmox/api/resources/all'),
    refetchInterval: 15000,
  })

  useEffect(() => {
    const ws = getTasksWebSocket()
    if (!ws.isConnected) ws.connect()
    const unsub = ws.subscribe('dashboard_metrics', (data: unknown) => {
      const payload = data as { data?: Rec }
      if (payload?.data) qc.setQueryData(['resources'], payload.data)
    })
    return unsub
  }, [qc])

  const serverList = ((resources as Rec)?.servers as Rec[]) ?? []

  const allVMs = serverList.flatMap(s =>
    [...((s.vms as Rec[]) ?? []), ...((s.containers as Rec[]) ?? [])].map(v => {
      const live = liveMetrics.get(`${s.id}:${v.vmid}`)
      return live
        ? { ...v, cpu: live.cpu ?? v.cpu, mem: live.mem ?? v.mem, status: live.status ?? v.status }
        : v
    })
  )

  const nodeStats = serverList.flatMap(s =>
    ((s.nodes as Rec[]) ?? []).map(n => ({
      ...n,
      server_name: s.server_name,
      server_id: s.id,
    }))
  )

  let cpuPercent = 0, memPercent = 0, diskPercent = 0
  if (nodeStats.length > 0) {
    cpuPercent = nodeStats.reduce((s, n) => s + (Number(n.cpu_pct) || 0), 0) / nodeStats.length
    memPercent = nodeStats.reduce((s, n) => s + (Number(n.ram_pct) || 0), 0) / nodeStats.length
    diskPercent = nodeStats.reduce((s, n) => s + (Number(n.disk_pct) || 0), 0) / nodeStats.length
  } else {
    const tm = allVMs.reduce((s, v) => s + (Number(v.maxmem) || 0), 0)
    const um = allVMs.reduce((s, v) => s + (Number(v.mem) || 0), 0)
    memPercent = tm > 0 ? (um / tm) * 100 : 0
    const td = allVMs.reduce((s, v) => s + (Number(v.maxdisk) || 0), 0)
    const ud = allVMs.reduce((s, v) => s + (Number(v.disk) || 0), 0)
    diskPercent = td > 0 ? (ud / td) * 100 : 0
    const tc = allVMs.reduce((s, v) => s + (Number(v.maxcpu) || 0), 0)
    const uc = allVMs.reduce((s, v) => s + (Number(v.cpu) || 0) * (Number(v.maxcpu) || 0), 0)
    cpuPercent = tc > 0 ? (uc / tc) * 100 : 0
  }

  const availableIPs = (ipamNetworks ?? []).reduce((s, n) => s + (n.available_ips ?? 0), 0)
  const serverName =
    (serverList[0]?.cluster_name as string) ||
    (serverList[0]?.server_name as string) ||
    ''

  return (
    <div className="space-y-4">
      {/* Top row: cluster overview | tasks | node stats */}
      <div className="grid gap-4 lg:grid-cols-[1fr_220px_210px]">
        <ClusterOverviewCard
          serverList={serverList}
          nodeStats={nodeStats}
          allVMs={allVMs}
          memPercent={memPercent}
          diskPercent={diskPercent}
          availableIPs={availableIPs}
        />
        <TasksTodayCard />
        <NodeStatsCard
          cpuPercent={cpuPercent}
          memPercent={memPercent}
          serverName={serverName}
          serverCount={serverList.length}
        />
      </div>

      {/* Bottom row: nodes table + disk chart */}
      <ClusterNodesSection serverList={serverList} nodeStats={nodeStats} />
    </div>
  )
}
