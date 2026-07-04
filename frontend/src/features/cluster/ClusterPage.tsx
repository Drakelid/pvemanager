import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network, Server, Plus, Loader2, LogOut, AlertTriangle, Info,
  ArrowRight, ArrowLeft, ShieldAlert, Boxes,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusDot } from '@/components/shared/status-dot';
import { formatBytes } from '@/lib/format';
import {
  useClusterTopology, useCreateCluster, usePreJoinCheck, usePrepareJoin,
  useJoinCluster, useEjectNode,
} from '@/hooks/use-cluster';
import type { ClusterServerEntry, PreJoinCheck } from '@/hooks/use-cluster';
import { toast } from 'sonner';

// ==================== Create Cluster Dialog ====================

function CreateClusterDialog({
  open, onOpenChange, standalone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  standalone: ClusterServerEntry[];
}) {
  const { t } = useTranslation();
  const createCluster = useCreateCluster();
  const [serverId, setServerId] = useState<string>('');
  const [clusterName, setClusterName] = useState('');
  const [link0, setLink0] = useState('');
  const [rootpw, setRootpw] = useState('');

  const reset = () => { setServerId(''); setClusterName(''); setLink0(''); setRootpw(''); };

  const nameValid = /^[a-zA-Z][a-zA-Z0-9-]{0,14}$/.test(clusterName);

  const handleSubmit = () => {
    createCluster.mutate(
      {
        server_id: Number(serverId),
        cluster_name: clusterName.trim(),
        link0_ip: link0.trim() || undefined,
        rootpw: rootpw.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success(res.message || t('cluster.create_started', 'Cluster creation started'));
          reset();
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('cluster.create_title', 'Create cluster')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('cluster.select_node', 'Standalone server')}</Label>
            <Select value={serverId} onValueChange={(v) => { if (v !== null) setServerId(v); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t('cluster.select_node', 'Select server')} /></SelectTrigger>
              <SelectContent>
                {standalone.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.ip_address})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('cluster.cluster_name', 'Cluster name')}</Label>
            <Input
              value={clusterName}
              onChange={(e) => setClusterName(e.target.value)}
              className="mt-1"
              placeholder="my-cluster"
            />
            {clusterName && !nameValid && (
              <p className="mt-1 text-xs text-destructive">
                {t('cluster.name_rule', 'Starts with a letter; letters, digits, hyphens; max 15 chars.')}
              </p>
            )}
          </div>

          <div>
            <Label>{t('cluster.link0', 'Corosync link0 IP (optional)')}</Label>
            <Input value={link0} onChange={(e) => setLink0(e.target.value)} className="mt-1" placeholder="10.10.10.1" />
            <p className="mt-1 text-xs text-muted-foreground">
              {t('cluster.link0_hint', 'Dedicated network for corosync is recommended in production.')}
            </p>
          </div>

          <div>
            <Label>{t('cluster.rootpw_optional', 'root@pam password (if not saved on server)')}</Label>
            <Input type="password" value={rootpw} onChange={(e) => setRootpw(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose render={<Button variant="outline" />}>{t('common.cancel', 'Cancel')}</DialogClose>
          <Button onClick={handleSubmit} disabled={createCluster.isPending || !serverId || !nameValid}>
            {createCluster.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('cluster.create_btn', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Join Wizard ====================

function JoinWizard({
  open, onOpenChange, standalone, clusterMembers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  standalone: ClusterServerEntry[];
  clusterMembers: ClusterServerEntry[];
}) {
  const { t } = useTranslation();
  const preJoinCheck = usePreJoinCheck();
  const prepareJoin = usePrepareJoin();
  const joinCluster = useJoinCluster();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nodeServerId, setNodeServerId] = useState('');
  const [clusterServerId, setClusterServerId] = useState('');
  const [check, setCheck] = useState<PreJoinCheck | null>(null);
  const [backupStorage, setBackupStorage] = useState('');
  const [prepared, setPrepared] = useState(false);
  const [rootpw, setRootpw] = useState('');
  const [link0, setLink0] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const reset = () => {
    setStep(1); setNodeServerId(''); setClusterServerId(''); setCheck(null);
    setBackupStorage(''); setPrepared(false); setRootpw(''); setLink0(''); setConfirmed(false);
  };

  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const runCheck = () => {
    preJoinCheck.mutate(Number(nodeServerId), {
      onSuccess: (data) => { setCheck(data); setPrepared(data.ready_for_join); setStep(2); },
      onError: (err) => toast.error(err.message),
    });
  };

  const runPrepare = () => {
    prepareJoin.mutate(
      { node_server_id: Number(nodeServerId), backup_storage: backupStorage },
      {
        onSuccess: (res) => {
          if (res.ready_for_join) {
            toast.success(res.message);
            setPrepared(true);
          } else {
            toast.error(res.message);
          }
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const runJoin = () => {
    joinCluster.mutate(
      {
        node_server_id: Number(nodeServerId),
        cluster_server_id: Number(clusterServerId),
        rootpw: rootpw.trim(),
        link0: link0.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success(res.message || t('cluster.join_started', 'Join started'));
          reset();
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const joiningServer = standalone.find((s) => s.id === Number(nodeServerId));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('cluster.join_title', 'Join node to cluster')} — {t('cluster.step', 'Step')} {step}/3
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: choose nodes */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>{t('cluster.joining_node', 'Node to join (standalone)')}</Label>
              <Select value={nodeServerId} onValueChange={(v) => { if (v !== null) setNodeServerId(v); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('cluster.select_node', 'Select server')} /></SelectTrigger>
                <SelectContent>
                  {standalone.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.ip_address})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('cluster.target_cluster', 'Target cluster node')}</Label>
              <Select value={clusterServerId} onValueChange={(v) => { if (v !== null) setClusterServerId(v); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('cluster.select_cluster', 'Select cluster node')} /></SelectTrigger>
                <SelectContent>
                  {clusterMembers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} — {s.cluster_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <DialogClose render={<Button variant="outline" />}>{t('common.cancel', 'Cancel')}</DialogClose>
              <Button
                onClick={runCheck}
                disabled={!nodeServerId || !clusterServerId || nodeServerId === clusterServerId || preJoinCheck.isPending}
              >
                {preJoinCheck.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.next', 'Next')} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: pre-join check / prepare */}
        {step === 2 && check && (
          <div className="space-y-4">
            {check.guests_count === 0 ? (
              <div className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{t('cluster.node_clean', 'Node has no VMs/containers — ready to join.')}</span>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    {t('cluster.guests_warning',
                      'Joining a cluster overwrites /etc/pve — all VMs/containers on this node will be lost. They must be backed up and deleted first.')}
                  </span>
                </div>

                <div className="max-h-40 overflow-y-auto rounded-md border">
                  {check.guests.map((g) => (
                    <div key={`${g.type}-${g.vmid}`} className="flex items-center justify-between border-b px-3 py-1.5 text-sm last:border-b-0">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-2xs">{g.type === 'qemu' ? 'VM' : 'LXC'}</Badge>
                        {g.name} <span className="text-muted-foreground">#{g.vmid}</span>
                      </span>
                      <StatusDot status={g.status} />
                    </div>
                  ))}
                </div>

                <div>
                  <Label>{t('cluster.backup_storage', 'Backup storage')}</Label>
                  <Select value={backupStorage} onValueChange={(v) => { if (v !== null) setBackupStorage(v); }} disabled={prepared}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={t('cluster.select_storage', 'Select storage')} /></SelectTrigger>
                    <SelectContent>
                      {check.backup_storages.map((s) => (
                        <SelectItem key={s.storage} value={s.storage}>
                          {s.storage} ({s.type}{s.avail ? `, ${formatBytes(s.avail)} ${t('cluster.free', 'free')}` : ''})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {check.backup_storages.length === 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      {t('cluster.no_backup_storage', 'No backup-capable storage found on this node.')}
                    </p>
                  )}
                </div>

                {!prepared && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={runPrepare}
                    disabled={!backupStorage || prepareJoin.isPending}
                  >
                    {prepareJoin.isPending
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('cluster.preparing', 'Backing up & deleting… (may take minutes)')}</>
                      : t('cluster.prepare_btn', 'Back up & clear node')}
                  </Button>
                )}
                {prepared && (
                  <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm">
                    <Info className="h-4 w-4 text-success" />
                    {t('cluster.node_ready', 'Node cleared and ready to join.')}
                  </div>
                )}
              </>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" />{t('common.back', 'Back')}
              </Button>
              <Button onClick={() => setStep(3)} disabled={!prepared}>
                {t('common.next', 'Next')} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: confirm + join */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                {t('cluster.join_final_warning',
                  'The node will be joined to the cluster and its Proxmox interface will restart for a moment. This cannot be undone.')}
              </span>
            </div>

            <div>
              <Label>{t('cluster.node_rootpw', 'root@pam password of the joining node')}</Label>
              <Input type="password" value={rootpw} onChange={(e) => setRootpw(e.target.value)} className="mt-1" autoFocus />
            </div>
            <div>
              <Label>{t('cluster.link0', 'Corosync link0 IP (optional)')}</Label>
              <Input value={link0} onChange={(e) => setLink0(e.target.value)} className="mt-1" placeholder={joiningServer?.ip_address} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4" />
              {t('cluster.confirm_understand', 'I understand this is irreversible')}
            </label>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" />{t('common.back', 'Back')}
              </Button>
              <Button onClick={runJoin} disabled={!rootpw || !confirmed || joinCluster.isPending}>
                {joinCluster.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('cluster.join_btn', 'Join cluster')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== Eject Dialog ====================

function EjectDialog({
  open, onOpenChange, viaServer, node,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viaServer: ClusterServerEntry | null;
  node: ClusterServerEntry | null;
}) {
  const { t } = useTranslation();
  const ejectNode = useEjectNode();
  const [rootpw, setRootpw] = useState('');

  const handleEject = () => {
    if (!viaServer || !node) return;
    ejectNode.mutate(
      { serverId: viaServer.id, node_name: node.hostname, rootpw: rootpw.trim() || undefined, clear_panel_entry: true },
      {
        onSuccess: (res) => { toast.success(res.message); setRootpw(''); onOpenChange(false); },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setRootpw(''); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('cluster.eject_title', 'Eject node from cluster')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              {t('cluster.eject_warning',
                'The node must be powered OFF before ejecting, and must not rejoin the same cluster network afterwards.')}
            </span>
          </div>
          <p className="text-sm">
            {t('cluster.eject_confirm', 'Eject')} <b>{node?.name}</b> ({node?.hostname}){' '}
            {t('cluster.eject_via', 'via')} <b>{viaServer?.name}</b>?
          </p>
          <div>
            <Label>{t('cluster.rootpw_ssh', 'root password (for SSH fallback, optional)')}</Label>
            <Input type="password" value={rootpw} onChange={(e) => setRootpw(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose render={<Button variant="outline" />}>{t('common.cancel', 'Cancel')}</DialogClose>
          <Button variant="destructive" onClick={handleEject} disabled={ejectNode.isPending}>
            {ejectNode.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('cluster.eject_btn', 'Eject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Page ====================

export default function ClusterPage() {
  const { t } = useTranslation();
  const { data: topology, isLoading } = useClusterTopology();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [ejectState, setEjectState] = useState<{ via: ClusterServerEntry; node: ClusterServerEntry } | null>(null);

  const standalone = topology?.standalone ?? [];
  const clusters = topology?.clusters ?? {};
  const clusterMembers = useMemo(() => Object.values(clusters).flat(), [clusters]);
  const hasClusters = Object.keys(clusters).length > 0;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">{t('common.loading', 'Loading…')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.cluster', 'Cluster')}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)} disabled={!hasClusters || standalone.length === 0}>
            <Plus className="mr-1 h-4 w-4" />{t('cluster.join_node', 'Join node')}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={standalone.length === 0}>
            <Plus className="mr-1 h-4 w-4" />{t('cluster.create_btn', 'Create cluster')}
          </Button>
        </div>
      </div>

      {/* Clusters */}
      {Object.entries(clusters).map(([name, members]) => (
        <Card key={name}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">{name}</h2>
              <Badge variant="secondary">{members.length} {t('cluster.nodes', 'nodes')}</Badge>
            </div>

            {members.length === 2 && (
              <div className="flex items-start gap-2 rounded-md bg-warning/10 p-2.5 text-xs">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>{t('cluster.two_node_quorum', 'A 2-node cluster loses quorum if one node fails. 3+ nodes or a QDevice is recommended for production.')}</span>
              </div>
            )}

            <div className="divide-y rounded-md border">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{m.ip_address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusDot status={m.is_online ? 'online' : 'offline'} />
                      {m.is_online ? t('common.online', 'Online') : t('common.offline', 'Offline')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title={t('cluster.eject_title', 'Eject node')}
                      onClick={() => setEjectState({ via: members.find((x) => x.id !== m.id) ?? m, node: m })}
                      disabled={members.length < 2}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Standalone servers */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">{t('cluster.standalone', 'Standalone servers')}</h2>
            <Badge variant="outline">{standalone.length}</Badge>
          </div>
          {standalone.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('cluster.no_standalone', 'No standalone servers.')}</p>
          ) : (
            <div className="divide-y rounded-md border">
              {standalone.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{s.ip_address}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusDot status={s.is_online ? 'online' : 'offline'} />
                    {s.is_online ? t('common.online', 'Online') : t('common.offline', 'Offline')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateClusterDialog open={createOpen} onOpenChange={setCreateOpen} standalone={standalone} />
      <JoinWizard open={joinOpen} onOpenChange={setJoinOpen} standalone={standalone} clusterMembers={clusterMembers} />
      <EjectDialog
        open={ejectState !== null}
        onOpenChange={(v) => { if (!v) setEjectState(null); }}
        viaServer={ejectState?.via ?? null}
        node={ejectState?.node ?? null}
      />
    </div>
  );
}
