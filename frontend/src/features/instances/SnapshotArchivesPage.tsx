import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Camera, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSnapshotArchives, useSnapshotArchiveDetail } from '@/hooks/use-instances';

export default function SnapshotArchivesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useSnapshotArchives({ limit: 200 });
  const [detailId, setDetailId] = useState<number | null>(null);
  const { data: detail } = useSnapshotArchiveDetail(detailId);

  const archives = data?.archives ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button render={<Link to="/instances" />} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Camera className="h-6 w-6" />{t('snap_archive.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('snap_archive.subtitle')}</p>
        </div>
        {data && <Badge variant="secondary" className="ml-auto">{data.total}</Badge>}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : archives.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Camera className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <p>{t('snap_archive.empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('snap_archive.snapshot')}</TableHead>
                  <TableHead>VM</TableHead>
                  <TableHead>{t('nodes.title')}</TableHead>
                  <TableHead>{t('snap_archive.deleted_by')}</TableHead>
                  <TableHead>{t('snap_archive.archived_at')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archives.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono font-medium">
                      {a.snapname}
                      {a.description && <p className="text-xs text-muted-foreground font-sans">{a.description}</p>}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{a.vm_name || '—'}</span>
                      <span className="ml-1 text-xs text-muted-foreground">#{a.vmid}</span>
                      {a.vm_type && <Badge variant="outline" className="ml-2 text-[10px]">{a.vm_type === 'qemu' ? 'VM' : 'LXC'}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.server_name || a.server_id}{a.node ? ` / ${a.node}` : ''}</TableCell>
                    <TableCell className="text-xs">{a.deleted_by || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.archived_at ? new Date(a.archived_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailId(a.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailId != null} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detail?.snapname || t('snap_archive.title')}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <Row label="VM" value={`${detail.vm_name || ''} #${detail.vmid} (${detail.vm_type})`} />
              <Row label={t('nodes.title')} value={`${detail.server_name || detail.server_id}${detail.node ? ` / ${detail.node}` : ''}`} />
              {detail.parent && <Row label={t('snap_archive.parent')} value={detail.parent} />}
              <Row label={t('snap_archive.deleted_by')} value={detail.deleted_by || '—'} />
              {detail.deletion_reason && <Row label={t('snap_archive.reason')} value={detail.deletion_reason} />}
              <Row label={t('snap_archive.archived_at')} value={detail.archived_at ? new Date(detail.archived_at).toLocaleString() : '—'} />
              {detail.snapshot_config && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t('snap_archive.config')}</p>
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{detail.snapshot_config}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
