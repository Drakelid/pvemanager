import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNodeSyslog } from '@/hooks/use-node-admin';

/** Просмотр системного журнала ноды (аналог Syslog в Proxmox). */
export default function NodeSyslog({ serverId, node }: { serverId: number; node: string }) {
  const { t } = useTranslation();
  const { data, refetch, isFetching } = useNodeSyslog(serverId, node);
  const lines = data?.syslog ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('nodeadm.syslog_hint', 'Последние записи системного журнала ноды')}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Обновить')}
        </Button>
      </div>
      <div className="h-[420px] overflow-auto rounded-lg border bg-[#09090B] p-3 font-mono text-xs leading-relaxed text-[#e0e0e0]">
        {lines.length === 0 ? (
          <p className="text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
        ) : (
          lines.map((l) => (
            <div key={l.n} className="whitespace-pre-wrap break-all">{l.t}</div>
          ))
        )}
      </div>
    </div>
  );
}
