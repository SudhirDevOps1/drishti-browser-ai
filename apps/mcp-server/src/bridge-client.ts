import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface BridgeResponse {
  id: string;
  success?: boolean;
  result?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type CommandHook = (entry: {
  action: string;
  payload: unknown;
  result?: unknown;
  error?: string;
  durationMs: number;
}) => void;

function resolveCommandTimeoutMs(): number {
  const raw = process.env.BRIDGE_COMMAND_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingCommand>();
  private connected = false;
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;
  private commandHooks = new Set<CommandHook>();

  constructor(
    private readonly url: string,
    private readonly authToken: string
  ) {}

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  onCommand(hook: CommandHook): () => void {
    this.commandHooks.add(hook);
    return () => {
      this.commandHooks.delete(hook);
    };
  }

  private emitHook(entry: Parameters<CommandHook>[0]): void {
    for (const hook of this.commandHooks) {
      try {
        hook(entry);
      } catch {
        // Never break tool execution because of a recording hook
      }
    }
  }

  connect(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }
    if (this.isConnected()) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connectPromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          resolve();
        }
      };

      const ws = new WebSocket(this.url);
      this.ws = ws;

      const onOpen = () => {
        const authMsg = JSON.stringify({ type: 'auth', token: this.authToken, client: 'mcp' });
        ws.send(authMsg);
      };

      const attachPersistentHandlers = () => {
        ws.removeListener('open', onOpen);
        ws.removeListener('message', onAuthMessage);
        ws.on('message', this.handleMessage.bind(this));
        ws.on('close', this.handleClose.bind(this));
        ws.on('error', (err) => {
          console.error('[BridgeClient] socket error:', err.message);
        });
      };

      const onAuthMessage = (data: WebSocket.RawData) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          return;
        }

        const msg = parsed as Record<string, unknown>;
        if (msg['type'] === 'auth_fail' || msg['type'] === 'auth:fail') {
          console.error('[BridgeClient] authentication failed');
          this.connected = false;
          try { ws.close(); } catch {}
          finish();
          return;
        }

        if (msg['type'] === 'auth_ok' || msg['type'] === 'auth:ok' || msg['type'] === 'auth_ack') {
          this.connected = true;
          this.reconnectAttempts = 0;
          attachPersistentHandlers();
          finish();
          return;
        }

        if (!this.connected) {
          this.connected = true;
          this.reconnectAttempts = 0;
          attachPersistentHandlers();
          this.handleMessage(data);
          finish();
        }
      };

      const fallbackTimer = setTimeout(() => {
        if (!this.connected) {
          attachPersistentHandlers();
          this.scheduleReconnect();
          finish();
        }
      }, 2_000);

      ws.once('open', () => {
        clearTimeout(fallbackTimer);
        onOpen();
      });

      ws.on('message', onAuthMessage);
      ws.once('error', (err) => {
        clearTimeout(fallbackTimer);
        this.connected = false;
        console.error('[BridgeClient] connection error:', err.message);
        this.scheduleReconnect();
        finish();
      });
    });

    return this.connectPromise;
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer || this.isConnected()) return;
    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempts += 1;
    console.error(`[BridgeClient] scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && !this.isConnected()) {
        this.connect().catch(() => {});
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('BridgeClient disconnected'));
      this.pending.delete(id);
    }

    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  async sendCommand(action: string, payload: unknown): Promise<unknown> {
    if (!this.isConnected()) {
      // Auto-reconnect once on demand before failing
      await this.connect();
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const err = new Error(
        `BridgeClient: not connected to bridge at ${this.url}. Ensure Local Bridge is running (pnpm bridge:start).`
      );
      this.emitHook({ action, payload, error: err.message, durationMs: 0 });
      throw err;
    }

    const start = Date.now();
    try {
      const result = await this.dispatchOnce(action, payload);
      this.emitHook({ action, payload, result, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If socket dropped mid-flight, attempt 1 reconnect + retry
      if (!this.destroyed && msg.includes('WebSocket closed')) {
        await this.connect();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const retryResult = await this.dispatchOnce(action, payload);
          this.emitHook({ action, payload, result: retryResult, durationMs: Date.now() - start });
          return retryResult;
        }
      }
      this.emitHook({ action, payload, error: msg, durationMs: Date.now() - start });
      throw err;
    }
  }

  private dispatchOnce(action: string, payload: unknown): Promise<unknown> {
    const timeoutMs = resolveCommandTimeoutMs();
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`BridgeClient: not connected to bridge at ${this.url}`));
        return;
      }

      const id = uuidv4();
      const message = JSON.stringify({
        id,
        action,
        payload,
        timestamp: Date.now(),
      });

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`BridgeClient: command '${action}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.ws.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }

    const msg = parsed as BridgeResponse;
    if (!msg.id) return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.success === false || msg.error) {
      pending.reject(new Error(msg.error ?? 'Unknown bridge error'));
    } else {
      pending.resolve(msg.result);
    }
  }

  private handleClose(): void {
    this.connected = false;
    this.ws = null;

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('BridgeClient: WebSocket closed unexpectedly'));
      this.pending.delete(id);
    }

    this.scheduleReconnect();
  }
}
