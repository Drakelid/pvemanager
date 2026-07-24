import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/shared/status-dot';
import { cn } from '@/lib/utils';

interface ServerStatusBadgeProps {
  isOnline?: boolean | null;
  /** Почему сервер недоступен: 'auth' — ответил 401, 'connection' — не отвечает. */
  errorKind?: 'auth' | 'connection' | null;
  lastError?: string | null;
  /** 'badge' — плашка в списках серверов, 'inline' — точка с подписью. */
  variant?: 'badge' | 'inline';
  className?: string;
}

/**
 * Статус подключения к серверу Proxmox.
 *
 * Отдельно показывает отказ авторизации: сервер жив и отвечает, но отверг
 * учётные данные — это чинится не так, как «нода не отвечает», и не должно
 * выглядеть одинаково.
 */
export function ServerStatusBadge({
  isOnline, errorKind, lastError, variant = 'badge', className,
}: ServerStatusBadgeProps) {
  const { t } = useTranslation();

  const authError = !isOnline && errorKind === 'auth';
  const status = isOnline ? 'online' : authError ? 'auth_error' : 'offline';
  const label = isOnline
    ? t('common.online')
    : authError ? t('nodes.auth_error') : t('common.offline');
  const title = authError ? t('nodes.auth_error_hint') : lastError || undefined;

  if (variant === 'inline') {
    return (
      <span
        className={cn('flex items-center gap-1.5 text-xs',
          authError ? 'text-warning' : 'text-muted-foreground', className)}
        title={title}
      >
        <StatusDot status={status} pulse />
        {label}
      </span>
    );
  }

  return (
    <Badge
      variant={isOnline ? 'default' : authError ? 'outline' : 'destructive'}
      className={cn('gap-1.5', authError && 'border-warning/40 text-warning', className)}
      title={title}
    >
      <StatusDot status={status} pulse className="h-1.5 w-1.5" />
      {label}
    </Badge>
  );
}
