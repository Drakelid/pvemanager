import { useId } from 'react';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Presets shared by the instance and node graph views. */
export const TIMEFRAME_PRESETS = [
  { tf: 'hour', label: '1h' },
  { tf: 'day', label: '24h' },
  { tf: 'week', label: '7d' },
  { tf: 'month', label: '30d' },
];

/** HH:MM — the default tick format, adequate for hour/day ranges. */
export function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** DD.MM — used for week/month/year ranges where HH:MM repeats itself. */
export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Pick a tick formatter that stays readable for the given timeframe. */
export function tickFormatterFor(timeframe: string): (ts: number) => string {
  return timeframe === 'hour' || timeframe === 'day' ? fmtTime : fmtDate;
}

/** Convert a datetime-local string to unix seconds. */
export function localToUnix(val: string): number | undefined {
  if (!val) return undefined;
  return Math.floor(new Date(val).getTime() / 1000);
}

/** Convert unix seconds to a datetime-local value string. */
export function unixToLocal(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface ChartCardProps {
  title: string;
  data: Array<Record<string, unknown>>;
  dataKey: string;
  color: string;
  formatValue?: (v: number) => string;
  unit?: string;
  headerRight?: React.ReactNode;
  /** Overrides the X axis tick format (defaults to HH:MM). */
  tickFormatter?: (ts: number) => string;
}

/** Single area chart card — one metric series over time. */
export function ChartCard({
  title,
  data,
  dataKey,
  color,
  formatValue,
  unit,
  headerRight,
  tickFormatter,
}: ChartCardProps) {
  // useId keeps the gradient unique even when two cards share a dataKey.
  const gradientId = `grad-${dataKey}-${useId().replace(/:/g, '')}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {headerRight}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="time"
              tickFormatter={tickFormatter || fmtTime}
              className="text-2xs fill-muted-foreground"
              tick={{ fontSize: 10 }}
            />
            <YAxis
              className="text-2xs fill-muted-foreground"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (formatValue ? formatValue(v) : String(v))}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: '6px',
                fontSize: 12,
                color: '#fff',
              }}
              labelStyle={{ color: '#fff' }}
              itemStyle={{ color: '#fff' }}
              formatter={(val: unknown) => [
                val != null && typeof val === 'number' && formatValue
                  ? formatValue(val)
                  : `${val ?? ''}${unit || ''}`,
                title,
              ]}
              labelFormatter={(ts) => new Date((ts as number) * 1000).toLocaleString()}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
