import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle } from 'lucide-react';
import { useNodes } from '@/hooks/use-nodes';
import { useAptUpdates } from '@/hooks/use-node-admin';

/**
 * Невидимый пробник: тянет список APT-обновлений для одного узла
 * и сообщает их количество наверх. Рендерит null.
 */
function NodeUpdatesProbe({
  serverId,
  node,
  onCount,
}: {
  serverId: number;
  node: string;
  onCount: (node: string, count: number) => void;
}) {
  const { data } = useAptUpdates(serverId, node);
  const count = data?.updates?.length ?? 0;

  useEffect(() => {
    onCount(node, count);
  }, [node, count, onCount]);

  return null;
}

/**
 * Аккуратная плашка «Доступны обновления» для карточки сервера.
 * Показывается только если хотя бы на одном узле есть APT-обновления.
 */
export default function ServerUpdatesBadge({
  serverId,
  online,
}: {
  serverId: number;
  online?: boolean;
}) {
  const { t } = useTranslation();
  const { data: nodesData } = useNodes(online ? serverId : 0);
  const nodes = nodesData?.nodes ?? [];

  const [counts, setCounts] = useState<Record<string, number>>({});
  const report = useCallback((node: string, count: number) => {
    setCounts(prev => (prev[node] === count ? prev : { ...prev, [node]: count }));
  }, []);

  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

  if (!online) return null;

  return (
    <>
      {nodes.map(n => (
        <NodeUpdatesProbe key={n.node} serverId={serverId} node={n.node} onCount={report} />
      ))}
      {total > 0 && (
        <Link
          to={`/nodes/${serverId}?tab=admin`}
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
          title={t('nodes.updates_available_count', { count: total })}
        >
          <ArrowUpCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 min-w-0 truncate">{t('nodes.updates_available')}</span>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold tabular-nums">
            {total}
          </span>
        </Link>
      )}
    </>
  );
}
