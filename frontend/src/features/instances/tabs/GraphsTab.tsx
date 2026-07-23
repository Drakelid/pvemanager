import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVMMetrics } from '@/hooks/use-instances';
import { formatBytes } from '@/lib/format';
import {
  ChartCard,
  TIMEFRAME_PRESETS as PRESETS,
  localToUnix,
  unixToLocal,
  tickFormatterFor,
} from '@/components/shared/MetricChart';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

const MAX_SPAN = 30 * 86400;

export default function GraphsTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState('hour');
  // custom range: raw datetime-local strings
  const [fromLocal, setFromLocal] = useState('');
  const [toLocal, setToLocal] = useState('');
  const [nic, setNic] = useState('all');

  // Compute unix-second from/to with 30-day clamp
  const customRange = useMemo<{ from?: number; to?: number }>(() => {
    const f = localToUnix(fromLocal);
    const to = localToUnix(toLocal);
    if (f == null || to == null) return {};
    let from = f;
    if (to - from > MAX_SPAN) from = to - MAX_SPAN;
    return { from, to };
  }, [fromLocal, toLocal]);

  const hasCustom = customRange.from != null && customRange.to != null;

  const { data, isLoading } = useVMMetrics(serverId, vmid, type, node, {
    timeframe: hasCustom ? undefined : timeframe,
    from: customRange.from,
    to: customRange.to,
    nic,
  });

  const points = (data?.data ?? []) as unknown as Array<Record<string, unknown>>;
  const nics = data?.meta?.nics ?? [];

  // Custom ranges spanning more than a day need date ticks, not HH:MM.
  const spanSeconds =
    hasCustom && customRange.from != null && customRange.to != null
      ? customRange.to - customRange.from
      : 0;
  const xTick = tickFormatterFor(hasCustom ? (spanSeconds > 86400 ? 'week' : 'day') : timeframe);

  function resetCustom() {
    setFromLocal('');
    setToLocal('');
  }

  // When the clamped from differs from the input, reflect it back
  const displayFrom =
    hasCustom && customRange.from != null ? unixToLocal(customRange.from) : fromLocal;

  const nicSelector = (
    <select
      value={nic}
      onChange={(e) => setNic(e.target.value)}
      className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground focus:outline-none"
    >
      <option value="all">Все</option>
      {nics.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Time controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.tf}
              variant={!hasCustom && timeframe === p.tf ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTimeframe(p.tf);
                resetCustom();
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Custom range inputs */}
        <div className="flex items-center gap-1 text-sm">
          <input
            type="datetime-local"
            value={displayFrom}
            onChange={(e) => setFromLocal(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none"
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => setToLocal(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none"
          />
          {hasCustom && (
            <Button variant="outline" size="sm" onClick={resetCustom}>
              Сбросить
            </Button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Нет данных
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            tickFormatter={xTick}
            title={t('graphs.cpu_usage')}
            data={points}
            dataKey="cpu"
            color="hsl(217, 91%, 60%)"
            formatValue={(v) => `${v.toFixed(1)}%`}
            unit="%"
          />
          <ChartCard
            tickFormatter={xTick}
            title={t('graphs.memory_usage')}
            data={points}
            dataKey="mem"
            color="hsl(142, 76%, 36%)"
            formatValue={(v) => formatBytes(v)}
          />
          <ChartCard
            tickFormatter={xTick}
            title={t('graphs.disk_write')}
            data={points}
            dataKey="diskwrite"
            color="hsl(0, 84%, 60%)"
            formatValue={(v) => `${formatBytes(v)}/s`}
          />
          <ChartCard
            tickFormatter={xTick}
            title={t('graphs.disk_read')}
            data={points}
            dataKey="diskread"
            color="hsl(199, 89%, 48%)"
            formatValue={(v) => `${formatBytes(v)}/s`}
          />
          <ChartCard
            tickFormatter={xTick}
            title={t('graphs.network_in')}
            data={points}
            dataKey="netin"
            color="hsl(262, 83%, 58%)"
            formatValue={(v) => `${formatBytes(v)}/s`}
            headerRight={nicSelector}
          />
          <ChartCard
            tickFormatter={xTick}
            title={t('graphs.network_out')}
            data={points}
            dataKey="netout"
            color="hsl(25, 95%, 53%)"
            formatValue={(v) => `${formatBytes(v)}/s`}
            headerRight={nicSelector}
          />
          <ChartCard
            tickFormatter={xTick}
            title="IOPS чтение"
            data={points}
            dataKey="iops_read"
            color="hsl(180, 70%, 40%)"
            formatValue={(v) => `${v.toFixed(0)} ops/s`}
            unit=" ops/s"
          />
          <ChartCard
            tickFormatter={xTick}
            title="IOPS запись"
            data={points}
            dataKey="iops_write"
            color="hsl(300, 60%, 50%)"
            formatValue={(v) => `${v.toFixed(0)} ops/s`}
            unit=" ops/s"
          />
          <ChartCard
            tickFormatter={xTick}
            title="Заполненность диска"
            data={points}
            dataKey="diskpct"
            color="hsl(45, 93%, 47%)"
            formatValue={(v) => `${v.toFixed(1)}%`}
            unit="%"
          />
        </div>
      )}
    </div>
  );
}
