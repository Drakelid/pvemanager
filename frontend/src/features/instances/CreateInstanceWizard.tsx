import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Server, Cpu, CheckCircle, ChevronLeft, ChevronRight, Loader2, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServers } from '@/hooks/use-nodes';
import { useTemplates, useTemplateGroups } from '@/hooks/use-templates';
import { useIPAMNetworks } from '@/hooks/use-ipam';
import { apiClient } from '@/lib/api-client';
import type { VMDeployRequest, OSTemplate, ProxmoxServer } from '@/types';
import { toast } from 'sonner';

const STEPS = ['server', 'template', 'config', 'confirm'] as const;
type Step = (typeof STEPS)[number];

export default function CreateInstanceWizard({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleClose = onClose ?? (() => navigate(-1));
  const [step, setStep] = useState<Step>('server');
  const stepIdx = STEPS.indexOf(step);

  // State
  const [selectedServer, setSelectedServer] = useState<ProxmoxServer | null>(null);
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

  // Queries
  const { data: servers = [] } = useServers();
  const { data: groups = [] } = useTemplateGroups();
  const { data: templates = [] } = useTemplates(undefined, selectedServer?.id);
  const { data: networks = [] } = useIPAMNetworks();

  const deploy = useMutation({
    mutationFn: (data: VMDeployRequest) => apiClient.post<{ success: boolean; vmid: number; name: string }>('/proxmox/api/deploy', data),
    onSuccess: () => {
      toast.success(t('wizard.deploy_success', { name: config.name }));
      handleClose();
      navigate('/instances');
    },
    onError: (err: Error) => toast.error(err.message),
  });

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
    if (step === 'template') return !!selectedTemplate;
    if (step === 'config') return config.name.length >= 2;
    return true;
  };

  const handleDeploy = () => {
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
    });
  };

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
              i < stepIdx ? 'bg-green-500/20 text-green-400' :
              i === stepIdx ? 'bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/50' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < stepIdx ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-8 ${i < stepIdx ? 'bg-green-500/50' : 'bg-border'}`} />}
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
                className={`cursor-pointer transition-colors hover:border-blue-500/50 ${selectedServer?.id === srv.id ? 'border-blue-500 bg-blue-500/5' : ''}`}
                onClick={() => setSelectedServer(srv)}
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

      {/* Step 2: Template */}
      {step === 'template' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.select_template')}</h3>
          {groups.map(group => {
            const groupTemplates = templates.filter(t => t.group_id === group.id);
            if (groupTemplates.length === 0) return null;
            return (
              <div key={group.id} className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{group.name}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupTemplates.map(tpl => (
                    <Card
                      key={tpl.id}
                      className={`cursor-pointer transition-colors hover:border-blue-500/50 ${selectedTemplate?.id === tpl.id ? 'border-blue-500 bg-blue-500/5' : ''}`}
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
          {templates.length === 0 && (
            <p className="text-center text-muted-foreground py-8">{t('wizard.no_templates')}</p>
          )}
        </div>
      )}

      {/* Step 3: Configuration */}
      {step === 'config' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{t('wizard.configure')}</h3>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Basic */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t('wizard.basic')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('common.name')}</Label>
                  <Input value={config.name} onChange={e => setConfig(p => ({ ...p, name: e.target.value }))} placeholder="my-vm-01" />
                </div>
                <div>
                  <Label>{t('wizard.target_node')}</Label>
                  <Input value={selectedNode} onChange={e => setSelectedNode(e.target.value)} placeholder={t('wizard.auto_select')} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="start_after"
                    checked={config.start_after_create}
                    onChange={e => setConfig(p => ({ ...p, start_after_create: e.target.checked }))}
                    className="rounded"
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
                      {networks.map(n => (
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
                  <Input value={config.cloud_init_user} onChange={e => setConfig(p => ({ ...p, cloud_init_user: e.target.value }))} placeholder="ubuntu" />
                </div>
                <div>
                  <Label>{t('wizard.ci_password')}</Label>
                  <Input type="password" value={config.cloud_init_password} onChange={e => setConfig(p => ({ ...p, cloud_init_password: e.target.value }))} />
                </div>
                <div>
                  <Label>SSH Keys</Label>
                  <textarea
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono min-h-[60px]"
                    value={config.ssh_keys}
                    onChange={e => setConfig(p => ({ ...p, ssh_keys: e.target.value }))}
                    placeholder="ssh-rsa AAAA..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('wizard.confirm')}</h3>
          <Card>
            <CardContent className="p-6 space-y-3">
              <Row label={t('wizard.server_label')} value={selectedServer?.name || ''} />
              <Row label={t('wizard.template_label')} value={selectedTemplate?.name || ''} />
              <Row label={t('common.name')} value={config.name} />
              <Row label="vCPU" value={String(config.cores)} />
              <Row label={t('wizard.memory_mb')} value={`${config.memory} MB`} />
              <Row label={t('wizard.disk_gb')} value={`${config.disk} GB`} />
              <Row label={t('wizard.bridge')} value={config.bridge} />
              {config.ipam_network_id && <Row label="IPAM" value={networks.find(n => n.id === config.ipam_network_id)?.name || 'Auto'} />}
              {config.ip_address && <Row label="IP" value={config.ip_address} />}
              {config.cloud_init_user && <Row label={t('wizard.ci_user')} value={config.cloud_init_user} />}
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
          <Button onClick={handleDeploy} disabled={deploy.isPending}>
            {deploy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
