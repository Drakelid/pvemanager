import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  running: 'bg-green-500',
  stopped: 'bg-muted-foreground/40',
  paused: 'bg-amber-500',
  suspended: 'bg-amber-500',
  unknown: 'bg-muted-foreground/30',
  online: 'bg-green-500',
  offline: 'bg-red-500',
};

interface StatusDotProps {
  status: string;
  className?: string;
  pulse?: boolean;
}

export function StatusDot({ status, className, pulse }: StatusDotProps) {
  const color = statusColors[status] ?? statusColors.unknown;
  return (
    <span className={cn('relative inline-block h-2 w-2 rounded-full', color, className)}>
      {pulse && status === 'running' && (
        <span className={cn('absolute inset-0 animate-ping rounded-full opacity-75', color)} />
      )}
    </span>
  );
}
