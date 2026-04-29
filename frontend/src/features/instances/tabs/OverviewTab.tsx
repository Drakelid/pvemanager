import { Cpu, MemoryStick, HardDrive, Clock, Wifi, Globe, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVMStatus, useVMConfig, useVMInterfaces } from '@/hooks/use-instances';
import { formatBytes, formatUptime, formatPercent } from '@/lib/format';
import { useTranslation } from 'react-i18next';

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
        ? 'bg-red-500'
        : percent >= 70
          ? 'bg-amber-500'
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
  const { data: status } = useVMStatus(serverId, vmid, type, node);
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const { data: ifaces } = useVMInterfaces(serverId, vmid, type, node);

  const cpuPercent = status ? (status.cpu || 0) * 100 : 0;
  const memPercent = status && status.maxmem ? (status.mem / status.maxmem) * 100 : 0;
  const diskPercent = status && status.maxdisk ? (status.disk / status.maxdisk) * 100 : 0;

  const primaryIP = ifaces?.interfaces
    ?.flatMap((i) => i.ips || [])
    .find((ip) => ip.type === 'ipv4' && !ip.address.startsWith('127.'));

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('common.cpu')}
          value={formatPercent(cpuPercent)}
          subtitle={config?.cores ? `${config.cores} ${t('common.cores')}` : undefined}
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
          label={t('common.disk')}
          value={status ? formatBytes(status.disk) : '—'}
          subtitle={status ? `${t('common.of')} ${formatBytes(status.maxdisk)}` : undefined}
          percent={diskPercent}
          icon={HardDrive}
        />
        <MetricCard
          label={t('common.uptime')}
          value={status?.uptime ? formatUptime(status.uptime) : '—'}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Info card */}
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
            <InfoRow label={t('common.vcpu')} value={config?.cores} />
            <InfoRow label={t('common.memory')} value={config?.memory ? `${config.memory} MB` : undefined} />
            <InfoRow label={t('common.os_type')} value={config?.ostype as string} />
            <InfoRow label={t('common.boot_order')} value={config?.boot as string} />
            <InfoRow label={t('common.qemu_agent')} value={config?.agent ? t('common.enabled') : t('common.disabled')} />
            <InfoRow label={t('common.start_on_boot')} value={config?.onboot ? t('common.yes') : t('common.no')} />
          </CardContent>
        </Card>

        {/* Network card */}
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
