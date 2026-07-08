import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServers, useNodes } from '@/hooks/use-nodes';

const NONE = '__none__';

interface Props {
  serverId?: number;
  node?: string;
  onChange: (v: { serverId?: number; node?: string }) => void;
}

/**
 * Пара селектов «Сервер Proxmox» + «Нода» для привязки IPAM-сети к конкретной ноде.
 * Смена сервера сбрасывает выбранную ноду. Ноды подтягиваются для выбранного сервера.
 */
export function ServerNodeSelect({ serverId, node, onChange }: Props) {
  const { t } = useTranslation();
  const { data: servers = [] } = useServers();
  const { data: nodesData } = useNodes(serverId ?? 0);
  const nodes = nodesData?.nodes ?? [];

  return (
    <>
      <div>
        <Label className="mb-1 block">{t('ipam.server')}</Label>
        <Select
          value={serverId ? String(serverId) : NONE}
          onValueChange={(v) => onChange({ serverId: v === NONE ? undefined : Number(v), node: undefined })}
        >
          <SelectTrigger><SelectValue placeholder={t('ipam.any_server', '— не привязано —')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('ipam.any_server', '— не привязано —')}</SelectItem>
            {servers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block">{t('appstore.node')}</Label>
        <Select
          value={node || NONE}
          onValueChange={(v) => onChange({ serverId, node: v && v !== NONE ? v : undefined })}
          disabled={!serverId}
        >
          <SelectTrigger><SelectValue placeholder={t('ipam.any_node', '— любая нода —')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('ipam.any_node', '— любая нода —')}</SelectItem>
            {nodes.map((n) => <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
