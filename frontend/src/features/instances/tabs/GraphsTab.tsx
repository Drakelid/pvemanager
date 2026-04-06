import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useVMRrddata } from '@/hooks/use-instances';
import { formatBytes } from '@/lib/format';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

const TIMEFRAMES = [
  { value: 'hour', label: '1h' },
  { value: 'day', label: '24h' },
  { value: 'week', label: '7d' },
  { value: 'month', label: '30d' },
  { value: 'year', label: '1y' },
];

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

interface ChartCardProps {
  title: string;
  data: Array<Record<string, unknown>>;
  dataKey: string;
  color: string;
  formatValue?: (v: number) => string;
  unit?: string;
}

function ChartCard({ title, data, dataKey, color, formatValue, unit }: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              className="text-[10px] fill-muted-foreground"
              tick={{ fontSize: 10 }}
            />
            <YAxis
              className="text-[10px] fill-muted-foreground"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (formatValue ? formatValue(v) : String(v))}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: 12,
              }}
              formatter={(val: any) => [
                val != null && typeof val === 'number' && formatValue ? formatValue(val) : `${val ?? ''}${unit || ''}`,
                title,
              ]}
              labelFormatter={(ts) => new Date((ts as number) * 1000).toLocaleString()}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#grad-${dataKey})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function GraphsTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState('hour');
  const { data: rrdData, isLoading } = useVMRrddata(serverId, vmid, type, node, timeframe);

  // Parse RRD data into chart-friendly format
  const chartData = (rrdData as Array<Record<string, unknown>> | undefined)?.map((point) => ({
    time: Number(point.time),
    cpu: (Number(point.cpu) || 0) * 100,
    mem: Number(point.mem) || Number(point.memused) || 0,
    maxmem: Number(point.maxmem) || 0,
    netin: Number(point.netin) || 0,
    netout: Number(point.netout) || 0,
    diskread: Number(point.diskread) || 0,
    diskwrite: Number(point.diskwrite) || 0,
  })) || [];

  return (
    <div className="space-y-4">
      {/* Timeframe selector */}
      <div className="flex gap-1">
        {TIMEFRAMES.map((tf) => (
          <Button
            key={tf.value}
            variant={timeframe === tf.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeframe(tf.value)}
          >
            {tf.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title={t('graphs.cpu_usage')}
            data={chartData}
            dataKey="cpu"
            color="hsl(217, 91%, 60%)"
            formatValue={(v) => `${v.toFixed(1)}%`}
            unit="%"
          />
          <ChartCard
            title={t('graphs.memory_usage')}
            data={chartData}
            dataKey="mem"
            color="hsl(142, 76%, 36%)"
            formatValue={(v) => formatBytes(v)}
          />
          <ChartCard
            title={t('graphs.network_in')}
            data={chartData}
            dataKey="netin"
            color="hsl(262, 83%, 58%)"
            formatValue={(v) => formatBytes(v)}
          />
          <ChartCard
            title={t('graphs.network_out')}
            data={chartData}
            dataKey="netout"
            color="hsl(25, 95%, 53%)"
            formatValue={(v) => formatBytes(v)}
          />
          <ChartCard
            title={t('graphs.disk_read')}
            data={chartData}
            dataKey="diskread"
            color="hsl(199, 89%, 48%)"
            formatValue={(v) => formatBytes(v)}
          />
          <ChartCard
            title={t('graphs.disk_write')}
            data={chartData}
            dataKey="diskwrite"
            color="hsl(0, 84%, 60%)"
            formatValue={(v) => formatBytes(v)}
          />
        </div>
      )}
    </div>
  );
}
