export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatCPU(cpuFraction: number, maxcpu: number): string {
  return `${(cpuFraction * 100).toFixed(1)}% of ${maxcpu}`;
}

export function vmTypeLabel(type: string): string {
  return type === 'qemu' ? 'VM' : type === 'lxc' ? 'LXC' : type.toUpperCase();
}

/**
 * Total vCPU count from a live Proxmox config.
 * QEMU reports `cores` *per socket*, so the real total is `sockets * cores`
 * (LXC has no sockets and reports the total in `cores`).
 */
export function vmVcpuCount(config?: { cores?: number; sockets?: number } | null): number | undefined {
  if (!config?.cores) return undefined;
  return config.cores * (config.sockets ?? 1);
}

/**
 * Formats a VM/LXC hardware configuration as "N vCPU / X GB RAM / Y GB".
 * `memory` and `maxdisk` come from the cached instances list in bytes;
 * `disk_size` (when present) is already in GB.
 */
export function formatVmConfig(vm: {
  cores?: number;
  memory?: number;
  maxmem?: number;
  disk_size?: number;
  maxdisk?: number;
}): string {
  const parts: string[] = [];
  if (vm.cores) parts.push(`${vm.cores} vCPU`);
  const memBytes = vm.memory || vm.maxmem;
  if (memBytes) parts.push(`${formatBytes(memBytes, 0)} RAM`);
  const diskGb = vm.disk_size ?? (vm.maxdisk ? Math.round(vm.maxdisk / 1024 ** 3) : 0);
  if (diskGb) parts.push(`${diskGb} GB`);
  return parts.join(' / ');
}
