import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useScriptExecution } from '@/hooks/use-scripts';

interface Props {
  executionId: number | null;
  onOpenChange: (open: boolean) => void;
}

export default function ExecutionDetailDialog({ executionId, onOpenChange }: Props) {
  const { t } = useTranslation();
  const open = !!executionId;
  const { data: execution, isLoading } = useScriptExecution(executionId || 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('scripts.execution_title', 'Запуск: {{name}}', { name: execution?.script_name || execution?.script_id })}</DialogTitle>
        </DialogHeader>

        {isLoading || !execution ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {execution.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              {execution.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
              {execution.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              <span>{t('scripts.exit_code', 'Exit code')}: {execution.exit_code ?? '—'}</span>
              <span className="text-muted-foreground">
                {execution.target_type === 'node' ? execution.node : `${execution.node} / vmid ${execution.vmid}`}
              </span>
            </div>

            {Object.keys(execution.params_used || {}).length > 0 && (
              <div className="rounded-md border p-2 text-xs">
                {Object.entries(execution.params_used).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground">{k}</span> = {v}</div>
                ))}
              </div>
            )}

            {execution.error_text && (
              <p className="text-sm text-destructive">{execution.error_text}</p>
            )}

            <pre className="max-h-96 overflow-auto rounded bg-muted/40 p-2 text-xs whitespace-pre-wrap">
              {execution.output || t('scripts.no_output', '(нет вывода)')}
            </pre>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.close', 'Закрыть')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
