import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  Plus,
  Search,
  Play,
  Square,
  Trash2,
  MoreHorizontal,
  Terminal,
  RotateCcw,
  Camera,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Container,
  Loader2,
  Power,
  Copy,
  Sparkles,
  KeyRound,
  FileText,
  Disc,
} from 'lucide-react';
import InstanceActionDialogs, { PowerConfirmDialog, type InstanceAction, type PowerAction } from './InstanceActionDialogs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusDot } from '@/components/shared/status-dot';
import { useVirtualMachines, useBulkOperation, usePowerAction, useVMStatusSync, useInstancesMetricsSync } from '@/hooks/use-instances';
import { useServers } from '@/hooks/use-nodes';
import { formatBytes, vmTypeLabel, formatUptime } from '@/lib/format';
import { apiClient } from '@/lib/api-client';
import { useDeployTasksStore } from '@/stores/deploy-tasks-store';
import type { VMInstance } from '@/types';
import { toast } from 'sonner';

// ==================== Inline Progress Bar ====================
function InlineProgress({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 w-16 overflow-hidden rounded-full bg-muted ${className}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ==================== Circular Progress ====================
function CircularProgress({ value }: { value: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
      <circle
        cx="14" cy="14" r={r} fill="none"
        stroke="currentColor" strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-blue-500 transition-all duration-500"
        transform="rotate(-90 14 14)"
      />
    </svg>
  );
}

// ==================== Row Action Menu ====================
function RowActionMenu({ vm }: { vm: VMInstance }) {
  const { t } = useTranslation();
  const power = usePowerAction(vm.server_id!, vm.vmid, vm.type, vm.node);
  const isRunning = vm.status === 'running';
  const isQemu = vm.type === 'qemu';
  const [dialog, setDialog] = useState<InstanceAction>(null);
  const [pendingPower, setPendingPower] = useState<PowerAction | null>(null);

  const handleAction = (action: string) => {
    setPendingPower(action as PowerAction);
  };

  const confirmPower = () => {
    if (!pendingPower) return;
    power.mutate(
      { action: pendingPower },
      {
        onSuccess: () => {
          toast.success(`${pendingPower} sent for ${vm.name || vm.vmid}`);
          setPendingPower(null);
        },
        onError: (err) => {
          toast.error(err.message);
          setPendingPower(null);
        },
      }
    );
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem render={<Link to={`/console/${vm.server_id}/${vm.vmid}?node=${vm.node}&type=${vm.type}`} target="_blank" rel="noopener noreferrer" />}>
            <Terminal className="mr-2 h-4 w-4" /> {t('common.console', 'Console')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {!isRunning ? (
          <DropdownMenuItem onClick={() => handleAction('start')}>
            <Play className="mr-2 h-4 w-4" /> {t('common.start', 'Start')}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={() => handleAction('restart')}>
              <RotateCcw className="mr-2 h-4 w-4" /> {t('common.restart', 'Restart')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('shutdown')}>
              <Power className="mr-2 h-4 w-4" /> {t('common.shutdown', 'Shutdown')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('stop')}>
              <Square className="mr-2 h-4 w-4" /> {t('common.stop', 'Stop')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setDialog('clone')}>
          <Copy className="mr-2 h-4 w-4" /> {t('common.clone', 'Клонировать')}
        </DropdownMenuItem>
        {isQemu && (
          <DropdownMenuItem onClick={() => setDialog('iso')}>
            <Disc className="mr-2 h-4 w-4" /> {t('common.iso', 'ISO образ')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setDialog('change-password')}>
          <KeyRound className="mr-2 h-4 w-4" /> {t('common.changePassword', 'Изменить пароль')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDialog('notes')}>
          <FileText className="mr-2 h-4 w-4" /> {t('common.notes', 'Примечание')}
        </DropdownMenuItem>
        {isQemu && (
          <DropdownMenuItem onClick={() => setDialog('execute')}>
            <Terminal className="mr-2 h-4 w-4" /> {t('common.runCommand', 'Запуск команд')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to={`/instances/${vm.server_id}/${vm.vmid}?node=${vm.node}&type=${vm.type}&tab=snapshots`} />}>
            <Camera className="mr-2 h-4 w-4" /> {t('common.snapshots', 'Snapshots')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDialog('reinstall')}>
          <Sparkles className="mr-2 h-4 w-4" /> {t('common.reinstall', 'Переустановить')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <InstanceActionDialogs
      open={dialog}
      onOpenChange={setDialog}
      serverId={vm.server_id!}
      vmid={vm.vmid}
      type={vm.type}
      node={vm.node}
      name={vm.name}
      description={vm.description}
    />
    <PowerConfirmDialog
      open={pendingPower !== null}
      onClose={() => setPendingPower(null)}
      onConfirm={confirmPower}
      action={pendingPower}
      vmName={vm.name}
      isPending={power.isPending}
    />
    </>
  );
}

// ==================== Instances Page ====================
export default function InstancesPage() {
  const { t } = useTranslation();
  const { data: vms, isLoading } = useVirtualMachines();
  useVMStatusSync();
  const metricsMap = useInstancesMetricsSync();
  const bulkOp = useBulkOperation();

  // ── Deploy task polling ──────────────────────────────────────────
  const { tasks: deployTasks, updateTask, removeTask } = useDeployTasksStore();
  const activeTasks = deployTasks.filter((t) => t.status === 'pending' || t.status === 'running');

  useEffect(() => {
    if (activeTasks.length === 0) return;
    const poll = async () => {
      for (const task of activeTasks) {
        try {
          const data = await apiClient.get<{
            id: number; status: string; step: string | null; progress: number;
            vmid: number | null; node: string | null; error_message: string | null;
          }>(`/templates/api/deploy/${task.id}`);
          updateTask(task.id, {
            status: data.status as 'pending' | 'running' | 'completed' | 'failed',
            step: data.step,
            progress: data.progress,
            vmid: data.vmid ?? undefined,
            node: data.node ?? undefined,
            error_message: data.error_message ?? undefined,
          });
          if (data.status === 'completed') {
            setTimeout(() => removeTask(task.id), 5000);
          }
        } catch { /* ignore */ }
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks.length, activeTasks.map((t) => t.id).join(',')]);

  const { data: servers = [] } = useServers();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [nodeFilter, setNodeFilter] = useState<string>(() => {
    return localStorage.getItem('instances-node-filter') ?? 'all';
  });
  const [typeTab, setTypeTab] = useState<string>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Filter real VMs
  const filteredVMs = useMemo(() => {
    if (!vms) return [];
    return vms.filter((vm) => {
      if (typeTab === 'vm' && vm.type !== 'qemu') return false;
      if (typeTab === 'lxc' && vm.type !== 'lxc') return false;
      if (statusFilter !== 'all' && vm.status !== statusFilter) return false;
      if (serverFilter !== 'all' && vm.server_id !== Number(serverFilter)) return false;
      if (nodeFilter !== 'all' && vm.node !== nodeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (vm.name || '').toLowerCase();
        const ip = (vm.ip_address || '').toLowerCase();
        const vmid = String(vm.vmid);
        if (!name.includes(q) && !ip.includes(q) && !vmid.includes(q)) return false;
      }
      return true;
    });
  }, [vms, typeTab, statusFilter, serverFilter, nodeFilter, search]);

  // Ghost rows from active deploy/clone tasks (prepended before real VMs).
  // - reinstall / change_password tasks are NOT shown as ghosts (they live as overlays on real rows)
  // - clone/deploy tasks whose vmid is already present in real list are skipped (de-dupe)
  const ghostRows = useMemo<VMInstance[]>(() => {
    const realKey = new Set((vms ?? []).map((v) => `${v.server_id}:${v.vmid}`));
    return deployTasks
      .filter((t) => t.status === 'pending' || t.status === 'running')
      .filter((t) => {
        const k = t.kind ?? 'deploy';
        if (k !== 'deploy' && k !== 'clone') return false;
        if (t.vmid && t.server_id && realKey.has(`${t.server_id}:${t.vmid}`)) return false;
        return true;
      })
      .map((t) => ({
        vmid: t.vmid ?? 0,
        name: t.name,
        status: 'creating' as const,
        type: 'qemu' as const,
        node: t.node ?? '...',
        server_id: undefined,
        _deployTaskId: t.id,
      }));
  }, [deployTasks, vms]);

  // Map (server_id:vmid) -> active reinstall/change_password task (for inline overlay)
  const overlayByVm = useMemo(() => {
    const m = new Map<string, typeof deployTasks[number]>();
    for (const t of deployTasks) {
      if (t.status !== 'pending' && t.status !== 'running') continue;
      const k = t.kind ?? 'deploy';
      if (k !== 'reinstall' && k !== 'change_password') continue;
      if (!t.vmid || !t.server_id) continue;
      m.set(`${t.server_id}:${t.vmid}`, t);
    }
    return m;
  }, [deployTasks]);

  const allRows = useMemo<VMInstance[]>(() => [...ghostRows, ...filteredVMs], [ghostRows, filteredVMs]);

  // Merge live WS metrics into rows for real-time rendering
  const liveRows = useMemo<VMInstance[]>(() => {
    if (!metricsMap.size) return allRows;
    return allRows.map((vm) => {
      const live = metricsMap.get(`${vm.server_id}:${vm.vmid}`);
      if (!live) return vm;
      return {
        ...vm,
        status: (live.status as VMInstance['status']) ?? vm.status,
        cpu: live.cpu ?? vm.cpu,
        mem: live.mem ?? vm.mem,
        maxmem: live.maxmem ?? vm.maxmem,
        disk: live.disk ?? vm.disk,
        maxdisk: live.maxdisk ?? vm.maxdisk,
        uptime: live.uptime ?? vm.uptime,
        netin: live.netin ?? vm.netin,
        netout: live.netout ?? vm.netout,
      };
    });
  }, [allRows, metricsMap]);

  // Unique nodes for filter — scoped to selected server
  const uniqueNodes = useMemo(() => {
    if (!vms) return [];
    const source = serverFilter !== 'all'
      ? vms.filter((v) => v.server_id === Number(serverFilter))
      : vms;
    return [...new Set(source.map((v) => v.node))].sort();
  }, [vms, serverFilter]);

  // Counts (ghosts not counted in tabs)
  const counts = useMemo(() => {
    if (!vms) return { all: 0, vm: 0, lxc: 0 };
    return {
      all: vms.length,
      vm: vms.filter((v) => v.type === 'qemu').length,
      lxc: vms.filter((v) => v.type === 'lxc').length,
    };
  }, [vms]);

  // Selected real VMs (skip ghost rows by checking _deployTaskId)
  const selectedVMs = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((k) => rowSelection[k])
      .map((idx) => allRows[Number(idx)])
      .filter((vm) => vm && !vm._deployTaskId);
  }, [rowSelection, allRows]);

  const handleBulk = (action: string) => {
    if (!selectedVMs.length) return;
    bulkOp.mutate(
      {
        action,
        items: selectedVMs.map((vm) => ({
          server_id: vm.server_id!,
          vmid: vm.vmid,
          vm_type: vm.type,
          name: vm.name || String(vm.vmid),
          node: vm.node,
        })),
      },
      {
        onSuccess: () => { toast.success(`Bulk ${action}: ${selectedVMs.length} items queued`); setRowSelection({}); },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  // ==================== Table Columns ====================
  const columns = useMemo<ColumnDef<VMInstance>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => {
          const isGhost = !!row.original._deployTaskId;
          if (isGhost) return null;
          return (
            <input
              type="checkbox"
              className="rounded border-border"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          );
        },
        size: 32,
        enableSorting: false,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('common.name', 'Name')}
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const vm = row.original;
          const isGhost = !!vm._deployTaskId;
          if (isGhost) {
            const task = deployTasks.find((t) => t.id === vm._deployTaskId);
            return (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
                <div>
                  <span className="font-medium text-muted-foreground">{vm.name || 'New VM'}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {task?.node ? `· ${task.node}` : ''}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <Link
              to={`/instances/${vm.server_id}/${vm.vmid}?node=${vm.node}&type=${vm.type}`}
              className="group flex items-center gap-2"
            >
              <StatusDot status={vm.status} pulse />
              <div>
                <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {vm.name || `VM ${vm.vmid}`}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">#{vm.vmid}</span>
              </div>
            </Link>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('common.status', 'Status'),
        cell: ({ row }) => {
          const vm = row.original;
          const isGhost = !!vm._deployTaskId;
          if (isGhost) {
            const task = deployTasks.find((t) => t.id === vm._deployTaskId);
            const progress = task?.progress ?? 0;
            return (
              <div className="flex items-center gap-2">
                <CircularProgress value={progress} />
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-[10px]">
                  {t('instances.status_creating', 'Creating')}
                  {progress > 0 ? ` ${progress}%` : ''}
                </Badge>
              </div>
            );
          }
          const status = vm.status;
          const overlay = vm.server_id != null ? overlayByVm.get(`${vm.server_id}:${vm.vmid}`) : undefined;
          if (overlay) {
            const label = overlay.kind === 'reinstall'
              ? t('instances.status_reinstalling', 'Reinstalling')
              : t('instances.status_changing_password', 'Changing password');
            return (
              <div className="flex items-center gap-2">
                <CircularProgress value={overlay.progress ?? 0} />
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-[10px]">
                  {label}{(overlay.progress ?? 0) > 0 ? ` ${overlay.progress}%` : ''}
                </Badge>
              </div>
            );
          }
          return (
            <Badge
              variant="secondary"
              className={status === 'running' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}
            >
              {status}
            </Badge>
          );
        },
        size: 140,
      },
      {
        accessorKey: 'node',
        header: t('common.node', 'Node'),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
        size: 100,
      },
      {
        accessorKey: 'type',
        header: t('common.type', 'Type'),
        cell: ({ getValue }) => {
          const type = getValue<string>();
          const Icon = type === 'qemu' ? Monitor : Container;
          return (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Badge variant="outline" className="gap-1 font-normal">
                  <Icon className="h-3 w-3" />
                  {vmTypeLabel(type)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{type === 'qemu' ? 'QEMU Virtual Machine' : 'LXC Container'}</TooltipContent>
            </Tooltip>
          );
        },
        size: 80,
      },
      {
        id: 'ip',
        accessorKey: 'ip_address',
        header: 'IP',
        cell: ({ getValue }) => {
          const ip = getValue<string>();
          return ip ? (
            <span className="font-mono text-xs">{ip}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
        size: 130,
      },
      {
        id: 'cpu',
        header: 'CPU',
        cell: ({ row }) => {
          const vm = row.original;
          if (vm._deployTaskId) return <span className="text-xs text-muted-foreground">—</span>;
          if (!vm.cpu && vm.cpu !== 0) return <span className="text-xs text-muted-foreground">—</span>;
          return <InlineProgress value={vm.cpu * 100} max={100} />;
        },
        size: 120,
      },
      {
        id: 'memory',
        header: t('dashboard.memory', 'Memory'),
        cell: ({ row }) => {
          const vm = row.original;
          if (vm._deployTaskId || !vm.mem || !vm.maxmem) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <Tooltip>
              <TooltipTrigger>
                <InlineProgress value={vm.mem} max={vm.maxmem} />
              </TooltipTrigger>
              <TooltipContent>{formatBytes(vm.mem)} / {formatBytes(vm.maxmem)}</TooltipContent>
            </Tooltip>
          );
        },
        size: 120,
      },
      {
        id: 'disk',
        header: 'Disk',
        cell: ({ row }) => {
          const vm = row.original;
          if (vm._deployTaskId || (!vm.disk && !vm.maxdisk)) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <Tooltip>
              <TooltipTrigger>
                <InlineProgress value={vm.disk || 0} max={vm.maxdisk || 0} />
              </TooltipTrigger>
              <TooltipContent>{formatBytes(vm.disk || 0)} / {formatBytes(vm.maxdisk || 0)}</TooltipContent>
            </Tooltip>
          );
        },
        size: 120,
      },
      {
        id: 'uptime',
        header: 'Uptime',
        cell: ({ row }) => {
          if (row.original._deployTaskId) return <span className="text-xs text-muted-foreground">—</span>;
          const up = row.original.uptime;
          return <span className="text-xs text-muted-foreground">{up ? formatUptime(up) : '—'}</span>;
        },
        size: 80,
      },
      {
        id: 'tags',
        accessorKey: 'tags',
        header: 'Tags',
        cell: ({ getValue, row }) => {
          if (row.original._deployTaskId) return null;
          const tags = getValue<string>();
          if (!tags) return null;
          return (
            <div className="flex gap-1 flex-wrap">
              {tags.split(/[;,]/).filter(Boolean).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] leading-tight">{tag.trim()}</Badge>
              ))}
            </div>
          );
        },
        size: 120,
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          if (row.original._deployTaskId) return null;
          return <RowActionMenu vm={row.original} />;
        },
        size: 48,
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, deployTasks]
  );

  // ==================== TanStack Table ====================
  const table = useReactTable({
    data: liveRows,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  // ==================== Render ====================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">{t('nav.instances', 'Instances')}</h1>
        <Button render={<Link to="/instances/create" />} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('instances.create', 'Create Instance')}
        </Button>
      </div>

      {/* Type Tabs */}
      <Tabs value={typeTab} onValueChange={setTypeTab}>
        <TabsList>
          <TabsTrigger value="all">
            All <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="vm">
            <Monitor className="mr-1 h-3.5 w-3.5" /> VM
            <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.vm}</Badge>
          </TabsTrigger>
          <TabsTrigger value="lxc">
            <Container className="mr-1 h-3.5 w-3.5" /> LXC
            <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.lxc}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('instances.search_placeholder', 'Search by name, IP, or VMID...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={v => { if (v !== null) setStatusFilter(v); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder={t('common.status', 'Status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('instances.all_statuses', 'All statuses')}</SelectItem>
            <SelectItem value="running">{t('common.running', 'Running')}</SelectItem>
            <SelectItem value="stopped">{t('common.stopped', 'Stopped')}</SelectItem>
          </SelectContent>
        </Select>

        {servers.length > 1 && (
          <Select value={serverFilter} onValueChange={v => { if (v !== null) { setServerFilter(v); setNodeFilter('all'); } }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t('backups.select_server', 'Server')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('instances.all_servers', 'All servers')}</SelectItem>
              {servers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={nodeFilter} onValueChange={v => { if (v !== null) { setNodeFilter(v); localStorage.setItem('instances-node-filter', v); } }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder={t('common.node', 'Node')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('instances.all_nodes', 'All nodes')}</SelectItem>
            {uniqueNodes.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions toolbar */}
      {selectedVMs.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <span className="text-sm font-medium">{selectedVMs.length} selected</span>
          <Button variant="outline" size="sm" onClick={() => handleBulk('start')} disabled={bulkOp.isPending}>
            <Play className="mr-1 h-3 w-3" /> Start
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulk('stop')} disabled={bulkOp.isPending}>
            <Square className="mr-1 h-3 w-3" /> Stop
          </Button>
          <Button variant="destructive" size="sm" onClick={() => handleBulk('delete')} disabled={bulkOp.isPending}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Monitor className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">{t('instances.no_instances', 'No instances found')}</p>
              <p className="text-xs">{search ? t('instances.try_other_search', 'Try a different search query') : t('instances.create_first', 'Create your first instance')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} style={{ width: header.getSize() }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const isGhost = !!row.original._deployTaskId;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={isGhost ? 'opacity-70 bg-blue-500/5 border-l-2 border-l-blue-500' : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {allRows.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t('instances.showing', 'Showing')} {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              allRows.length
            )}{' '}
            {t('instances.of', 'of')} {allRows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
