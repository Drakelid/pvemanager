import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Download, Pencil, KeyRound, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  type SSHKey,
  useMySSHKeys, useCreateMySSHKey, useUpdateMySSHKey, useDeleteMySSHKey, useDownloadMyPrivateKey,
  useUserSSHKeys, useAdminCreateUserSSHKey, useAdminUpdateUserSSHKey,
  useAdminDeleteUserSSHKey, useAdminDownloadUserPrivateKey,
} from '@/hooks/use-ssh-keys';

interface Props {
  /** When provided + admin=true, manage another user's keys via admin endpoints. */
  userId?: number | null;
  admin?: boolean;
}

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Error';
}

export function SSHKeysManager({ userId = null, admin = false }: Props) {
  const { t } = useTranslation();

  const myList = useMySSHKeys();
  const adminList = useUserSSHKeys(admin && userId ? userId : null);

  const myCreate = useCreateMySSHKey();
  const myUpdate = useUpdateMySSHKey();
  const myDelete = useDeleteMySSHKey();
  const myDownload = useDownloadMyPrivateKey();

  const adminCreate = useAdminCreateUserSSHKey();
  const adminUpdate = useAdminUpdateUserSSHKey();
  const adminDelete = useAdminDeleteUserSSHKey();
  const adminDownload = useAdminDownloadUserPrivateKey();

  const isAdminMode = admin && !!userId;
  const list = isAdminMode ? adminList : myList;
  const keys: SSHKey[] = list.data ?? [];

  const [editing, setEditing] = useState<SSHKey | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const onCreate = (data: { name: string; public_key: string; private_key?: string; comment?: string }) => {
    if (isAdminMode && userId) {
      adminCreate.mutate(
        { userId, data },
        {
          onSuccess: () => { setCreateOpen(false); toast.success(t('ssh_keys.created')); },
          onError: e => toast.error(getErrMsg(e)),
        },
      );
    } else {
      myCreate.mutate(data, {
        onSuccess: () => { setCreateOpen(false); toast.success(t('ssh_keys.created')); },
        onError: e => toast.error(getErrMsg(e)),
      });
    }
  };

  const onUpdate = (id: number, data: { name?: string; public_key?: string; private_key?: string; comment?: string }) => {
    if (isAdminMode && userId) {
      adminUpdate.mutate(
        { userId, keyId: id, data },
        {
          onSuccess: () => { setEditing(null); toast.success(t('common.saved')); },
          onError: e => toast.error(getErrMsg(e)),
        },
      );
    } else {
      myUpdate.mutate(
        { id, data },
        {
          onSuccess: () => { setEditing(null); toast.success(t('common.saved')); },
          onError: e => toast.error(getErrMsg(e)),
        },
      );
    }
  };

  const onDelete = (id: number) => {
    if (!confirm(t('ssh_keys.confirm_delete'))) return;
    if (isAdminMode && userId) {
      adminDelete.mutate({ userId, keyId: id }, {
        onSuccess: () => toast.success(t('ssh_keys.deleted')),
        onError: e => toast.error(getErrMsg(e)),
      });
    } else {
      myDelete.mutate(id, {
        onSuccess: () => toast.success(t('ssh_keys.deleted')),
        onError: e => toast.error(getErrMsg(e)),
      });
    }
  };

  const onDownload = (key: SSHKey) => {
    const onSuccess = (res: { name: string; private_key: string }) => {
      const blob = new Blob([res.private_key], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.name.replace(/[^a-z0-9._-]+/gi, '_')}.key`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };
    if (isAdminMode && userId) {
      adminDownload.mutate({ userId, keyId: key.id }, {
        onSuccess,
        onError: e => toast.error(getErrMsg(e)),
      });
    } else {
      myDownload.mutate(key.id, {
        onSuccess,
        onError: e => toast.error(getErrMsg(e)),
      });
    }
  };

  const copyPublic = (k: SSHKey) => {
    navigator.clipboard.writeText(k.public_key).then(
      () => toast.success(t('ssh_keys.copied')),
      () => toast.error(t('ssh_keys.copy_failed')),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          <span className="text-sm font-medium">{t('ssh_keys.title')}</span>
          <Badge variant="outline" className="text-xs">{keys.length}</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button size="sm"><Plus className="mr-1 h-4 w-4" />{t('ssh_keys.add')}</Button>} />
          <SSHKeyDialog
            mode="create"
            onSubmit={onCreate}
            submitting={isAdminMode ? adminCreate.isPending : myCreate.isPending}
          />
        </Dialog>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{t('ssh_keys.empty')}</p>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{k.name}</span>
                    {k.has_private_key && (
                      <Badge variant="outline" className="text-xs">{t('ssh_keys.has_private')}</Badge>
                    )}
                  </div>
                  {k.comment && (
                    <p className="text-xs text-muted-foreground mt-0.5">{k.comment}</p>
                  )}
                  {k.fingerprint && (
                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{k.fingerprint}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => copyPublic(k)} title={t('ssh_keys.copy_public')}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {k.has_private_key && (
                    <Button size="sm" variant="ghost" onClick={() => onDownload(k)} title={t('ssh_keys.download_private')}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(k)} title={t('common.edit')}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(k.id)} title={t('common.delete')}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="text-xs font-mono break-all bg-muted/40 rounded px-2 py-1">
                {k.public_key.length > 120 ? `${k.public_key.slice(0, 120)}…` : k.public_key}
              </p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <SSHKeyDialog
            mode="edit"
            initial={editing}
            onSubmit={data => onUpdate(editing.id, data)}
            submitting={isAdminMode ? adminUpdate.isPending : myUpdate.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

function SSHKeyDialog({
  mode, initial, onSubmit, submitting,
}: {
  mode: 'create' | 'edit';
  initial?: SSHKey;
  onSubmit: (data: { name: string; public_key: string; private_key?: string; comment?: string }) => void;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [publicKey, setPublicKey] = useState(initial?.public_key ?? '');
  const [privateKey, setPrivateKey] = useState('');
  const [comment, setComment] = useState(initial?.comment ?? '');

  const valid = useMemo(() => name.trim().length > 0 && publicKey.trim().length >= 20, [name, publicKey]);

  const submit = () => {
    onSubmit({
      name: name.trim(),
      public_key: publicKey.trim(),
      private_key: privateKey.trim() || undefined,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? t('ssh_keys.add') : t('ssh_keys.edit')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">{t('common.name')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="laptop / work / ci" />
        </div>
        <div>
          <Label className="text-xs">{t('ssh_keys.public_key')} <span className="text-destructive">*</span></Label>
          <textarea
            className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-xs font-mono min-h-[100px]"
            value={publicKey}
            onChange={e => setPublicKey(e.target.value)}
            placeholder="ssh-ed25519 AAAA... user@host"
          />
        </div>
        <div>
          <Label className="text-xs">
            {t('ssh_keys.private_key')} <span className="text-muted-foreground">({t('common.optional')})</span>
          </Label>
          <textarea
            className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-xs font-mono min-h-[120px]"
            value={privateKey}
            onChange={e => setPrivateKey(e.target.value)}
            placeholder={mode === 'edit' ? t('ssh_keys.private_key_replace_hint') : '-----BEGIN OPENSSH PRIVATE KEY-----\n...'}
          />
          <p className="text-xs text-muted-foreground mt-1">{t('ssh_keys.private_key_hint')}</p>
        </div>
        <div>
          <Label className="text-xs">{t('ssh_keys.comment')}</Label>
          <Input value={comment} onChange={e => setComment(e.target.value)} className="mt-1" />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{t('common.cancel')}</DialogClose>
        <Button onClick={submit} disabled={!valid || submitting}>
          {mode === 'create' ? t('common.create') : t('common.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
