import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteVM } from '@/hooks/use-instances';
import { vmTypeLabel } from '@/lib/format';
import { toast } from 'sonner';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
  name?: string;
}

export default function DestroyTab({ serverId, vmid, type, node, name }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deleteVM = useDeleteVM(serverId, vmid, type, node);
  const [confirmation, setConfirmation] = useState('');

  const displayName = name || `${vmTypeLabel(type)} ${vmid}`;
  const canDelete = confirmation === displayName;

  const handleDestroy = () => {
    if (!canDelete) return;
    deleteVM.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('instances.destroyed', { name: displayName }));
        navigate('/instances');
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="max-w-xl">
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('instances.destroy_title', { type: vmTypeLabel(type) })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">{t('instances.destroy_irreversible')}</p>
            <p className="mt-1 text-destructive/80">
              {t('instances.destroy_warning_before')} <strong>{displayName}</strong> (#{vmid}){t('instances.destroy_warning_after')}
            </p>
          </div>

          <div>
            <Label htmlFor="confirm-name">
              {t('instances.destroy_confirm_label_before')} <strong className="text-foreground">{displayName}</strong> {t('instances.destroy_confirm_label_after')}
            </Label>
            <Input
              id="confirm-name"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={displayName}
              className="mt-1"
            />
          </div>

          <Button
            variant="destructive"
            onClick={handleDestroy}
            disabled={!canDelete || deleteVM.isPending}
            className="w-full"
          >
            {deleteVM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('instances.destroy_button', { type: vmTypeLabel(type) })}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
