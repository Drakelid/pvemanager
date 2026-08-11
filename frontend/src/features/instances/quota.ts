import type { MyQuota } from '@/hooks/use-settings';

/**
 * Quota arithmetic for the create-instance wizard.
 *
 * The backend enforces the same rules in check_quota() and answers with HTTP
 * 429, but only once the deploy is submitted — at the very end of the wizard.
 * These helpers let the UI say up front which limit is in the way.
 */

export type QuotaKey = 'instances' | 'cores' | 'memory' | 'disk';

export interface QuotaMetric {
  key: QuotaKey;
  /** i18n key for the metric's label. */
  labelKey: string;
  used: number;
  limit: number;
  /** What the instance being configured would add. */
  add: number;
}

export interface WizardResources {
  cores: number;
  memoryMb: number;
  diskGb: number;
}

/**
 * Metrics the user is actually limited on. A null limit means "unlimited" and
 * is left out entirely, so a user without a quota row yields an empty list.
 */
export function buildQuotaMetrics(
  quota: MyQuota | undefined,
  res: WizardResources,
): QuotaMetric[] {
  if (!quota) return [];

  const all: QuotaMetric[] = [
    {
      key: 'instances', labelKey: 'users.quota.instances',
      used: quota.used_instances, limit: quota.max_instances as number, add: 1,
    },
    {
      key: 'cores', labelKey: 'common.vcpu',
      used: quota.used_cores, limit: quota.max_cores as number, add: res.cores,
    },
    {
      key: 'memory', labelKey: 'wizard.memory_mb',
      used: quota.used_memory_mb, limit: quota.max_memory_mb as number, add: res.memoryMb,
    },
    {
      key: 'disk', labelKey: 'wizard.disk_gb',
      used: quota.used_disk_gb, limit: quota.max_disk_gb as number, add: res.diskGb,
    },
  ];

  return all.filter(m => m.limit !== null && m.limit !== undefined);
}

/**
 * Metrics with no headroom left at all: not a single instance of any size can
 * be created, so there is nothing worth configuring. Note this is `used >=
 * limit`, not the `projected > limit` test used for a specific configuration.
 */
export function exhaustedMetrics(metrics: QuotaMetric[]): QuotaMetric[] {
  return metrics.filter(m => m.used >= m.limit);
}

/** Metrics the currently entered configuration would push over the limit. */
export function exceededMetrics(metrics: QuotaMetric[]): QuotaMetric[] {
  return metrics.filter(m => m.used + m.add > m.limit);
}
