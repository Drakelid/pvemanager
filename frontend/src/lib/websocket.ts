type MessageHandler = (data: unknown) => void;

interface WSOptions {
  url: string;
  onMessage?: MessageHandler;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private options: WSOptions;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Map<string, Set<MessageHandler>>();
  private _isConnected = false;

  constructor(options: WSOptions) {
    this.options = {
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      ...options,
    };
  }

  get isConnected() {
    return this._isConnected;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem('access_token');
    const separator = this.options.url.includes('?') ? '&' : '?';
    const url = token
      ? `${this.options.url}${separator}token=${encodeURIComponent(token)}`
      : this.options.url;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempts = 0;
      this.startPing();
      this.options.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.options.onMessage?.(data);

        // Route to channel subscribers
        if (data.channel) {
          const handlers = this.subscribers.get(data.channel);
          handlers?.forEach((handler) => handler(data));
        }
      } catch {
        // Non-JSON message
        this.options.onMessage?.(event.data);
      }
    };

    this.ws.onclose = () => {
      this._isConnected = false;
      this.stopPing();
      this.options.onClose?.();
      this.tryReconnect();
    };

    this.ws.onerror = (event) => {
      this.options.onError?.(event);
    };
  }

  disconnect() {
    this.options.reconnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  subscribe(channel: string, handler: MessageHandler) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(handler);

    // Send subscribe message
    this.send({ type: 'subscribe', channel });

    // Return unsubscribe function
    return () => {
      this.subscribers.get(channel)?.delete(handler);
    };
  }

  private tryReconnect() {
    if (
      !this.options.reconnect ||
      this.reconnectAttempts >= (this.options.maxReconnectAttempts ?? 10)
    ) {
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.options.reconnectInterval);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

// Singleton for tasks WebSocket
let tasksWs: WebSocketManager | null = null;

export function getTasksWebSocket(): WebSocketManager {
  if (!tasksWs) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    tasksWs = new WebSocketManager({
      url: `${protocol}//${window.location.host}/ws/tasks`,
    });
  }
  return tasksWs;
}
