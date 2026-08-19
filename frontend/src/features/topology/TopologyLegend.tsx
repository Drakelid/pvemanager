import { useTranslation } from 'react-i18next';
import { Box, Boxes, Monitor, Network, Server, WifiOff } from 'lucide-react';

const ITEMS = [
  { key: 'panel', Icon: Boxes, className: 'text-primary' },
  { key: 'cluster', Icon: Network, className: 'text-muted-foreground' },
  { key: 'node', Icon: Server, className: 'text-muted-foreground' },
  { key: 'vm', Icon: Monitor, className: 'text-emerald-500' },
  { key: 'lxc', Icon: Box, className: 'text-emerald-500' },
  { key: 'stale', Icon: WifiOff, className: 'text-amber-500' },
] as const;

export function TopologyLegend() {
  const { t } = useTranslation();

  return (
    <div
      data-export-ignore="true"
      className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur"
    >
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('topology.legend.title', 'Legend')}
      </div>
      <div className="space-y-1">
        {ITEMS.map(({ key, Icon, className }) => (
          <div key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon className={`h-3 w-3 shrink-0 ${className}`} />
            <span>{t(`topology.legend.${key}`, key)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <span>{t('topology.legend.running', 'Running')}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
          <span>{t('topology.legend.stopped', 'Stopped')}</span>
        </div>
      </div>
    </div>
  );
}
