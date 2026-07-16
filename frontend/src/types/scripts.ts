// Типы модуля «Каталог скриптов» (bash-скрипты на нодах/ВМ/LXC).

export type ScriptTargetType = 'node' | 'guest';
export type ScriptSource = 'manual' | 'git' | 'community-scripts';
export type ScriptRepoMetadataFormat = 'header-comment' | 'community-scripts-ct';
export type ScriptExecutionStatus = 'running' | 'success' | 'failed';

export interface ScriptParamField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'bool';
  required: boolean;
  default?: string | null;
}

export interface ScriptCatalogItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  target_type: ScriptTargetType;
  interpreter: string;
  params_schema: ScriptParamField[];
  source: ScriptSource;
  git_repo_id: number | null;
  git_path: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  content?: string;
}

export interface ScriptGitRepoItem {
  id: number;
  url: string;
  branch: string;
  path_glob: string;
  metadata_format: ScriptRepoMetadataFormat;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export interface ScriptExecution {
  id: number;
  kind: 'script';
  script_id: number | null;
  script_name: string | null;
  target_type: ScriptTargetType;
  server_id: number | null;
  node: string | null;
  vmid: number | null;
  params_used: Record<string, string>;
  status: ScriptExecutionStatus;
  exit_code: number | null;
  output: string | null;
  error_text: string | null;
  user_id: number;
  started_at: string | null;
  finished_at: string | null;
}
