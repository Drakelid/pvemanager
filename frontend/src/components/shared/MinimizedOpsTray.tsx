import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MinimizedTaskPill, type MinimizedStatus } from '@/components/shared/MinimizableDialog';
import { useMinimizedOpsStore, type MinimizedOp } from '@/stores/minimized-ops-store';
import { useAppOperations, useGoldenTemplateStatus } from '@/hooks/use-appstore';

/**
 * Глобальный трей свёрнутых операций (внизу справа). Монтируется в AppLayout,
 * поэтому плашки переживают навигацию: каждая сама опрашивает прогресс своей
 * операции по REST. Клик по плашке возвращает на страницу операции и
 * разворачивает диалог (через navigation state — resumeInstall / openGolden).
 */
export default function MinimizedOpsTray() {
  const items = useMinimizedOpsStore((s) => s.items);
  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {items.map((i) => (
        i.kind === 'appstore-install'
          ? <InstallPill key={i.key} item={i} />
          : <GoldenPill key={i.key} item={i} />
      ))}
    </div>
  );
}

function statusOf(opStatus: string | undefined): MinimizedStatus {
  if (opStatus === 'running') return 'running';
  if (opStatus === 'completed') return 'done';
  if (opStatus === 'failed') return 'failed';
  return 'idle';
}

function InstallPill({ item }: { item: MinimizedOp }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useMinimizedOpsStore((s) => s.remove);
  const { data: ops, isError } = useAppOperations(item.installedAppId ?? 0, 3000);
  const op = ops?.[0] ?? null;

  // Стор персистентный (localStorage): после перезагрузки страницы плашка
  // может ссылаться на уже удалённую установку — 404 от API убирает её сам.
  useEffect(() => {
    if (isError) remove(item.key);
  }, [isError, remove, item.key]);
  const lastStep = op?.steps_log?.length ? op.steps_log[op.steps_log.length - 1].step : null;
  const status = statusOf(op?.status);

  return (
    <MinimizedTaskPill
      title={item.title}
      subtitle={status === 'failed'
        ? (op?.error_text || t('appstore.install_failed'))
        : (lastStep || t('appstore.installing'))}
      progress={op ? op.progress : undefined}
      status={status === 'idle' ? 'running' : status}
      onRestore={() => {
        remove(item.key);
        navigate(`/appstore/${item.appId}`, { state: { resumeInstall: item.installedAppId } });
      }}
      onClose={() => remove(item.key)}
    />
  );
}

function GoldenPill({ item }: { item: MinimizedOp }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useMinimizedOpsStore((s) => s.remove);
  const { data: gstatus, isError } = useGoldenTemplateStatus(item.serverId, 3000);
  const op = gstatus?.last_operation ?? null;

  useEffect(() => {
    if (isError) remove(item.key);
  }, [isError, remove, item.key]);
  const lastStep = op?.steps_log?.length ? op.steps_log[op.steps_log.length - 1].step : null;
  const status = statusOf(op?.status);

  return (
    <MinimizedTaskPill
      title={item.title}
      subtitle={status === 'failed'
        ? (op?.error_text || t('appstore.golden.failed', 'Ошибка сборки'))
        : (lastStep || t('appstore.golden.working', 'Выполняется...'))}
      progress={op ? op.progress : undefined}
      status={status === 'idle' ? 'running' : status}
      onRestore={() => {
        remove(item.key);
        navigate('/appstore', { state: { openGolden: item.serverId } });
      }}
      onClose={() => remove(item.key)}
    />
  );
}
