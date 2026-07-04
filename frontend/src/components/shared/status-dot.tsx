import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  running: 'bg-success',
  stopped: 'bg-muted-foreground/40',
  paused: 'bg-warning',
  suspended: 'bg-warning',
  unknown: 'bg-muted-foreground/30',
  online: 'bg-success',
  offline: 'bg-danger',
};

interface StatusDotProps {
  status: string;
  className?: string;
  pulse?: boolean;
}

export function StatusDot({ status, className, pulse }: StatusDotProps) {
  const color = statusColors[status] ?? statusColors.unknown;
  return (
    // role/aria-label so the status is not conveyed by colour alone — screen
    // readers announce it, and sighted users get a native tooltip.
    <span
      role="img"
      aria-label={status}
      title={status}
      className={cn('relative inline-block h-2 w-2 rounded-full', color, className)}
    >
      {pulse && status === 'running' && (
        <span className={cn('absolute inset-0 animate-ping rounded-full opacity-75', color)} />
      )}
    </span>
  );
}
