import { Globe, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useVMInterfaces, useVMConfig } from '@/hooks/use-instances';
import { formatBytes } from '@/lib/format';
import { useVMStatus } from '@/hooks/use-instances';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

export default function NetworkingTab({ serverId, vmid, type, node }: Props) {
  const { data: ifaces } = useVMInterfaces(serverId, vmid, type, node);
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const { data: status } = useVMStatus(serverId, vmid, type, node);

  // Extract network configs from VM config (net0, net1, ...)
  const netDevices = config
    ? Object.entries(config)
        .filter(([k]) => /^net\d+$/.test(k))
        .sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-4">
      {/* Traffic summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Network In</p>
            <p className="text-xl font-bold tabular-nums">{status?.netin !== undefined ? formatBytes(status.netin) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Network Out</p>
            <p className="text-xl font-bold tabular-nums">{status?.netout !== undefined ? formatBytes(status.netout) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Configured network devices */}
      {netDevices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Network Devices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {netDevices.map(([key, value]) => {
              const parts = String(value).split(',');
              const bridgePart = parts.find((p) => p.includes('bridge='));
              const bridge = bridgePart?.split('=')[1];
              const modelPart = parts[0]; // e.g. "virtio=XX:XX:XX:XX:XX:XX"
              const [model, mac] = modelPart?.includes('=') ? modelPart.split('=') : [modelPart, ''];

              return (
                <div key={key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{key}</Badge>
                      <span className="text-sm font-medium">{model}</span>
                    </div>
                    {bridge && (
                      <Badge variant="secondary" className="text-xs">{bridge}</Badge>
                    )}
                  </div>
                  {mac && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{mac}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Live interfaces */}
      {ifaces?.interfaces && ifaces.interfaces.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Live Interfaces (Guest Agent)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ifaces.interfaces.map((iface) => (
              <div key={iface.name} className="rounded-md border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{iface.name}</span>
                  {iface.mac && (
                    <span className="font-mono text-xs text-muted-foreground">{iface.mac}</span>
                  )}
                </div>
                {iface.ips && iface.ips.length > 0 ? (
                  <div className="space-y-0.5">
                    {iface.ips.map((ip) => (
                      <div key={ip.address} className="flex items-center gap-2">
                        <span className="font-mono text-xs">{ip.address}/{ip.prefix}</span>
                        <Badge variant="secondary" className="text-[10px]">{ip.type}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No addresses</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
