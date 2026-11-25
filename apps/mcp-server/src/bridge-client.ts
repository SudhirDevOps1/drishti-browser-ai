import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface BridgeResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

const COMMAND_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingCommand>();
  private connected = false;
  private destroyed = false;

  constructor(
    private readonly url: string,
    private readonly authToken: string
  ) {}

  isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      const ws = new WebSocket(this.url);
      this.ws = ws;

      const onOpen = () => {
        // Send auth identifying as MCP client controller
        const authMsg = JSON.stringify({ type: 'auth', token: this.authToken, client: 'mcp' });
        ws.send(authMsg);
      };

      const onMessage = (data: WebSocket.RawData) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Handle auth ack
        const msg = parsed as Record<string, unknown>;
        if (msg['type'] === 'auth_ok' || msg['type'] === 'auth_ack') {
          this.connected = true;
          ws.removeListener('open', onOpen);
          ws.removeListener('message', onMessage);
          ws.removeListener('error', onError);

          // Re-attach persistent message handler
          ws.on('message', this.handleMessage.bind(this));
          ws.on('close', this.handleClose.bind(this));
          resolve();
          return;
        }

        // Some bridges don't send explicit auth_ok; treat first message as success
        if (!this.connected) {
          this.connected = true;
          ws.removeListener('open', onOpen);
          ws.removeListener('message', onMessage);
          ws.removeListener('error', onError);

          ws.on('message', this.handleMessage.bind(this));
          ws.on('close', this.handleClose.bind(this));

          // Also process this message
          this.handleMessage(data);
          resolve();
        }
      };

      const onError = (err: Error) => {
        reject(err);
      };

      // If the bridge is not up, resolve anyway after a short delay so the
      // MCP server can still start and report errors per-tool.
      const fallbackTimer = setTimeout(() => {
        ws.removeListener('open', onOpen);
        ws.removeListener('message', onMessage);
        ws.removeListener('error', onError);
        ws.on('message', this.handleMessage.bind(this));
        ws.on('close', this.handleClose.bind(this));
        resolve();
      }, 2_000);

      ws.once('open', () => {
        clearTimeout(fallbackTimer);
        onOpen();
      });

      ws.on('message', onMessage);
      ws.once('error', (err) => {
        clearTimeout(fallbackTimer);
        // Don't reject — allow MCP server to run; tools will report errors
        console.error('[BridgeClient] connection error:', err.message);
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    this.connected = false;

    // Reject all pending commands
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('BridgeClient disconnected'));
      this.pending.delete(id);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendCommand(action: string, payload: unknown): Promise<unknown> {
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
        reject(new Error(`BridgeClient: command '${action}' timed out after ${COMMAND_TIMEOUT_MS}ms`));
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.ws.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
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

    if (msg.success) {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(msg.error ?? 'Unknown bridge error'));
    }
  }

  private handleClose(): void {
    this.connected = false;

    // Reject all pending
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('BridgeClient: WebSocket closed unexpectedly'));
      this.pending.delete(id);
    }

    if (!this.destroyed) {
      console.error(`[BridgeClient] connection closed. Reconnecting in ${RECONNECT_DELAY_MS}ms…`);
      setTimeout(() => {
        if (!this.destroyed) {
          this.connect().catch((err) => {
            console.error('[BridgeClient] reconnect failed:', err.message);
          });
        }
      }, RECONNECT_DELAY_MS);
    }
  }
}
