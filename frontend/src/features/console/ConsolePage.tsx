import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { Maximize, Minimize, Keyboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { vmTypeLabel } from '@/lib/format';
import '@xterm/xterm/css/xterm.css';


// noVNC and xterm.js will be loaded dynamically
// We use dynamic imports for code splitting

interface VNCData {
  port: number;
  ticket: string;
  password?: string;
  host: string;
  node: string;
  vmid: number;
  type: string;
  auth_ticket?: string;
}

export default function ConsolePage() {
  const { serverId, vmid } = useParams<{ serverId: string; vmid: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const node = searchParams.get('node') || '';
  const type = searchParams.get('type') || 'qemu';

  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<unknown>(null);
  const termRef = useRef<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sid = Number(serverId);
  const vid = Number(vmid);

  // ==================== VNC Console (QEMU) ====================
  const connectVNC = useCallback(async () => {
    try {
      const data = await apiClient.get<VNCData>(
        `/proxmox/api/${sid}/vm/${vid}/vnc?node=${node}`
      );

      // Dynamic import noVNC. The package ships CJS, so depending on bundler
      // interop the result can be: { default: RFB }, { default: { default: RFB, __esModule: true } },
      // or the raw CJS namespace. Normalise to the actual constructor.
      // @ts-expect-error noVNC doesn't have TS declarations
      const rfbModule = await import('@novnc/novnc/lib/rfb');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = rfbModule;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RFB: any =
        typeof mod === 'function'
          ? mod
          : typeof mod.default === 'function'
            ? mod.default
            : typeof mod.default?.default === 'function'
              ? mod.default.default
              : typeof mod.RFB === 'function'
                ? mod.RFB
                : null;
      if (typeof RFB !== 'function') {
        throw new Error('noVNC RFB constructor not found in module exports');
      }

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        port: String(data.port),
        vncticket: data.ticket,
      });
      if (data.password) params.set('vnc_password', data.password);
      if (data.auth_ticket) params.set('auth_ticket', data.auth_ticket);

      const wsUrl = `${wsProto}//${window.location.host}/proxmox/ws/vnc/${sid}/${data.node}/qemu/${vid}?${params}`;

      if (!containerRef.current) return;

      // Pass URL string to RFB, NOT an open WebSocket
      const rfb = new RFB(containerRef.current, wsUrl, {
        credentials: { password: data.password || '' },
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = true;

      rfb.addEventListener('connect', () => {
        setStatus('connected');
      });

      rfb.addEventListener('disconnect', (e: CustomEvent) => {
        if (e.detail?.clean) {
          setStatus('error');
          setErrorMsg('Connection closed');
        } else {
          setStatus('error');
          setErrorMsg('Connection lost');
        }
      });

      rfbRef.current = rfb;
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [sid, vid, node]);

  // ==================== Terminal Console (LXC) ====================
  const connectTerminal = useCallback(async () => {
    try {
      const data = await apiClient.get<VNCData>(
        `/proxmox/api/${sid}/container/${vid}/terminal?node=${node}`
      );

      // Dynamic import xterm.js
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);

      if (!containerRef.current) return;

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'JetBrains Mono, monospace',
        theme: {
          background: '#09090B',
          foreground: '#F0F0F3',
          cursor: '#F0F0F3',
          selectionBackground: 'rgba(255,255,255,0.2)',
        },
      });

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(containerRef.current);

      // Wait a frame, then fit
      requestAnimationFrame(() => {
        fitAddon.fit();
      });

      // WebSocket connection
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/proxmox/ws/terminal/${sid}/${data.node}/${vid}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');

        // Send resize
        const { cols, rows } = terminal;
        ws.send(`1:${cols}:${rows}:`);

        // Keepalive every 120s
        keepaliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('2');
          }
        }, 120000);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data));
        } else {
          terminal.write(event.data);
        }
      };

      ws.onclose = () => {
        setStatus('error');
        setErrorMsg('Terminal connection closed');
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMsg('Terminal connection error');
      };

      // User input → WebSocket
      terminal.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          const encoder = new TextEncoder();
          const byteLength = encoder.encode(data).byteLength;
          ws.send(`0:${byteLength}:${data}`);
        }
      });

      // Resize handler
      terminal.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`1:${cols}:${rows}:`);
        }
      });

      // Window resize
      const handleResize = () => fitAddon.fit();
      window.addEventListener('resize', handleResize);

      termRef.current = { terminal, fitAddon, cleanup: () => window.removeEventListener('resize', handleResize) };
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [sid, vid, node]);

  // ==================== Connect on mount ====================
  useEffect(() => {
    if (type === 'qemu') {
      connectVNC();
    } else {
      connectTerminal();
    }

    return () => {
      // Cleanup
      if (rfbRef.current) {
        try { (rfbRef.current as { disconnect: () => void }).disconnect(); } catch { /* */ }
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (keepaliveRef.current) {
        clearInterval(keepaliveRef.current);
      }
      if (termRef.current) {
        const t = termRef.current as { terminal: { dispose: () => void }; cleanup: () => void };
        t.cleanup();
        t.terminal.dispose();
      }
    };
  }, [type, connectVNC, connectTerminal]);

  // ==================== Fullscreen ====================
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // ==================== Send Ctrl+Alt+Del (VNC) ====================
  const sendCtrlAltDel = () => {
    if (rfbRef.current) {
      (rfbRef.current as { sendCtrlAltDel: () => void }).sendCtrlAltDel();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#09090B]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/30 bg-[#111113] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-border/50">
            {vmTypeLabel(type)} #{vmid}
          </Badge>
          <span className="text-xs text-muted-foreground">Node: {node}</span>
          <Badge
            variant="secondary"
            className={`text-[10px] ${
              status === 'connected'
                ? 'bg-green-500/10 text-green-500'
                : status === 'connecting'
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-red-500/10 text-red-500'
            }`}
          >
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {type === 'qemu' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={sendCtrlAltDel}
            >
              <Keyboard className="mr-1 h-3 w-3" />
              Ctrl+Alt+Del
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Console viewport */}
      <div className="relative flex-1">
        {status === 'connecting' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#09090B]">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">{t('console.connecting')}</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#09090B]">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-red-500">{errorMsg}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus('connecting');
                  setErrorMsg('');
                  if (type === 'qemu') connectVNC();
                  else connectTerminal();
                }}
              >
                {t('console.reconnect')}
              </Button>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ minHeight: 'calc(100vh - 40px)' }}
        />
      </div>
    </div>
  );
}
