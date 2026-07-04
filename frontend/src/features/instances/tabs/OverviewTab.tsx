import { Cpu, MemoryStick, HardDrive, Clock, Wifi, Globe, Server, ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVMLiveMetrics, useVMConfig, useVMInterfaces } from '@/hooks/use-instances';
import { formatBytes, formatUptime, formatPercent, vmVcpuCount } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import type { DiskInfo } from '@/types';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

function MetricCard({
  label,
  value,
  subtitle,
  percent,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtitle?: string;
  percent?: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const barColor =
    percent !== undefined
      ? percent >= 90
        ? 'bg-danger'
        : percent >= 70
          ? 'bg-warning'
          : 'bg-primary'
      : 'bg-primary';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-xl font-bold tabular-nums">{value}</p>
        {percent !== undefined && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        )}
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function NetworkCard({ label, inRate, outRate }: { label: string; inRate?: number; outRate?: number }) {
  const fmt = (v?: number) => (v != null ? `${formatBytes(v)}/s` : '—');
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Globe className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <ArrowDown className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-base font-bold tabular-nums">{fmt(inRate)}</span>
          </div>
          <div className="flex items-center gap-1">
            <ArrowUp className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-base font-bold tabular-nums">{fmt(outRate)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DiskCard({ disk }: { disk: DiskInfo }) {
  const pct = disk.total > 0 ? (disk.used / disk.total) * 100 : 0;
  const barColor = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-primary';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">{disk.name}</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">{disk.mountpoint}</span>
        </div>
        <p className="text-xl font-bold tabular-nums">{pct.toFixed(1)}%</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatBytes(disk.used)} / {formatBytes(disk.total)}
        </p>
      </CardContent>
    </Card>
  );
}

function IoRateCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value?: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-xl font-bold tabular-nums">
          {value != null ? `${formatBytes(value)}/s` : '—'}
        </p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? '—'}</span>
    </div>
  );
}

export default function OverviewTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const status = useVMLiveMetrics(serverId, vmid, type, node);
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const { data: ifaces } = useVMInterfaces(serverId, vmid, type, node);

  const cpuPercent = status ? (status.cpu || 0) * 100 : 0;
  const memPercent = status && status.maxmem ? (status.mem / status.maxmem) * 100 : 0;

  const primaryIP = ifaces?.interfaces
    ?.flatMap((i) => i.ips || [])
    .find((ip) => ip.type === 'ipv4' && !ip.address.startsWith('127.'));

  const disks: DiskInfo[] = status?.disks ?? [];

  return (
    <div className="space-y-6">
      {/* Row 1: Main metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('common.cpu')}
          value={formatPercent(cpuPercent)}
          subtitle={vmVcpuCount(config) ? `${vmVcpuCount(config)} ${t('common.cores')}` : undefined}
          percent={cpuPercent}
          icon={Cpu}
        />
        <MetricCard
          label={t('common.memory')}
          value={status ? formatBytes(status.mem) : '—'}
          subtitle={status ? `${t('common.of')} ${formatBytes(status.maxmem)}` : undefined}
          percent={memPercent}
          icon={MemoryStick}
        />
        <MetricCard
          label={t('common.uptime')}
          value={status?.uptime ? formatUptime(status.uptime) : '—'}
          icon={Clock}
        />
        <NetworkCard
          label={t('common.network_io')}
          inRate={status?.netin_rate}
          outRate={status?.netout_rate}
        />
      </div>

      {/* Storage section — per-disk breakdown */}
      <div>
        <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          {t('common.storage')}
        </h3>
        {disks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {disks.map((disk) => (
              <DiskCard key={`${disk.name}-${disk.mountpoint}`} disk={disk} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              {type === 'qemu'
                ? t('common.guest_agent_required')
                : '—'}
            </CardContent>
          </Card>
        )}
      </div>

      {/* I/O Rates section */}
      <div>
        <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
          {t('common.io_rates')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <IoRateCard
            label={t('common.disk_read_rate')}
            value={status?.diskread_rate}
            icon={HardDrive}
            color="text-cyan-500"
          />
          <IoRateCard
            label={t('common.disk_write_rate')}
            value={status?.diskwrite_rate}
            icon={HardDrive}
            color="text-orange-500"
          />
          <IoRateCard
            label={t('common.net_in_rate')}
            value={status?.netin_rate}
            icon={ArrowDown}
            color="text-blue-500"
          />
          <IoRateCard
            label={t('common.net_out_rate')}
            value={status?.netout_rate}
            icon={ArrowUp}
            color="text-violet-500"
          />
        </div>
      </div>

      {/* Info + Network details */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Server className="h-4 w-4" />
              {t('common.instance_info')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('common.vmid')} value={vmid} />
            <InfoRow label={t('common.node')} value={node} />
            <InfoRow label={t('common.type')} value={type === 'qemu' ? t('common.qemu_virtual_machine') : t('common.lxc_container')} />
            <InfoRow label={t('common.vcpu')} value={vmVcpuCount(config)} />
            <InfoRow label={t('common.memory')} value={config?.memory ? `${config.memory} MB` : undefined} />
            <InfoRow label={t('common.os_type')} value={config?.ostype as string} />
            <InfoRow label={t('common.boot_order')} value={config?.boot as string} />
            <InfoRow label={t('common.qemu_agent')} value={config?.agent ? t('common.enabled') : t('common.disabled')} />
            <InfoRow label={t('common.start_on_boot')} value={config?.onboot ? t('common.yes') : t('common.no')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t('common.network')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {primaryIP && <InfoRow label={t('common.primary_ip')} value={primaryIP.address} />}
            {status?.netin !== undefined && (
              <InfoRow label={t('common.network_in')} value={formatBytes(status.netin)} />
            )}
            {status?.netout !== undefined && (
              <InfoRow label={t('common.network_out')} value={formatBytes(status.netout)} />
            )}
            {config?.net0 && <InfoRow label="net0" value={String(config.net0)} />}

            {ifaces?.interfaces && ifaces.interfaces.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('common.interfaces')}</p>
                {ifaces.interfaces.map((iface) => (
                  <div key={iface.name} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <Wifi className="h-3 w-3 text-muted-foreground" />
                      {iface.name}
                      {iface.mac && <span className="text-muted-foreground font-mono">{iface.mac}</span>}
                    </div>
                    {iface.ips?.map((ip) => (
                      <div key={ip.address} className="ml-5 text-muted-foreground font-mono">
                        {ip.address}/{ip.prefix} ({ip.type})
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
