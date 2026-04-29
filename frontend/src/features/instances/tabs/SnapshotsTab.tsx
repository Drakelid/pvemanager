import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RotateCcw, Loader2, Camera } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useSnapshots,
  useCreateSnapshot,
  useDeleteSnapshot,
  useRollbackSnapshot,
} from '@/hooks/use-instances';
import { toast } from 'sonner';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

export default function SnapshotsTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useSnapshots(serverId, vmid, type, node);
  const createSnap = useCreateSnapshot(serverId, vmid, type);
  const deleteSnap = useDeleteSnapshot(serverId, vmid, type, node);
  const rollbackSnap = useRollbackSnapshot(serverId, vmid, type, node);

  const [showCreate, setShowCreate] = useState(false);
  const [snapName, setSnapName] = useState('');
  const [snapDesc, setSnapDesc] = useState('');
  const [includeRAM, setIncludeRAM] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  const snapshots = data?.snapshots || [];

  const handleCreate = () => {
    if (!snapName.trim()) return;
    createSnap.mutate(
      { snapname: snapName.trim(), description: snapDesc, vmstate: includeRAM },
      {
        onSuccess: () => {
          toast.success(`Snapshot "${snapName}" created`);
          setShowCreate(false);
          setSnapName('');
          setSnapDesc('');
          setIncludeRAM(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteSnap.mutate(deleteTarget, {
      onSuccess: () => {
        toast.success(`Snapshot "${deleteTarget}" deleted`);
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleRollback = () => {
    if (!rollbackTarget) return;
    rollbackSnap.mutate(rollbackTarget, {
      onSuccess: () => {
        toast.success(`Rolled back to "${rollbackTarget}"`);
        setRollbackTarget(null);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create Snapshot
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Camera className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">{t('instances.no_snapshots')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snap) => (
                  <TableRow key={snap.name}>
                    <TableCell className="font-medium">{snap.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {snap.description || '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {snap.snaptime
                        ? new Date(snap.snaptime * 1000).toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {snap.vmstate ? (
                        <Badge variant="secondary" className="text-[10px]">RAM</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setRollbackTarget(snap.name)}
                          title={t('instances.rollback')}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(snap.name)}
                          title={t('instances.delete_snapshot')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="snap-name">Name</Label>
              <Input
                id="snap-name"
                value={snapName}
                onChange={(e) => setSnapName(e.target.value)}
                placeholder={t('common.placeholder_snapshot_name')}
              />
            </div>
            <div>
              <Label htmlFor="snap-desc">{t('common.description')} (optional)</Label>
              <Input
                id="snap-desc"
                value={snapDesc}
                onChange={(e) => setSnapDesc(e.target.value)}
                placeholder={t('common.description')}
              />
            </div>
            {type === 'qemu' && (
              <div className="flex items-center gap-2">
                <input
                  id="snap-ram"
                  type="checkbox"
                  checked={includeRAM}
                  onChange={(e) => setIncludeRAM(e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="snap-ram" className="text-sm">Include VM memory (RAM state)</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!snapName.trim() || createSnap.isPending}>
              {createSnap.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Snapshot</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete snapshot <strong>"{deleteTarget}"</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSnap.isPending}>
              {deleteSnap.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback confirmation */}
      <Dialog open={!!rollbackTarget} onOpenChange={() => setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback to Snapshot</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to rollback to <strong>"{rollbackTarget}"</strong>?
            Current state will be lost.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>Cancel</Button>
            <Button onClick={handleRollback} disabled={rollbackSnap.isPending}>
              {rollbackSnap.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
