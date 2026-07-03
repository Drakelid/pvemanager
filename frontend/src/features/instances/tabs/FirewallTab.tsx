import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Power, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useFirewallGroups,
  useGuestFirewallOptions, useUpdateGuestFirewallOptions,
  useGuestFirewallRules, useCreateGuestFirewallRule, useUpdateGuestFirewallRule, useDeleteGuestFirewallRule,
  useGuestFirewallLog,
  type FirewallRule,
} from '@/hooks/use-firewall';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { RuleDialog, RuleRow } from '@/features/nodes/FirewallManager';

interface Props {
  serverId: number;
  vmid: number;
  type: string;   // 'qemu' | 'lxc'
  node: string;
}

const POLICIES = ['ACCEPT', 'REJECT', 'DROP'];

export default function FirewallTab({ serverId, vmid, type, node }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const isLxc = type === 'lxc';

  const { data: groupsData } = useFirewallGroups(serverId);
  const { data: optionsData, isLoading } = useGuestFirewallOptions(serverId, type, vmid, node);
  const { data: rulesData } = useGuestFirewallRules(serverId, type, vmid, node);

  const updateOptions = useUpdateGuestFirewallOptions(serverId, type, vmid, node);
  const createRule = useCreateGuestFirewallRule(serverId, type, vmid, node);
  const updateRule = useUpdateGuestFirewallRule(serverId, type, vmid, node);
  const deleteRule = useDeleteGuestFirewallRule(serverId, type, vmid, node);

  const groups = groupsData?.groups ?? [];
  const options = optionsData?.options ?? {};
  const rules = rulesData?.rules ?? [];
  const enabled = Number(options.enable) === 1;

  const [ruleDialog, setRuleDialog] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const logQuery = useGuestFirewallLog(serverId, type, vmid, node, logOpen);
  const log = logQuery.data?.log ?? [];

  const saveOption = (patch: Record<string, unknown>) => {
    updateOptions.mutate(patch, {
      onSuccess: () => toast.success(t('fw.options_saved', 'Опции сохранены')),
      onError: (e: Error) => toast.error(e.message),
    });
  };
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

  const boolOption = (key: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={Number(options[key]) === 1}
        onChange={(e) => saveOption({ [key]: e.target.checked ? 1 : 0 })} />
      {label}
    </label>
  );

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          {t('fw.guest_title', 'Firewall инстанса')}
          <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? t('fw.on', 'вкл') : t('fw.off', 'выкл')}</Badge>
        </CardTitle>
        <Button size="sm" variant={enabled ? 'outline' : 'default'} onClick={() => saveOption({ enable: enabled ? 0 : 1 })} disabled={updateOptions.isPending}>
          <Power className="mr-1 h-4 w-4" />{enabled ? t('fw.disable', 'Выключить') : t('fw.enable', 'Включить')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading', 'Загрузка…')}</p>
        ) : (
          <Tabs defaultValue="rules" onValueChange={(v) => setLogOpen(v === 'log')}>
            <TabsList>
              <TabsTrigger value="rules">{t('fw.rules', 'Правила')} ({rules.length})</TabsTrigger>
              <TabsTrigger value="options">{t('fw.options', 'Опции')}</TabsTrigger>
              <TabsTrigger value="log">{t('fw.log_tab', 'Лог')}</TabsTrigger>
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

            {/* Options */}
            <TabsContent value="options" className="mt-4 space-y-4 max-w-md">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(e) => saveOption({ enable: e.target.checked ? 1 : 0 })} className="h-4 w-4 accent-primary" />
                <span className="text-sm">{t('fw.enable_guest', 'Включить фаервол инстанса')}</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('fw.policy_in', 'Политика входящих')}</Label>
                  <Select value={String(options.policy_in || 'DROP')} onValueChange={(v) => { if (v) saveOption({ policy_in: v }); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{POLICIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fw.policy_out', 'Политика исходящих')}</Label>
                  <Select value={String(options.policy_out || 'ACCEPT')} onValueChange={(v) => { if (v) saveOption({ policy_out: v }); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{POLICIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                {boolOption('dhcp', t('fw.dhcp', 'Разрешить DHCP'))}
                {boolOption('macfilter', t('fw.macfilter', 'MAC-фильтр'))}
                {boolOption('ipfilter', t('fw.ipfilter', 'IP-фильтр (анти-спуфинг)'))}
                {isLxc && boolOption('ndp', t('fw.ndp', 'NDP (IPv6)'))}
              </div>
              <p className="text-xs text-muted-foreground">{t('fw.guest_options_hint', 'Фаервол инстанса работает только когда включён фаервол датацентра и стоит firewall=1 на NIC.')}</p>
            </TabsContent>

            {/* Log */}
            <TabsContent value="log" className="mt-4">
              {logQuery.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading', 'Загрузка…')}</p>
              ) : log.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('common.no_data', 'Нет данных')}</p>
              ) : (
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                  {log.map(l => l.t).filter(Boolean).join('\n')}
                </pre>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      <RuleDialog open={ruleDialog} onOpenChange={setRuleDialog} onSubmit={addRule} pending={createRule.isPending} groups={groups} allowGroupType />
    </Card>
  );
}
