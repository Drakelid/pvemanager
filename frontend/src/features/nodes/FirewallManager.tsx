import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw, Shield, ChevronRight, Power } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useFirewallOptions, useUpdateFirewallOptions,
  useFirewallRules, useCreateFirewallRule, useDeleteFirewallRule, useUpdateFirewallRule,
  useFirewallGroups, useCreateFirewallGroup, useDeleteFirewallGroup,
  useFirewallGroupRules, useCreateFirewallGroupRule, useDeleteFirewallGroupRule,
  useFirewallIpsets, useCreateFirewallIpset, useDeleteFirewallIpset,
  useFirewallIpsetEntries, useAddIpsetEntry, useDeleteIpsetEntry,
  useFirewallAliases, useCreateFirewallAlias, useDeleteFirewallAlias,
  type FirewallRule, type FirewallGroup,
} from '@/hooks/use-firewall';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';

const POLICIES = ['ACCEPT', 'REJECT', 'DROP'];
const ACTIONS = ['ACCEPT', 'DROP', 'REJECT'];
const PROTOS = ['', 'tcp', 'udp', 'icmp'];

// ==================== Rule dialog (shared: datacenter + group rules) ====================

interface RuleForm {
  type: string;      // 'in' | 'out' | 'group'
  action: string;    // ACCEPT/DROP/REJECT | <group name>
  enable: boolean;
  proto: string;
  source: string;
  dest: string;
  dport: string;
  sport: string;
  macro: string;
  comment: string;
  log: boolean;
}

const emptyRule: RuleForm = {
  type: 'in', action: 'ACCEPT', enable: true, proto: '', source: '', dest: '',
  dport: '', sport: '', macro: '', comment: '', log: false,
};

