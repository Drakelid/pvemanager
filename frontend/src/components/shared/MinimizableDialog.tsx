import { Loader2, Minus, X, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Сворачивание модалок с долгими операциями (установка приложения, сборка
 * золотого шаблона и т.п.): кнопка «Свернуть» в шапке диалога + плавающая
 * плашка прогресса внизу справа. Родительский компонент диалога остаётся
 * смонтированным (сворачивание меняет только open у <Dialog>), поэтому
 * WS-подписки и опросы прогресса продолжают работать.
 */

export function DialogMinimizeButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="absolute top-2 right-10"
      onClick={onClick}
      title={title}
    >
      <Minus className="h-4 w-4" />
      <span className="sr-only">{title}</span>
    </Button>
  );
}

export type MinimizedStatus = 'idle' | 'running' | 'done' | 'failed';

interface PillProps {
  title: string;
  subtitle?: string | null;
  progress?: number;          // 0..100; undefined → без прогресс-бара
  status: MinimizedStatus;
  onRestore: () => void;      // клик по плашке — развернуть диалог
  onClose: () => void;        // крестик — закрыть совсем
}

export function MinimizedTaskPill({ title, subtitle, progress, status, onRestore, onClose }: PillProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="fixed bottom-4 right-4 z-50 w-72 cursor-pointer rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-colors hover:bg-accent/40"
      onClick={onRestore}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onRestore(); }}
    >
      <div className="flex items-center gap-2">
        {status === 'running' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
        {status === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
        {status === 'failed' && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full transition-all', status === 'failed' ? 'bg-destructive' : 'bg-primary')}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
