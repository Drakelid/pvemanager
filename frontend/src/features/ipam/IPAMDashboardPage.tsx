import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Network, Globe, AlertTriangle, Activity, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useIPAMSummary, useIPAMNetworks } from '@/hooks/use-ipam';

export default function IPAMDashboardPage() {
  const { t } = useTranslation();
  const { data: summary } = useIPAMSummary();
  const { data: networks = [] } = useIPAMNetworks();

  const s = summary as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.ipam')}</h1>
        <Link to="/ipam/tools" className="flex items-center gap-1 text-sm text-blue-400 hover:underline">
          <Wrench className="h-4 w-4" />{t('ipam.tools')}
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Globe} label={t('ipam.networks_count')} value={s?.networks_count ?? 0} to="/ipam/networks" />
        <SummaryCard icon={Network} label={t('ipam.total_allocated')} value={s?.total_allocated ?? 0} to="/ipam/allocations" />
        <SummaryCard icon={Activity} label={t('ipam.total_reserved')} value={s?.total_reserved ?? 0} />
        <SummaryCard icon={AlertTriangle} label={t('ipam.vm_count')} value={(s?.vm_count ?? 0) + (s?.lxc_count ?? 0)} />
      </div>

      {/* Quick network overview */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('ipam.networks')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {networks.slice(0, 6).map(net => (
            <Link key={net.id} to={`/ipam/network/${net.id}`}>
              <Card className="hover:border-blue-500/50 transition-colors h-full">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{net.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{net.network}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(net.utilization_percent || 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{net.used_ips ?? 0} / {net.total_ips ?? 0}</span>
                    <span>{(net.utilization_percent ?? 0).toFixed(1)}%</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {networks.length > 6 && (
          <Link to="/ipam/networks" className="text-sm text-blue-400 hover:underline">{t('ipam.view_all_networks')}</Link>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, to }: { icon: React.ElementType; label: string; value: number; to?: string }) {
  const content = (
    <Card className={to ? 'hover:border-blue-500/50 transition-colors' : ''}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
