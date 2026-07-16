import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Server, Cpu, CheckCircle, ChevronLeft, ChevronRight, Loader2, Monitor, Container, HardDrive, KeyRound, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServers, useNodes } from '@/hooks/use-nodes';
import { useTemplates, useTemplateGroups } from '@/hooks/use-templates';
import { useIPAMNetworks } from '@/hooks/use-ipam';
import { scopedNetworks, autoPickNetworkId } from '@/features/ipam/network-scope';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useLXCTemplates, useLXCStorages, useDeployLXC } from '@/hooks/use-lxc-templates';
import { useMySSHKeys, useUserSSHKeys } from '@/hooks/use-ssh-keys';
import { useProfile, useMyQuota } from '@/hooks/use-settings';
import { useUsers } from '@/hooks/use-users';
import { apiClient } from '@/lib/api-client';
import { useDeployTasksStore } from '@/stores/deploy-tasks-store';
import type { VMDeployRequest, OSTemplate, ProxmoxServer, LXCTemplate } from '@/types';
import { toast } from 'sonner';

type InstanceKind = 'vm' | 'lxc';
const STEPS = ['server', 'type', 'template', 'config', 'confirm'] as const;
type Step = (typeof STEPS)[number];

export default function CreateInstanceWizard({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleClose = onClose ?? (() => navigate(-1));
  const [step, setStep] = useState<Step>('server');
  const stepIdx = STEPS.indexOf(step);

  const addDeployTask = useDeployTasksStore((s) => s.addTask);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [kind, setKind] = useState<InstanceKind>('lxc');
  const [selectedServer, setSelectedServer] = useState<ProxmoxServer | null>(null);

  // ── VM state ──────────────────────────────────────────────────────────────
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<OSTemplate | null>(null);
  const [config, setConfig] = useState<{
    name: string;
    cores: number;
    memory: number;
    disk: number;
    storage: string;
    bridge: string;
    ipam_network_id: number | null;
    ip_address: string;
    gateway: string;
    start_after_create: boolean;
    cloud_init_user: string;
    cloud_init_password: string;
    ssh_keys: string;
  }>({
    name: '',
    cores: 2,
    memory: 2048,
    disk: 30,
    storage: 'local-lvm',
    bridge: 'vmbr0',
    ipam_network_id: null,
    ip_address: '',
    gateway: '',
    start_after_create: true,
    cloud_init_user: '',
    cloud_init_password: '',
    ssh_keys: '',
  });

  // ── LXC state ─────────────────────────────────────────────────────────────
  const [selectedLXCTemplate, setSelectedLXCTemplate] = useState<LXCTemplate | null>(null);
  const [lxcConfig, setLxcConfig] = useState({
    name: '',
    cores: 1,
    memory: 512,
    swap: 512,
    disk: 8,
    storage: 'local-lvm',
    bridge: 'vmbr0',
    ipam_network_id: null as number | null,
    ip_address: '',
    gateway: '',
    password: '',
    ssh_keys: '',
    nameserver: '',
    unprivileged: true,
    start_after_create: true,
    onboot: false,
  });

  // Queries
  const { data: servers = [] } = useServers();
  const { data: groups = [] } = useTemplateGroups();
  const { data: templates = [] } = useTemplates(undefined, selectedServer?.id);
  const { data: networks = [] } = useIPAMNetworks();
  const { data: lxcTemplates = [], isLoading: lxcLoading } = useLXCTemplates(selectedServer?.id);
  const { data: lxcStorages = [] } = useLXCStorages(selectedServer?.id, selectedNode || undefined, 'rootdir');
  const { data: vmStorages = [] } = useLXCStorages(selectedServer?.id, selectedNode || undefined, 'images');
  const { data: nodesData } = useNodes(selectedServer?.id ?? 0);
  const nodes = nodesData?.nodes ?? [];
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  // Нода нужна только для размещения; сеть подбирается по активной рабочей области.
  const handleVMNodeChange = (node: string) => setSelectedNode(node);

  // ── SSH Keys & ownership ──────────────────────────────────────────────────
  const { data: profile } = useProfile();
  const isAdmin = !!profile?.is_admin;
  const { data: allUsers = [] } = useUsers();
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const effectiveOwnerId = isAdmin && ownerId ? ownerId : null;
  const { data: myKeys = [] } = useMySSHKeys();
  const { data: targetUserKeys = [] } = useUserSSHKeys(effectiveOwnerId);
  const [selectedKeyIds, setSelectedKeyIds] = useState<number[]>([]);
  const availableKeys = isAdmin && effectiveOwnerId
    ? [...myKeys, ...targetUserKeys.filter(k => !myKeys.find(m => m.id === k.id))]
    : myKeys;
  const toggleKey = (id: number) =>
    setSelectedKeyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const deploy = useMutation({
    mutationFn: (data: VMDeployRequest) =>
      apiClient.post<{ task_id: number; status: string; name: string }>('/templates/api/deploy', data),
    onSuccess: (res) => {
      addDeployTask({
        id: res.task_id,
        name: res.name,
        status: 'pending',
        step: t('wizard.deploy_starting'),
        progress: 0,
        vmid: null,
        node: null,
        error_message: null,
      });
      toast.success(t('wizard.deploy_queued', { name: res.name }));
      navigate('/instances');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deployLXC = useDeployLXC();

  const next = () => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  };
  const prev = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };

  const canNext = () => {
    if (step === 'server') return !!selectedServer;
    if (step === 'type') return !!kind;
    if (step === 'template') return kind === 'vm' ? !!selectedTemplate : !!selectedLXCTemplate;
    if (step === 'config') return kind === 'vm' ? config.name.length >= 2 : lxcConfig.name.length >= 2;
    return true;
  };

  const handleDeploy = () => {
    if (kind === 'lxc') {
      if (!selectedLXCTemplate || !selectedServer) return;
      deployLXC.mutate(
        {
          server_id: selectedServer.id,
          ostemplate: selectedLXCTemplate.volid,
          node: selectedLXCTemplate.node || undefined,
          name: lxcConfig.name,
          cores: lxcConfig.cores,
          memory: lxcConfig.memory,
          swap: lxcConfig.swap,
          disk: lxcConfig.disk,
          storage: lxcConfig.storage,
          bridge: lxcConfig.bridge,
          ip_address: lxcConfig.ip_address || undefined,
          gateway: lxcConfig.gateway || undefined,
          ipam_network_id: lxcConfig.ipam_network_id || undefined,
          password: lxcConfig.password || undefined,
          ssh_keys: lxcConfig.ssh_keys || undefined,
          ssh_key_ids: selectedKeyIds.length ? selectedKeyIds : undefined,
          owner_id: effectiveOwnerId ?? undefined,
          nameserver: lxcConfig.nameserver || undefined,
          unprivileged: lxcConfig.unprivileged,
          start_after_create: lxcConfig.start_after_create,
          onboot: lxcConfig.onboot,
        },
        {
          onSuccess: (res) => {
            addDeployTask({
              id: res.task_id,
              name: res.name,
              status: 'pending',
              step: t('wizard.deploy_starting'),
              progress: 0,
              vmid: null,
              node: null,
              error_message: null,
            });
            toast.success(t('wizard.deploy_queued', { name: res.name }));
            navigate('/instances');
          },
          onError: (err: Error) => toast.error(err.message),
        },
      );
    } else {
      if (!selectedTemplate) return;
      deploy.mutate({
        template_id: selectedTemplate.id,
        name: config.name,
        target_node: selectedNode || undefined,
        cores: config.cores,
        memory: config.memory,
        disk: config.disk,
        target_storage: config.storage,
        start_after_create: config.start_after_create,
        network_bridge: config.bridge,
        ip_address: config.ip_address || undefined,
        gateway: config.gateway || undefined,
        ipam_network_id: config.ipam_network_id || undefined,
        cloud_init_user: config.cloud_init_user || undefined,
        cloud_init_password: config.cloud_init_password || undefined,
        ssh_keys: config.ssh_keys || undefined,
        ssh_key_ids: selectedKeyIds.length ? selectedKeyIds : undefined,
        owner_id: effectiveOwnerId ?? undefined,
      });
    }
  };

  // ── Filtered IPAM networks ────────────────────────────────────────────────
  // Сети активной рабочей области (список уже отфильтрован бэкендом по X-Active-Workspace).
  const vmFilteredNetworks = scopedNetworks(networks, activeWorkspaceId);
  const lxcFilteredNetworks = vmFilteredNetworks;

  // Apply template defaults when template selected
  const selectTemplate = (tpl: OSTemplate) => {
    setSelectedTemplate(tpl);
    setConfig(prev => ({
      ...prev,
      cores: tpl.default_cores,
      memory: tpl.default_memory,
      disk: tpl.default_disk,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                i < stepIdx ? 'bg-success/20 text-success' :
                i === stepIdx ? 'bg-primary/20 text-primary ring-2 ring-primary/50' :
                'bg-muted text-muted-foreground'
              }`}>
                {i < stepIdx ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-8 ${i < stepIdx ? 'bg-success/50' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

      {/* Step 1: Server */}
      {step === 'server' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.select_server')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {servers.map(srv => (
              <Card
                key={srv.id}
                className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedServer?.id === srv.id ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => {
                  setSelectedServer(srv); setSelectedLXCTemplate(null); setSelectedTemplate(null);
                  setSelectedNode('');
                  const nid = autoPickNetworkId(networks, activeWorkspaceId);
                  setConfig(p => ({ ...p, ipam_network_id: nid }));
                  setLxcConfig(p => ({ ...p, ipam_network_id: nid }));
                }}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <Server className="h-8 w-8 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{srv.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{srv.ip_address}:{srv.port}</p>
                  </div>
                  <Badge variant={srv.is_online ? 'default' : 'destructive'}>
                    {srv.is_online ? t('common.online') : t('common.offline')}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Type selection */}
      {step === 'type' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.select_type')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card
              interactive
              className={kind === 'vm' ? 'border-primary bg-primary/5' : ''}
              onClick={() => setKind('vm')}
            >
              <CardContent className="flex items-center gap-4 p-5">
                <HardDrive className="h-10 w-10 text-primary shrink-0" />
                <div>
                  <p className="font-semibold">{t('wizard.type_vm')}</p>
                  <p className="text-sm text-muted-foreground">{t('wizard.type_vm_desc')}</p>
                </div>
                {kind === 'vm' && <CheckCircle className="ml-auto h-5 w-5 text-primary shrink-0" />}
              </CardContent>
            </Card>
            <Card
              interactive
              className={kind === 'lxc' ? 'border-success bg-success/5' : ''}
              onClick={() => setKind('lxc')}
            >
              <CardContent className="flex items-center gap-4 p-5">
                <Container className="h-10 w-10 text-success shrink-0" />
                <div>
                  <p className="font-semibold">{t('wizard.type_lxc')}</p>
                  <p className="text-sm text-muted-foreground">{t('wizard.type_lxc_desc')}</p>
                </div>
                {kind === 'lxc' && <CheckCircle className="ml-auto h-5 w-5 text-success shrink-0" />}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Step 3: Template — VM */}
      {step === 'template' && kind === 'vm' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.select_template')}</h3>
          {groups.map(group => {
            const groupTemplates = templates.filter(t => t.group_id === group.id && t.vm_type === 'qemu');
            if (groupTemplates.length === 0) return null;
            return (
              <div key={group.id} className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{group.name}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupTemplates.map(tpl => (
                    <Card
                      key={tpl.id}
                      className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedTemplate?.id === tpl.id ? 'border-primary bg-primary/5' : ''}`}
                      onClick={() => selectTemplate(tpl)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          {tpl.group_icon ? (
                            <span className="text-lg" dangerouslySetInnerHTML={{ __html: tpl.group_icon }} />
                          ) : (
                            <Monitor className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm truncate">{tpl.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tpl.default_cores} vCPU · {tpl.default_memory} MB · {tpl.default_disk} GB
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {templates.filter(t => t.vm_type === 'qemu').length === 0 && (
            <p className="text-center text-muted-foreground py-8">{t('wizard.no_templates')}</p>
          )}
        </div>
      )}

      {/* Step 3: Template — LXC */}
      {step === 'template' && kind === 'lxc' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.select_lxc_template')}</h3>
          {lxcLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('common.loading')}</span>
            </div>
          )}
          {!lxcLoading && lxcTemplates.length === 0 && (
            <p className="text-center text-muted-foreground py-8">{t('wizard.no_lxc_templates')}</p>
          )}
          {!lxcLoading && lxcTemplates.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lxcTemplates.map(tpl => (
                <Card
                  key={tpl.volid}
                  className={`cursor-pointer transition-colors hover:border-success/50 ${selectedLXCTemplate?.volid === tpl.volid ? 'border-success bg-success/5' : ''}`}
                  onClick={() => {
                    setSelectedLXCTemplate(tpl);
                    const nid = autoPickNetworkId(networks, activeWorkspaceId);
                    setLxcConfig(p => ({ ...p, ipam_network_id: nid }));
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Container className="h-5 w-5 text-success shrink-0" />
                      <span className="font-medium text-sm truncate">{tpl.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground font-mono">
                      {tpl.storage} · {tpl.node}
                    </p>
                    {tpl.size > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {(tpl.size / 1024 / 1024).toFixed(0)} MB
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Configuration — VM */}
      {step === 'config' && kind === 'vm' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{t('wizard.configure')}</h3>
          <QuotaHint addCores={config.cores} addMemoryMb={config.memory} addDiskGb={config.disk} />
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Basic */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t('wizard.basic')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('common.name')}</Label>
                  <Input value={config.name} onChange={e => setConfig(p => ({ ...p, name: e.target.value }))} placeholder={t('common.placeholder_vm_name')} />
                </div>
                <div>
                  <Label>{t('wizard.target_node')}</Label>
                  <Select value={selectedNode || '__auto__'} onValueChange={v => handleVMNodeChange(v && v !== '__auto__' ? v : '')}>
                    <SelectTrigger><SelectValue placeholder={t('wizard.auto_select')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">{t('wizard.auto_select')}</SelectItem>
                      {nodes.map(n => (
                        <SelectItem key={n.node} value={n.node}>{n.node}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="start_after"
                    checked={config.start_after_create}
                    onChange={e => setConfig(p => ({ ...p, start_after_create: e.target.checked }))}
                  />
                  <Label htmlFor="start_after">{t('wizard.start_after_create')}</Label>
                </div>
              </CardContent>
            </Card>

            {/* Resources */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4" />{t('wizard.resources')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>vCPU</Label>
                  <Input
                    type="number"
                    min={selectedTemplate?.min_cores || 1}
                    value={config.cores}
                    onChange={e => setConfig(p => ({ ...p, cores: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>{t('wizard.memory_mb')}</Label>
                  <Input
                    type="number"
                    min={selectedTemplate?.min_memory || 256}
                    step={256}
                    value={config.memory}
                    onChange={e => setConfig(p => ({ ...p, memory: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>{t('wizard.disk_gb')}</Label>
                  <Input
                    type="number"
                    min={selectedTemplate?.min_disk || 5}
                    value={config.disk}
                    onChange={e => setConfig(p => ({ ...p, disk: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>{t('wizard.storage')}</Label>
                  <Select value={config.storage} onValueChange={v => setConfig(p => ({ ...p, storage: v ?? '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vmStorages.length > 0
                        ? vmStorages.map(s => <SelectItem key={s.storage} value={s.storage}>{s.storage} ({s.type})</SelectItem>)
                        : <SelectItem value="local-lvm">local-lvm</SelectItem>
                      }
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Network */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t('wizard.network')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('wizard.bridge')}</Label>
                  <Input value={config.bridge} onChange={e => setConfig(p => ({ ...p, bridge: e.target.value }))} />
                </div>
                <div>
                  <Label>IPAM {t('wizard.network')}</Label>
                  <Select value={String(config.ipam_network_id || '')} onValueChange={v => setConfig(p => ({ ...p, ipam_network_id: v ? Number(v) : null }))}>
                    <SelectTrigger><SelectValue placeholder={t('wizard.manual_ip')} /></SelectTrigger>
                    <SelectContent>
                      {vmFilteredNetworks.map(n => (
                        <SelectItem key={n.id} value={String(n.id)}>{n.name} ({n.network})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!config.ipam_network_id && (
                  <>
                    <div>
                      <Label>IP</Label>
                      <Input value={config.ip_address} onChange={e => setConfig(p => ({ ...p, ip_address: e.target.value }))} placeholder="10.10.10.5" />
                    </div>
                    <div>
                      <Label>Gateway</Label>
                      <Input value={config.gateway} onChange={e => setConfig(p => ({ ...p, gateway: e.target.value }))} placeholder="10.10.10.1" />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Cloud-init */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Cloud-Init</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('wizard.ci_user')}</Label>
                  <Input value={config.cloud_init_user} onChange={e => setConfig(p => ({ ...p, cloud_init_user: e.target.value }))} placeholder={t('common.placeholder_ubuntu')} />
                </div>
                <div>
                  <Label>{t('wizard.ci_password')}</Label>
                  <Input type="password" value={config.cloud_init_password} onChange={e => setConfig(p => ({ ...p, cloud_init_password: e.target.value }))} />
                </div>
                {isAdmin && (
                  <SSHOwnerSelector
                    users={allUsers}
                    value={ownerId}
                    onChange={(v) => { setOwnerId(v); setSelectedKeyIds([]); }}
                  />
                )}
                <SSHKeyPicker keys={availableKeys} selected={selectedKeyIds} onToggle={toggleKey} />
                {availableKeys.length === 0 && (
                  <div>
                    <Label>SSH Keys <span className="text-muted-foreground text-xs font-normal">(безопаснее)</span></Label>
                    <textarea
                      className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono min-h-[60px]"
                      value={config.ssh_keys}
                      onChange={e => setConfig(p => ({ ...p, ssh_keys: e.target.value }))}
                      placeholder={t('common.placeholder_ssh_key')}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Step 4: Configuration — LXC */}
      {step === 'config' && kind === 'lxc' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{t('wizard.configure')}</h3>
          <QuotaHint addCores={lxcConfig.cores} addMemoryMb={lxcConfig.memory} addDiskGb={lxcConfig.disk} />
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Basic */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t('wizard.basic')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('wizard.hostname')}</Label>
                  <Input
                    value={lxcConfig.name}
                    onChange={e => setLxcConfig(p => ({ ...p, name: e.target.value }))}
                    placeholder={t('common.placeholder_vm_name')}
                  />
                </div>
                <div>
                  <Label>{t('wizard.storage')}</Label>
                  <Select value={lxcConfig.storage} onValueChange={v => setLxcConfig(p => ({ ...p, storage: v ?? '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {lxcStorages.length > 0
                        ? lxcStorages.map(s => <SelectItem key={s.storage} value={s.storage}>{s.storage} ({s.type})</SelectItem>)
                        : <SelectItem value="local-lvm">local-lvm</SelectItem>
                      }
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="lxc_start_after"
                    checked={lxcConfig.start_after_create}
                    onChange={e => setLxcConfig(p => ({ ...p, start_after_create: e.target.checked }))}
                  />
                  <Label htmlFor="lxc_start_after">{t('wizard.start_after_create')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="lxc_unprivileged"
                    checked={lxcConfig.unprivileged}
                    onChange={e => setLxcConfig(p => ({ ...p, unprivileged: e.target.checked }))}
                  />
                  <Label htmlFor="lxc_unprivileged">{t('wizard.unprivileged')}</Label>
                </div>
              </CardContent>
            </Card>

            {/* Resources */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4" />{t('wizard.resources')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>vCPU</Label>
                  <Input type="number" min={1} value={lxcConfig.cores} onChange={e => setLxcConfig(p => ({ ...p, cores: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>{t('wizard.memory_mb')}</Label>
                  <Input type="number" min={64} step={128} value={lxcConfig.memory} onChange={e => setLxcConfig(p => ({ ...p, memory: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>{t('wizard.swap_mb')}</Label>
                  <Input type="number" min={0} step={128} value={lxcConfig.swap} onChange={e => setLxcConfig(p => ({ ...p, swap: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>{t('wizard.disk_gb')}</Label>
                  <Input type="number" min={1} value={lxcConfig.disk} onChange={e => setLxcConfig(p => ({ ...p, disk: Number(e.target.value) }))} />
                </div>
              </CardContent>
            </Card>

            {/* Network */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t('wizard.network')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('wizard.bridge')}</Label>
                  <Input value={lxcConfig.bridge} onChange={e => setLxcConfig(p => ({ ...p, bridge: e.target.value }))} />
                </div>
                <div>
                  <Label>IPAM {t('wizard.network')}</Label>
                  <Select value={String(lxcConfig.ipam_network_id || '')} onValueChange={v => setLxcConfig(p => ({ ...p, ipam_network_id: v ? Number(v) : null }))}>
                    <SelectTrigger><SelectValue placeholder={t('wizard.manual_ip')} /></SelectTrigger>
                    <SelectContent>
                      {lxcFilteredNetworks.map(n => (
                        <SelectItem key={n.id} value={String(n.id)}>{n.name} ({n.network})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!lxcConfig.ipam_network_id && (
                  <>
                    <div>
                      <Label>IP (CIDR)</Label>
                      <Input value={lxcConfig.ip_address} onChange={e => setLxcConfig(p => ({ ...p, ip_address: e.target.value }))} placeholder="10.10.10.5/24 или dhcp" />
                    </div>
                    <div>
                      <Label>Gateway</Label>
                      <Input value={lxcConfig.gateway} onChange={e => setLxcConfig(p => ({ ...p, gateway: e.target.value }))} placeholder="10.10.10.1" />
                    </div>
                  </>
                )}
                <div>
                  <Label>DNS</Label>
                  <Input value={lxcConfig.nameserver} onChange={e => setLxcConfig(p => ({ ...p, nameserver: e.target.value }))} placeholder="8.8.8.8" />
                </div>
              </CardContent>
            </Card>

            {/* Auth */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t('wizard.lxc_password')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('wizard.lxc_password')}</Label>
                  <Input
                    type="password"
                    value={lxcConfig.password}
                    onChange={e => setLxcConfig(p => ({ ...p, password: e.target.value }))}
                    placeholder={t('wizard.lxc_password_placeholder')}
                  />
                </div>
                {isAdmin && (
                  <SSHOwnerSelector
                    users={allUsers}
                    value={ownerId}
                    onChange={(v) => { setOwnerId(v); setSelectedKeyIds([]); }}
                  />
                )}
                <SSHKeyPicker keys={availableKeys} selected={selectedKeyIds} onToggle={toggleKey} />
                {availableKeys.length === 0 && (
                  <div>
                    <Label>SSH Keys <span className="text-muted-foreground text-xs font-normal">(безопаснее)</span></Label>
                    <textarea
                      className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono min-h-[60px]"
                      value={lxcConfig.ssh_keys}
                      onChange={e => setLxcConfig(p => ({ ...p, ssh_keys: e.target.value }))}
                      placeholder={t('common.placeholder_ssh_key')}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Step 5: Confirm — VM */}
      {step === 'confirm' && kind === 'vm' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.confirm')}</h3>
          <Card>
            <CardContent className="p-6 space-y-3">
              <Row label={t('wizard.server_label')} value={selectedServer?.name || ''} />
              <Row label={t('common.type')} value="VM (QEMU)" />
              <Row label={t('wizard.template_label')} value={selectedTemplate?.name || ''} />
              <Row label={t('common.name')} value={config.name} />
              <Row label={t('common.vcpu')} value={String(config.cores)} />
              <Row label={t('wizard.memory_mb')} value={`${config.memory} MB`} />
              <Row label={t('wizard.disk_gb')} value={`${config.disk} GB`} />
              <Row label={t('wizard.storage')} value={config.storage} />
              <Row label={t('wizard.bridge')} value={config.bridge} />
              {config.ipam_network_id && <Row label={t('common.ipam')} value={networks.find(n => n.id === config.ipam_network_id)?.name || 'Auto'} />}
              {config.ip_address && <Row label={t('common.primary_ip')} value={config.ip_address} />}
              {config.cloud_init_user && <Row label={t('wizard.ci_user')} value={config.cloud_init_user} />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 5: Confirm — LXC */}
      {step === 'confirm' && kind === 'lxc' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.confirm')}</h3>
          <Card>
            <CardContent className="p-6 space-y-3">
              <Row label={t('wizard.server_label')} value={selectedServer?.name || ''} />
              <Row label={t('common.type')} value="LXC Container" />
              <Row label={t('wizard.lxc_template_label')} value={selectedLXCTemplate?.name || ''} />
              <Row label={t('wizard.hostname')} value={lxcConfig.name} />
              <Row label={t('common.vcpu')} value={String(lxcConfig.cores)} />
              <Row label={t('wizard.memory_mb')} value={`${lxcConfig.memory} MB`} />
              <Row label={t('wizard.swap_mb')} value={`${lxcConfig.swap} MB`} />
              <Row label={t('wizard.disk_gb')} value={`${lxcConfig.disk} GB`} />
              <Row label={t('wizard.storage')} value={lxcConfig.storage} />
              <Row label={t('wizard.bridge')} value={lxcConfig.bridge} />
              {lxcConfig.ipam_network_id && <Row label={t('common.ipam')} value={networks.find(n => n.id === lxcConfig.ipam_network_id)?.name || 'Auto'} />}
              {lxcConfig.ip_address && <Row label={t('common.primary_ip')} value={lxcConfig.ip_address} />}
              <Row label={t('wizard.unprivileged')} value={lxcConfig.unprivileged ? t('common.yes') : t('common.no')} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={stepIdx === 0 ? handleClose : prev}>
          {stepIdx === 0 ? t('common.cancel') : <><ChevronLeft className="mr-1 h-4 w-4" />{t('wizard.back')}</>}
        </Button>
        {step === 'confirm' ? (
          <Button onClick={handleDeploy} disabled={deploy.isPending || deployLXC.isPending}>
            {(deploy.isPending || deployLXC.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('wizard.deploy')}
          </Button>
        ) : (
          <Button onClick={next} disabled={!canNext()}>
            {t('wizard.next')}<ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * Shows the deploying user's remaining quota at the config step, projecting the
 * currently-entered resources. Hidden when the user has no quota set.
 * Note: reflects the current user's quota (the common self-deploy case), not an
 * admin-selected owner's quota.
 */
function QuotaHint({ addCores, addMemoryMb, addDiskGb }: { addCores: number; addMemoryMb: number; addDiskGb: number }) {
  const { t } = useTranslation();
  const { data: q } = useMyQuota();

  const hasAnyLimit = q && (
    q.max_instances !== null || q.max_cores !== null ||
    q.max_memory_mb !== null || q.max_disk_gb !== null
  );
  if (!q || !hasAnyLimit) return null;

  const rows: Array<{ label: string; used: number; add: number; limit: number | null }> = [
    { label: t('users.quota.instances'), used: q.used_instances, add: 1, limit: q.max_instances },
    { label: t('common.vcpu'), used: q.used_cores, add: addCores, limit: q.max_cores },
    { label: t('wizard.memory_mb'), used: q.used_memory_mb, add: addMemoryMb, limit: q.max_memory_mb },
    { label: t('wizard.disk_gb'), used: q.used_disk_gb, add: addDiskGb, limit: q.max_disk_gb },
  ];

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4" />{t('users.quota.manage')}</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {rows.filter(r => r.limit !== null).map(r => {
          const projected = r.used + r.add;
          const over = projected > (r.limit as number);
          return (
            <div key={r.label} className="flex items-center justify-between text-xs rounded-md border px-2.5 py-1.5">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={over ? 'text-destructive font-medium' : ''}>{projected} / {r.limit}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SSHOwnerSelector({
  users, value, onChange,
}: {
  users: { id: number; username: string; full_name?: string | null }[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <Label>{t('wizard.ssh_keys_owner')}</Label>
      <Select value={value ? String(value) : '__none__'} onValueChange={v => onChange(v === '__none__' ? null : Number(v))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t('wizard.ssh_keys_owner_self')}</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.username}{u.full_name ? ` (${u.full_name})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SSHKeyPicker({
  keys, selected, onToggle,
}: {
  keys: { id: number; name: string; fingerprint?: string | null; comment?: string | null }[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <Label className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5" />
        {t('wizard.ssh_keys_select')}
      </Label>
      {keys.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-1">{t('wizard.no_saved_keys')}</p>
      ) : (
        <div className="mt-1 space-y-1 max-h-40 overflow-y-auto rounded-md border p-2">
          {keys.map(k => (
            <label
              key={k.id}
              className="flex items-start gap-2 text-xs cursor-pointer hover:bg-accent rounded px-2 py-1"
            >
              <Checkbox
                className="mt-0.5"
                checked={selected.includes(k.id)}
                onChange={() => onToggle(k.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{k.name}</div>
                {k.fingerprint && <div className="font-mono text-muted-foreground truncate">{k.fingerprint}</div>}
                {k.comment && <div className="text-muted-foreground truncate">{k.comment}</div>}
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
