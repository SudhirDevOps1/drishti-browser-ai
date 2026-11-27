import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

function resolveDefaultPipePath(): string {
  return process.env.BRIDGE_PIPE_PATH || (process.platform === 'win32' ? '\\\\.\\pipe\\drishti-bridge' : '/tmp/drishti-bridge.sock');
}

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
  private pipeSocket: net.Socket | null = null;
  private transportMode: 'pipe' | 'ws' | null = null;
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
    if (!this.connected) return false;
    if (this.transportMode === 'pipe') {
      return Boolean(this.pipeSocket && !this.pipeSocket.destroyed && this.pipeSocket.writable);
    }
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private shouldTryPipeFirst(): boolean {
    if (process.env.BRIDGE_TRANSPORT === 'ws') return false;
    if (process.env.BRIDGE_PIPE_PATH) return true;
    return this.url === 'ws://127.0.0.1:7483' || this.url === 'ws://localhost:7483';
  }

  private tryConnectPipe(timeoutMs = 200): Promise<boolean> {
    const pipePath = resolveDefaultPipePath();
    return new Promise((resolve) => {
      let settled = false;
      const sock = net.connect(pipePath);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { sock.destroy(); } catch {}
          resolve(false);
        }
      }, timeoutMs);

      sock.once('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pipeSocket = sock;
        this.transportMode = 'pipe';
        this.connected = true;
        this.reconnectAttempts = 0;

        let buf = '';
        sock.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) this.handleRawJson(line);
          }
        });

        const onDown = () => {
          if (this.pipeSocket === sock) {
            this.pipeSocket = null;
            this.transportMode = null;
            this.handleClose();
          }
        };
        sock.once('close', onDown);
        sock.on('error', () => {
          // handled by close
        });
        resolve(true);
      });

      sock.once('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { sock.destroy(); } catch {}
          resolve(false);
        }
      });
    });
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

    this.connectPromise = new Promise<void>(async (resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          resolve();
        }
      };

      if (this.shouldTryPipeFirst()) {
        const pipeOk = await this.tryConnectPipe(200);
        if (pipeOk) {
          finish();
          return;
        }
      }

      const ws = new WebSocket(this.url);
      this.ws = ws;
      this.transportMode = 'ws';

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
      ws.once('close', (code, reason) => {
        clearTimeout(fallbackTimer);
        this.connected = false;
        finish();
        this.scheduleReconnect();
        console.error(`[BridgeClient] auth closed: ${code} ${reason?.toString() || ''}`);
      });
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

    if (this.pipeSocket) {
      try { this.pipeSocket.destroy(); } catch {}
      this.pipeSocket = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.transportMode = null;
  }

  private autoStartAttempted = false;

  private async tryAutoStartBridge(): Promise<void> {
    if (this.autoStartAttempted) return;
    if (process.env.DRISHTI_AUTO_START_BRIDGE !== '1' && process.env.DRISHTI_AUTO_START_BRIDGE !== 'true') {
      return;
    }
    this.autoStartAttempted = true;
    try {
      const child = spawn('pnpm', ['bridge:start'], {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      child.unref();
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400));
        await this.connect();
        if (this.isConnected()) return;
      }
    } catch {
      // fall through to actionable error
    }
  }

  async sendCommand(action: string, payload: unknown): Promise<unknown> {
    if (!this.isConnected()) {
      // Auto-reconnect once on demand before failing
      await this.connect();
      if (!this.isConnected()) {
        await this.tryAutoStartBridge();
      }
    }

    if (!this.isConnected()) {
      const err = new Error(
        `BridgeClient: not connected to bridge at ${this.url}. Run: pnpm bridge:start (port 7483, ws://127.0.0.1:7483). If already running, verify BRIDGE_AUTH_TOKEN matches .drishti-token.`
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
        if (this.isConnected()) {
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
      if (!this.isConnected()) {
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
        if (this.transportMode === 'pipe' && this.pipeSocket) {
          this.pipeSocket.write(message + '\n');
        } else if (this.ws) {
          this.ws.send(message);
        }
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    this.handleRawJson(data.toString());
  }

  private handleRawJson(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
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
