import { useState } from 'react';
import { Settings, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVMConfig, useUpdateConfig, useResizeDisk } from '@/hooks/use-instances';
import { toast } from 'sonner';

interface Props {
  serverId: number;
  vmid: number;
  type: string;
  node: string;
}

export default function SettingsTab({ serverId, vmid, type, node }: Props) {
  const { data: config } = useVMConfig(serverId, vmid, type, node);
  const updateConfig = useUpdateConfig(serverId, vmid, type);
  const resizeDisk = useResizeDisk(serverId, vmid, type);

  const [cores, setCores] = useState('');
  const [memory, setMemory] = useState('');
  const [diskSize, setDiskSize] = useState('');
  const [diskDevice, setDiskDevice] = useState('scsi0');

  // Initialize from config
  const currentCores = config?.cores || 0;
  const currentMemory = config?.memory || 0;

  const handleConfigUpdate = () => {
    const updates: Record<string, unknown> = {};
    if (cores && Number(cores) !== currentCores) updates.cores = Number(cores);
    if (memory && Number(memory) !== currentMemory) updates.memory = Number(memory);

    if (Object.keys(updates).length === 0) {
      toast.info('No changes to apply');
      return;
    }

    updateConfig.mutate(updates, {
      onSuccess: () => {
        toast.success('Configuration updated');
        setCores('');
        setMemory('');
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDiskResize = () => {
    if (!diskSize) return;
    resizeDisk.mutate(
      { disk: diskDevice, size: `${diskSize}G` },
      {
        onSuccess: () => {
          toast.success(`Disk resized to ${diskSize}G`);
          setDiskSize('');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* CPU & Memory */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Compute Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cores">vCPU Cores</Label>
              <Input
                id="cores"
                type="number"
                min={1}
                max={128}
                placeholder={String(currentCores)}
                value={cores}
                onChange={(e) => setCores(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Current: {currentCores} cores</p>
            </div>
            <div>
              <Label htmlFor="memory">Memory (MB)</Label>
              <Input
                id="memory"
                type="number"
                min={128}
                step={128}
                placeholder={String(currentMemory)}
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Current: {currentMemory} MB</p>
            </div>
          </div>
          <Button onClick={handleConfigUpdate} disabled={updateConfig.isPending} size="sm">
            {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Changes
          </Button>
          <p className="text-xs text-muted-foreground">
            Note: VM may need to be restarted for changes to take effect.
          </p>
        </CardContent>
      </Card>

      {/* Disk Resize */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Disk Resize</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="disk-device">Disk Device</Label>
              <Input
                id="disk-device"
                value={diskDevice}
                onChange={(e) => setDiskDevice(e.target.value)}
                placeholder="scsi0"
              />
            </div>
            <div>
              <Label htmlFor="disk-size">New Size (GB)</Label>
              <Input
                id="disk-size"
                type="number"
                min={1}
                value={diskSize}
                onChange={(e) => setDiskSize(e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
          </div>
          <Button
            onClick={handleDiskResize}
            disabled={!diskSize || resizeDisk.isPending}
            size="sm"
            variant="outline"
          >
            {resizeDisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resize Disk
          </Button>
          <p className="text-xs text-muted-foreground">
            Disks can only be enlarged. Use the full target size.
          </p>
        </CardContent>
      </Card>

      {/* Raw Config */}
      {config && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Raw Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs font-mono max-h-64">
              {JSON.stringify(config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
