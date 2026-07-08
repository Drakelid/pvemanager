import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaces } from '@/hooks/use-workspaces';

const NONE = '__none__';

interface Props {
  value?: number | null;
  onChange: (workspaceId: number | undefined) => void;
}

/** Селект «Рабочая область» для привязки IPAM-сети. */
export function WorkspaceSelect({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { data: workspaces = [] } = useWorkspaces();

  return (
    <div>
      <Label className="mb-1 block">{t('ipam.workspace', 'Рабочая область')}</Label>
      <Select
        value={value ? String(value) : NONE}
        onValueChange={(v) => onChange(v === NONE ? undefined : Number(v))}
      >
        <SelectTrigger><SelectValue placeholder={t('ipam.workspace_global', '— глобальная —')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('ipam.workspace_global', '— глобальная —')}</SelectItem>
          {workspaces.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
