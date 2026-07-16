// Типы модуля App Store (каталог + установленные приложения).

export interface FormFieldOption {
  value: string;
  label?: string;
}

export interface FormField {
  type: string; // text | password | email | number | random | boolean | fqdn | ...
  label?: string;
  env_variable: string;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  default?: string | number | boolean;
  options?: FormFieldOption[];
}

export interface CatalogAppLight {
  app_id: string;
  name: string;
  source: 'runtipi' | 'umbrel' | string;
  version: string | null;
  tipi_version: number | null;
  categories: string[];
  short_desc: string | null;
  port: number | null;
  architectures: string[];
  available: boolean;
  unavailable_reason: string | null;
  deprecated: boolean;
  dynamic_config: boolean;
  source_url: string | null;
  author: string | null;
  logo_url: string | null;
  synced_at: string | null;
}

export interface CatalogApp extends CatalogAppLight {
  form_fields: FormField[];
  description_md: string | null;
  compose_yaml?: string;
}

export interface CatalogListResponse {
  total: number;
  limit: number;
  offset: number;
  items: CatalogAppLight[];
}

export interface CatalogMeta {
  total: number;
  last_synced_at: string | null;
  repo: string;
  ref: string;
  categories: string[];
  sources?: string[];
}

export type InstalledStatus =
  | 'installing' | 'running' | 'stopped' | 'error'
  | 'updating' | 'update_failed' | 'orphaned' | 'deleting';

export interface InstalledApp {
  id: number;
  app_id: string | null;
  server_id: number | null;
  vmid: number | null;
  node: string | null;
  name: string;
  version_installed: string | null;
  tipi_version_installed: number | null;
  ip: string | null;
  port: number | null;
  url: string | null;
  status: InstalledStatus;
  update_available: boolean;
  last_snapshot: string | null;
  owner_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  catalog?: CatalogAppLight;
}

export interface AppOperationStep {
  step: string;
  progress: number;
  ts: string;
}

export interface AppOperation {
  id: number;
  kind: 'appstore';
  installed_app_id: number | null;
  server_id?: number | null;
  type: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  steps_log: AppOperationStep[];
  error_text: string | null;
  user_id: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface InstallResponse {
  success: boolean;
  installed_app_id: number;
  operation_id: number;
  vmid: number;
  secrets: Record<string, string>;
}
