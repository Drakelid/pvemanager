import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Terminal, Plus, RefreshCw, Loader2, Play, Pencil, Trash2, GitBranch, Package } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  useScripts, useDeleteScript,
  useScriptRepos, useCreateScriptRepo, useSyncScriptRepo, useDeleteScriptRepo,
  useScriptExecutions,
} from '@/hooks/use-scripts';
import type { ScriptCatalogItem } from '@/types/scripts';
import ScriptEditDialog from './ScriptEditDialog';
import ScriptExecuteDialog from './ScriptExecuteDialog';
import ExecutionDetailDialog from './ExecutionDetailDialog';

const COMMUNITY_SCRIPTS_REPO = {
  url: 'https://github.com/community-scripts/ProxmoxVE',
  branch: 'main',
  path_glob: 'ct/*.sh',
  metadata_format: 'community-scripts-ct' as const,
};

export default function ScriptsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('catalog');

  const { data: scripts = [], isLoading } = useScripts();
  const deleteScript = useDeleteScript();

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ScriptCatalogItem | null>(null);
  const [execScript, setExecScript] = useState<ScriptCatalogItem | null>(null);

  const { data: repos = [] } = useScriptRepos();
  const createRepo = useCreateScriptRepo();
  const syncRepo = useSyncScriptRepo();
  const deleteRepo = useDeleteScriptRepo();
  const [repoUrl, setRepoUrl] = useState('');

  const { data: executions = [] } = useScriptExecutions();
  const [execDetailId, setExecDetailId] = useState<number | null>(null);

  const manualScripts = useMemo(() => scripts.filter((s) => s.source === 'manual'), [scripts]);
  const gitScripts = useMemo(() => scripts.filter((s) => s.source === 'git'), [scripts]);
  const communityScripts = useMemo(() => scripts.filter((s) => s.source === 'community-scripts'), [scripts]);

  const handleDelete = (script: ScriptCatalogItem) => {
    if (!confirm(t('scripts.confirm_delete', 'Удалить скрипт "{{name}}"?', { name: script.name }))) return;
    deleteScript.mutate(script.id, {
      onSuccess: () => toast.success(t('scripts.deleted', 'Скрипт удалён')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const handleAddRepo = () => {
    if (!repoUrl.trim()) return;
    createRepo.mutate({ url: repoUrl.trim() }, {
      onSuccess: () => { setRepoUrl(''); toast.success(t('scripts.repo_added', 'Источник добавлен')); },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const handleAddCommunityScriptsRepo = () => {
    createRepo.mutate(COMMUNITY_SCRIPTS_REPO, {
      onSuccess: () => toast.success(t('scripts.repo_added', 'Источник добавлен')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const renderScriptCard = (script: ScriptCatalogItem) => (
    <Card key={script.id} className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{script.name}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{script.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-2xs">
          {script.target_type === 'node' ? t('scripts.target_node', 'Нода') : t('scripts.target_guest', 'VM/LXC')}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {script.category && <Badge variant="secondary" className="text-2xs">{script.category}</Badge>}
        {script.source === 'git' && (
          <Badge variant="outline" className="gap-1 text-2xs"><GitBranch className="h-3 w-3" />{script.git_path}</Badge>
        )}
        {script.source === 'community-scripts' && (
          <Badge variant="outline" className="gap-1 text-2xs">
            <Package className="h-3 w-3" />{t('scripts.source_community', 'Community Scripts')}
          </Badge>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button size="sm" onClick={() => setExecScript(script)}>
          <Play className="mr-1.5 h-3.5 w-3.5" />{t('scripts.run', 'Запустить')}
        </Button>
        {script.source === 'manual' && (
          <>
            <Button size="sm" variant="outline" onClick={() => { setEditing(script); setEditOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDelete(script)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">{t('scripts.title', 'Каталог скриптов')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('scripts.subtitle', 'Bash-скрипты для выполнения на нодах Proxmox и гостях (VM/LXC)')}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setEditOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />{t('scripts.new_script', 'Новый скрипт')}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">{t('scripts.tab_catalog', 'Каталог')}</TabsTrigger>
          <TabsTrigger value="repos">{t('scripts.tab_repos', 'Git-источники')}</TabsTrigger>
          <TabsTrigger value="executions">{t('scripts.tab_executions', 'История запусков')}</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4 space-y-4">
          {isLoading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">{t('common.loading', 'Загрузка...')}</div>
          ) : scripts.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <Terminal className="mx-auto mb-3 h-12 w-12 opacity-40" />
              <p>{t('scripts.no_scripts', 'Пока нет ни одного скрипта')}</p>
            </div>
          ) : (
            <>
              {manualScripts.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {manualScripts.map(renderScriptCard)}
                </div>
              )}
              {gitScripts.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {gitScripts.map(renderScriptCard)}
                </div>
              )}
              {communityScripts.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {communityScripts.map(renderScriptCard)}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="repos" className="mt-4 space-y-4">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <input
              className="h-8 min-w-[280px] flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder={t('scripts.repo_url_placeholder', 'https://github.com/user/scripts.git')}
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <Button size="sm" onClick={handleAddRepo} disabled={createRepo.isPending}>
              <Plus className="mr-1.5 h-4 w-4" />{t('scripts.add_repo', 'Добавить источник')}
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddCommunityScriptsRepo} disabled={createRepo.isPending}>
              <Package className="mr-1.5 h-4 w-4" />{t('scripts.add_community_scripts', 'Community-Scripts (ProxmoxVE)')}
            </Button>
          </Card>

          {repos.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t('scripts.no_repos', 'Git-источники не настроены')}
            </div>
          ) : (
            <div className="space-y-2">
              {repos.map((repo) => (
                <Card key={repo.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{repo.url}</p>
                    <p className="text-xs text-muted-foreground">
                      {repo.branch} · {repo.path_glob}
                      {repo.last_synced_at && ` · ${t('scripts.last_synced', 'синк')}: ${new Date(repo.last_synced_at).toLocaleString()}`}
                    </p>
                    {repo.last_sync_error && (
                      <p className="text-xs text-destructive">{repo.last_sync_error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => syncRepo.mutate(repo.id, {
                        onSuccess: (r) => r.success
                          ? toast.success(t('scripts.sync_done', 'Синхронизировано: +{{created}} / изм. {{updated}}', { created: r.created, updated: r.updated }))
                          : toast.error(r.error || t('scripts.sync_failed', 'Ошибка синхронизации')),
                        onError: (e) => toast.error((e as Error).message),
                      })}
                      disabled={syncRepo.isPending}
                    >
                      {syncRepo.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      {t('scripts.sync', 'Синхронизировать')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteRepo.mutate(repo.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="executions" className="mt-4">
          {executions.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">
              {t('scripts.no_executions', 'Пока нет запусков')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scripts.col_script', 'Скрипт')}</TableHead>
                  <TableHead>{t('scripts.col_target', 'Цель')}</TableHead>
                  <TableHead>{t('scripts.col_status', 'Статус')}</TableHead>
                  <TableHead>{t('scripts.col_exit_code', 'Exit code')}</TableHead>
                  <TableHead>{t('scripts.col_started', 'Запущен')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setExecDetailId(e.id)}>
                    <TableCell>{e.script_name || e.script_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.target_type === 'node' ? e.node : `${e.node} / vmid ${e.vmid}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.status === 'success' ? 'secondary' : e.status === 'failed' ? 'destructive' : 'outline'}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{e.exit_code ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.started_at ? new Date(e.started_at).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <ScriptEditDialog open={editOpen} onOpenChange={setEditOpen} script={editing} />
      <ScriptExecuteDialog script={execScript} onOpenChange={(open) => !open && setExecScript(null)} />
      <ExecutionDetailDialog
        executionId={execDetailId}
        onOpenChange={(open) => !open && setExecDetailId(null)}
      />
    </div>
  );
}
