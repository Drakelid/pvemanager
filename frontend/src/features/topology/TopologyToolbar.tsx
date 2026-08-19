import { useTranslation } from 'react-i18next';
import { Download, Maximize2, Minimize2, RefreshCw, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TopologyFilters, VmStatusFilter } from './lib/types';

const STATUSES: VmStatusFilter[] = ['all', 'running', 'stopped'];

interface TopologyToolbarProps {
  filters: TopologyFilters;
  onChange: (filters: TopologyFilters) => void;
  connections: Array<{ id: number; name: string }>;
  isFullscreen: boolean;
  isFetching: boolean;
  onFit: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onExport: (format: 'png' | 'svg') => void;
  exportDisabled: boolean;
}

export function TopologyToolbar({
  filters,
  onChange,
  connections,
  isFullscreen,
  isFetching,
  onFit,
  onFullscreen,
  onRefresh,
  onExport,
  exportDisabled,
}: TopologyToolbarProps) {
  const { t } = useTranslation();

  return (
    <div
      data-export-ignore="true"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur"
    >
      <Select
        value={String(filters.serverId)}
        onValueChange={(value) =>
          onChange({ ...filters, serverId: value === 'all' ? 'all' : Number(value) })
        }
      >
        <SelectTrigger className="h-8 w-[190px] text-xs">
          <SelectValue placeholder={t('topology.filters.connection', 'Connection')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('topology.filters.all_connections', 'All connections')}</SelectItem>
          {connections.map((connection) => (
            <SelectItem key={connection.id} value={String(connection.id)}>
              {connection.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t('topology.filters.vm_status', 'VM status')}:</span>
        <div className="flex overflow-hidden rounded-md border border-border">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onChange({ ...filters, vmStatus: status })}
              className={cn(
                'px-2 py-1 text-xs transition-colors',
                filters.vmStatus === status
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {t(`topology.filters.status_${status}`, status)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {t('topology.filters.threshold', 'Group VMs above')}
        </span>
        <Slider
          className="w-28"
          min={0}
          max={100}
          step={5}
          value={filters.groupThreshold}
          onValueChange={(value) =>
            onChange({ ...filters, groupThreshold: Array.isArray(value) ? value[0] : value })
          }
        />
        <span className="w-8 text-xs tabular-nums text-muted-foreground">
          {filters.groupThreshold === 0 ? t('topology.filters.threshold_off', 'Off') : filters.groupThreshold}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} title={t('topology.actions.refresh', 'Refresh')}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onFit} title={t('topology.actions.fit', 'Fit to screen')}>
          <Scan className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={exportDisabled}
                title={t('topology.actions.export', 'Export')}
              />
            }
          >
            <Download className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport('png')}>
              {t('topology.actions.export_png', 'Export PNG')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('svg')} title={t('topology.export.svg_hint', '')}>
              {t('topology.actions.export_svg', 'Export SVG')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onFullscreen}
          title={
            isFullscreen
              ? t('topology.actions.exit_fullscreen', 'Exit fullscreen')
              : t('topology.actions.fullscreen', 'Fullscreen')
          }
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