export function RuleDialog({
  open, onOpenChange, onSubmit, pending, groups, allowGroupType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
  pending: boolean;
  groups: FirewallGroup[];
  allowGroupType: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<RuleForm>(emptyRule);
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const isGroup = form.type === 'group';

  const submit = () => {
    if (isGroup && !form.action) {
      toast.error(t('fw.err_group_required', 'Выберите security group'));
      return;
    }
    const payload: Record<string, unknown> = {
      type: form.type,
      action: form.action,
      enable: form.enable ? 1 : 0,
    };
    if (!isGroup) {
      if (form.proto) payload.proto = form.proto;
      if (form.source) payload.source = form.source;
      if (form.dest) payload.dest = form.dest;
      if (form.dport) payload.dport = form.dport;
      if (form.sport) payload.sport = form.sport;
      if (form.macro) payload.macro = form.macro;
      if (form.log) payload.log = 'info';
    }
    if (form.comment) payload.comment = form.comment;
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(emptyRule); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fw.add_rule', 'Добавить правило')}</DialogTitle>
          <DialogDescription>{t('fw.rule_hint', 'Правила применяются сверху вниз.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('fw.direction', 'Направление')}</Label>
              <Select value={form.type} onValueChange={(v) => { if (v) { set('type', v); set('action', v === 'group' ? '' : 'ACCEPT'); } }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">in</SelectItem>
                  <SelectItem value="out">out</SelectItem>
                  {allowGroupType && <SelectItem value="group">{t('fw.security_group', 'Security group')}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{isGroup ? t('fw.security_group', 'Security group') : t('fw.action', 'Действие')}</Label>
              <Select value={form.action} onValueChange={(v) => { if (v) set('action', v); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder={isGroup ? t('fw.select_group', 'Выберите группу') : ''} /></SelectTrigger>
                <SelectContent>
                  {isGroup
                    ? groups.map(g => <SelectItem key={g.group} value={g.group}>{g.group}</SelectItem>)
                    : ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isGroup && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('fw.proto', 'Протокол')}</Label>
                  <Select value={form.proto} onValueChange={(v) => set('proto', v === 'any' ? '' : (v ?? ''))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="any" /></SelectTrigger>
                    <SelectContent>
                      {PROTOS.map(p => <SelectItem key={p || 'any'} value={p || 'any'}>{p || 'any'}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fw.macro', 'Макрос')}</Label>
                  <Input value={form.macro} onChange={(e) => set('macro', e.target.value)} placeholder="HTTP, SSH…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('fw.source', 'Источник')}</Label>
                  <Input value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="10.0.0.0/24, +ipset, alias" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fw.dest', 'Назначение')}</Label>
                  <Input value={form.dest} onChange={(e) => set('dest', e.target.value)} placeholder="10.0.0.5" className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('fw.dport', 'Порт назн.')}</Label>
                  <Input value={form.dport} onChange={(e) => set('dport', e.target.value)} placeholder="80, 443, 8000:8100" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fw.sport', 'Порт источн.')}</Label>
                  <Input value={form.sport} onChange={(e) => set('sport', e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>{t('common.comment', 'Комментарий')}</Label>
            <Input value={form.comment} onChange={(e) => set('comment', e.target.value)} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enable} onChange={(e) => set('enable', e.target.checked)} />
              {t('fw.enabled', 'Включено')}
            </label>
            {!isGroup && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.log} onChange={(e) => set('log', e.target.checked)} />
                {t('fw.log', 'Логировать')}
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Отмена')}</Button>
          <Button onClick={submit} disabled={pending}>{t('common.add', 'Добавить')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Rule row (shared render) ====================

export function RuleRow({ rule, onToggle, onDelete }: {
  rule: FirewallRule; onToggle?: () => void; onDelete: () => void;
}) {
  const disabled = rule.enable === 0;
  const actionColor = rule.action === 'ACCEPT' ? 'text-green-600 dark:text-green-500'
    : rule.action === 'DROP' || rule.action === 'REJECT' ? 'text-destructive' : '';
  return (
    <TableRow className={disabled ? 'opacity-50' : ''}>
      <TableCell className="text-muted-foreground tabular-nums">{rule.pos}</TableCell>
      <TableCell><Badge variant="outline">{rule.type}</Badge></TableCell>
      <TableCell className={`font-medium ${actionColor}`}>{rule.macro || rule.action}</TableCell>
      <TableCell className="font-mono text-xs">{rule.proto || '—'}</TableCell>
      <TableCell className="font-mono text-xs">{rule.source || '*'} → {rule.dest || '*'}{rule.dport ? `:${rule.dport}` : ''}</TableCell>
      <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">{rule.comment || ''}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {onToggle && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} title={disabled ? 'Enable' : 'Disable'}>
              <Power className={`h-3.5 w-3.5 ${disabled ? '' : 'text-green-600 dark:text-green-500'}`} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ==================== Security group section (expandable rules) ====================

function GroupRules({ serverId, group }: { serverId: number; group: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data } = useFirewallGroupRules(serverId, group);
  const createRule = useCreateFirewallGroupRule(serverId, group);
  const deleteRule = useDeleteFirewallGroupRule(serverId, group);
  const [dialog, setDialog] = useState(false);
  const rules = data?.rules ?? [];

  const add = (payload: Record<string, unknown>) => {
    createRule.mutate(payload, {
      onSuccess: () => { toast.success(t('fw.rule_added', 'Правило добавлено')); setDialog(false); },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const remove = async (pos?: number) => {
    if (pos == null || !await confirm(t('fw.delete_rule_confirm', 'Удалить правило?'))) return;
    deleteRule.mutate(pos, { onSuccess: () => toast.success(t('fw.rule_deleted', 'Правило удалено')), onError: (e: Error) => toast.error(e.message) });
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setDialog(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t('fw.add_rule', 'Добавить правило')}
        </Button>
      </div>
      {rules.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
      ) : (
        <Table>
          <TableBody>
            {rules.map(r => <RuleRow key={r.pos} rule={r} onDelete={() => remove(r.pos)} />)}
          </TableBody>
        </Table>
      )}
      <RuleDialog open={dialog} onOpenChange={setDialog} onSubmit={add} pending={createRule.isPending} groups={[]} allowGroupType={false} />
    </div>
  );
}

// ==================== IP set entries (expandable) ====================

function IpsetEntries({ serverId, name }: { serverId: number; name: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data } = useFirewallIpsetEntries(serverId, name);
  const addEntry = useAddIpsetEntry(serverId, name);
  const delEntry = useDeleteIpsetEntry(serverId, name);
  const [cidr, setCidr] = useState('');
  const [comment, setComment] = useState('');
  const entries = data?.entries ?? [];

  const add = () => {
    if (!cidr.trim()) { toast.error(t('fw.err_cidr', 'Укажите CIDR')); return; }
    addEntry.mutate({ cidr: cidr.trim(), comment: comment.trim() || undefined }, {
      onSuccess: () => { toast.success(t('fw.entry_added', 'Запись добавлена')); setCidr(''); setComment(''); },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const remove = async (c: string) => {
    if (!await confirm(`${t('fw.delete_entry', 'Удалить запись')} ${c}?`)) return;
    delEntry.mutate(c, { onSuccess: () => toast.success(t('fw.entry_deleted', 'Запись удалена')), onError: (e: Error) => toast.error(e.message) });
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1"><Label className="text-xs">CIDR</Label><Input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="10.0.0.0/24" className="font-mono h-8" /></div>
        <div className="flex-1 space-y-1"><Label className="text-xs">{t('common.comment', 'Комментарий')}</Label><Input value={comment} onChange={(e) => setComment(e.target.value)} className="h-8" /></div>
        <Button size="sm" onClick={add} disabled={addEntry.isPending}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      {entries.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
      ) : (
        <div className="space-y-1">
          {entries.map(e => (
            <div key={e.cidr} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
              <span className="font-mono">{e.cidr}</span>
              {e.nomatch ? <Badge variant="outline" className="text-[10px]">nomatch</Badge> : null}
              {e.comment && <span className="text-muted-foreground">— {e.comment}</span>}
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 text-destructive" onClick={() => remove(e.cidr)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Main ====================

export default function FirewallManager({ serverId }: { serverId: number }) {
  const { t } = useTranslation();
  const confirm = useConfirm();

  const { data: optionsData, isLoading, refetch, isFetching } = useFirewallOptions(serverId);
  const { data: rulesData } = useFirewallRules(serverId);
  const { data: groupsData } = useFirewallGroups(serverId);
  const { data: ipsetsData } = useFirewallIpsets(serverId);
  const { data: aliasesData } = useFirewallAliases(serverId);

  const updateOptions = useUpdateFirewallOptions(serverId);
  const createRule = useCreateFirewallRule(serverId);
  const updateRule = useUpdateFirewallRule(serverId);
  const deleteRule = useDeleteFirewallRule(serverId);
  const createGroup = useCreateFirewallGroup(serverId);
  const deleteGroup = useDeleteFirewallGroup(serverId);
  const createIpset = useCreateFirewallIpset(serverId);
  const deleteIpset = useDeleteFirewallIpset(serverId);
  const createAlias = useCreateFirewallAlias(serverId);
  const deleteAlias = useDeleteFirewallAlias(serverId);

  const options = optionsData?.options ?? {};
  const rules = rulesData?.rules ?? [];
  const groups = groupsData?.groups ?? [];
  const ipsets = ipsetsData?.ipsets ?? [];
  const aliases = aliasesData?.aliases ?? [];

  const [ruleDialog, setRuleDialog] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false);
  const [ipsetDialog, setIpsetDialog] = useState(false);
  const [aliasDialog, setAliasDialog] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedIpset, setExpandedIpset] = useState<string | null>(null);

  // ---- Options local state ----
  const enabled = Number(options.enable) === 1;
  const toggleEnable = () => {
    updateOptions.mutate({ enable: enabled ? 0 : 1 }, {
      onSuccess: () => toast.success(t('fw.options_saved', 'Опции сохранены')),
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const setPolicy = (dir: 'policy_in' | 'policy_out', v: string) => {
    updateOptions.mutate({ [dir]: v }, {
      onSuccess: () => toast.success(t('fw.options_saved', 'Опции сохранены')),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  // ---- Rules ----
  const addRule = (payload: Record<string, unknown>) => {
    createRule.mutate(payload, {
      onSuccess: () => { toast.success(t('fw.rule_added', 'Правило добавлено')); setRuleDialog(false); },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const toggleRule = (r: FirewallRule) => {
    if (r.pos == null) return;
    updateRule.mutate({ pos: r.pos, data: { enable: r.enable === 0 ? 1 : 0 } }, {
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const removeRule = async (pos?: number) => {
    if (pos == null || !await confirm(t('fw.delete_rule_confirm', 'Удалить правило?'))) return;
    deleteRule.mutate(pos, { onSuccess: () => toast.success(t('fw.rule_deleted', 'Правило удалено')), onError: (e: Error) => toast.error(e.message) });
  };

  // ---- Groups / ipsets / aliases delete ----
  const removeGroup = async (g: string) => {
    if (!await confirm(`${t('fw.delete_group', 'Удалить security group')} "${g}"?`)) return;
    deleteGroup.mutate(g, { onSuccess: () => toast.success(t('fw.group_deleted', 'Группа удалена')), onError: (e: Error) => toast.error(e.message) });
  };
  const removeIpset = async (n: string) => {
    if (!await confirm(`${t('fw.delete_ipset', 'Удалить IP set')} "${n}"?`)) return;
    deleteIpset.mutate(n, { onSuccess: () => toast.success(t('fw.ipset_deleted', 'IP set удалён')), onError: (e: Error) => toast.error(e.message) });
  };
  const removeAlias = async (n: string) => {
    if (!await confirm(`${t('fw.delete_alias', 'Удалить алиас')} "${n}"?`)) return;
    deleteAlias.mutate(n, { onSuccess: () => toast.success(t('fw.alias_deleted', 'Алиас удалён')), onError: (e: Error) => toast.error(e.message) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5" />
          {t('fw.title', 'Firewall (датацентр)')}
          <Badge variant={enabled ? 'default' : 'secondary'}>
            {enabled ? t('fw.on', 'вкл') : t('fw.off', 'выкл')}
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant={enabled ? 'outline' : 'default'} onClick={toggleEnable} disabled={updateOptions.isPending}>
            <Power className="mr-1 h-4 w-4" />{enabled ? t('fw.disable', 'Выключить') : t('fw.enable', 'Включить')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading', 'Загрузка…')}</p>
        ) : (
          <Tabs defaultValue="rules">
            <TabsList>
              <TabsTrigger value="rules">{t('fw.rules', 'Правила')} ({rules.length})</TabsTrigger>
              <TabsTrigger value="groups">{t('fw.groups', 'Security Groups')} ({groups.length})</TabsTrigger>
              <TabsTrigger value="ipsets">{t('fw.ipsets', 'IP Sets')} ({ipsets.length})</TabsTrigger>
              <TabsTrigger value="aliases">{t('fw.aliases', 'Aliases')} ({aliases.length})</TabsTrigger>
              <TabsTrigger value="options">{t('fw.options', 'Опции')}</TabsTrigger>
            </TabsList>

            {/* Rules */}
            <TabsContent value="rules" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setRuleDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />{t('fw.add_rule', 'Добавить правило')}
                </Button>
              </div>
              {rules.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{t('fw.direction', 'Напр.')}</TableHead>
                      <TableHead>{t('fw.action', 'Действие')}</TableHead>
                      <TableHead>{t('fw.proto', 'Прото')}</TableHead>
                      <TableHead>{t('fw.match', 'Источник → Назначение')}</TableHead>
                      <TableHead>{t('common.comment', 'Комментарий')}</TableHead>
                      <TableHead className="text-right">{t('common.actions', 'Действия')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map(r => (
                      <RuleRow key={r.pos} rule={r} onToggle={() => toggleRule(r)} onDelete={() => removeRule(r.pos)} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Security groups */}
            <TabsContent value="groups" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setGroupDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />{t('fw.add_group', 'Добавить группу')}
                </Button>
              </div>
              {groups.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
              ) : (
                <div className="space-y-2">
                  {groups.map(g => (
                    <div key={g.group} className="rounded-md border">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setExpandedGroup(p => p === g.group ? null : g.group)}>
                          <ChevronRight className={`h-4 w-4 transition-transform ${expandedGroup === g.group ? 'rotate-90' : ''}`} />
                          <span className="font-mono font-medium">{g.group}</span>
                          {g.comment && <span className="text-xs text-muted-foreground">— {g.comment}</span>}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeGroup(g.group)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {expandedGroup === g.group && (
                        <div className="px-3 pb-3"><GroupRules serverId={serverId} group={g.group} /></div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* IP sets */}
            <TabsContent value="ipsets" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setIpsetDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />{t('fw.add_ipset', 'Добавить IP set')}
                </Button>
              </div>
              {ipsets.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
              ) : (
                <div className="space-y-2">
                  {ipsets.map(s => (
                    <div key={s.name} className="rounded-md border">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setExpandedIpset(p => p === s.name ? null : s.name)}>
                          <ChevronRight className={`h-4 w-4 transition-transform ${expandedIpset === s.name ? 'rotate-90' : ''}`} />
                          <span className="font-mono font-medium">{s.name}</span>
                          {s.comment && <span className="text-xs text-muted-foreground">— {s.comment}</span>}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeIpset(s.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {expandedIpset === s.name && (
                        <div className="px-3 pb-3"><IpsetEntries serverId={serverId} name={s.name} /></div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Aliases */}
            <TabsContent value="aliases" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAliasDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />{t('fw.add_alias', 'Добавить алиас')}
                </Button>
              </div>
              {aliases.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fw.name', 'Имя')}</TableHead>
                      <TableHead>CIDR</TableHead>
                      <TableHead>{t('common.comment', 'Комментарий')}</TableHead>
                      <TableHead className="text-right">{t('common.actions', 'Действия')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aliases.map(a => (
                      <TableRow key={a.name}>
                        <TableCell className="font-mono font-medium">{a.name}</TableCell>
                        <TableCell className="font-mono text-xs">{a.cidr}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.comment || ''}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeAlias(a.name)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Options */}
            <TabsContent value="options" className="mt-4 space-y-4 max-w-md">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={toggleEnable} className="h-4 w-4 accent-primary" />
                <span className="text-sm">{t('fw.enable_dc', 'Включить фаервол датацентра')}</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('fw.policy_in', 'Политика входящих')}</Label>
                  <Select value={options.policy_in || 'DROP'} onValueChange={(v) => { if (v) setPolicy('policy_in', v); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{POLICIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fw.policy_out', 'Политика исходящих')}</Label>
                  <Select value={options.policy_out || 'ACCEPT'} onValueChange={(v) => { if (v) setPolicy('policy_out', v); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{POLICIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('fw.options_hint', 'Политики применяются к трафику, не совпавшему ни с одним правилом.')}</p>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* Dialogs */}
      <RuleDialog open={ruleDialog} onOpenChange={setRuleDialog} onSubmit={addRule} pending={createRule.isPending} groups={groups} allowGroupType />

      <SimpleCreateDialog
        open={groupDialog} onOpenChange={setGroupDialog}
        title={t('fw.add_group', 'Добавить security group')}
        nameLabel={t('fw.group_name', 'Имя группы')}
        withCidr={false}
        pending={createGroup.isPending}
        onSubmit={({ name, comment }) => createGroup.mutate({ group: name, comment }, {
          onSuccess: () => { toast.success(t('fw.group_added', 'Группа создана')); setGroupDialog(false); },
          onError: (e: Error) => toast.error(e.message),
        })}
      />

      <SimpleCreateDialog
        open={ipsetDialog} onOpenChange={setIpsetDialog}
        title={t('fw.add_ipset', 'Добавить IP set')}
        nameLabel={t('fw.ipset_name', 'Имя IP set')}
        withCidr={false}
        pending={createIpset.isPending}
        onSubmit={({ name, comment }) => createIpset.mutate({ name, comment }, {
          onSuccess: () => { toast.success(t('fw.ipset_added', 'IP set создан')); setIpsetDialog(false); },
          onError: (e: Error) => toast.error(e.message),
        })}
      />

      <SimpleCreateDialog
        open={aliasDialog} onOpenChange={setAliasDialog}
        title={t('fw.add_alias', 'Добавить алиас')}
        nameLabel={t('fw.name', 'Имя')}
        withCidr
        pending={createAlias.isPending}
        onSubmit={({ name, cidr, comment }) => createAlias.mutate({ name, cidr: cidr!, comment }, {
          onSuccess: () => { toast.success(t('fw.alias_added', 'Алиас создан')); setAliasDialog(false); },
          onError: (e: Error) => toast.error(e.message),
        })}
      />
    </Card>
  );
}

// ==================== Simple create dialog (group / ipset / alias) ====================

function SimpleCreateDialog({
  open, onOpenChange, title, nameLabel, withCidr, pending, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  nameLabel: string;
  withCidr: boolean;
  pending: boolean;
  onSubmit: (data: { name: string; cidr?: string; comment?: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [comment, setComment] = useState('');

  const reset = () => { setName(''); setCidr(''); setComment(''); };

  const submit = () => {
    if (!name.trim()) { toast.error(t('fw.err_name', 'Укажите имя')); return; }
    if (withCidr && !cidr.trim()) { toast.error(t('fw.err_cidr', 'Укажите CIDR')); return; }
    onSubmit({ name: name.trim(), cidr: withCidr ? cidr.trim() : undefined, comment: comment.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{nameLabel}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
          </div>
          {withCidr && (
            <div className="space-y-1.5">
              <Label>CIDR / IP</Label>
              <Input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="10.0.0.0/24" className="font-mono" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('common.comment', 'Комментарий')}</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Отмена')}</Button>
          <Button onClick={submit} disabled={pending}>{t('common.add', 'Добавить')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
