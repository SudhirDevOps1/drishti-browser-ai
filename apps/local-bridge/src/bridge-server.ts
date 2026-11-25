import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { validateAuthToken } from './auth.js';
import { logger } from './logger.js';

/** Milliseconds to wait for a command response before rejecting. */
const COMMAND_TIMEOUT_MS = 30_000;

export interface BridgeServerOptions {
  port: number;
  authToken: string;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface BridgeMessage {
  type: string;
  id?: string;
  token?: string;
  action?: string;
  payload?: unknown;
  result?: unknown;
  error?: string;
}

type MessageHandler = (payload: unknown) => Promise<unknown> | unknown;

/**
 * WebSocket bridge server.
 *
 * Lifecycle:
 *   1. Chrome Extension connects and sends `{ type: 'auth', token: '<secret>' }` as first message.
 *   2. Server responds with `{ type: 'auth:ok' }` on success, or closes the socket on failure.
 *   3. MCP layer calls `sendCommand(action, payload)` to send commands to the extension.
 *   4. Extension replies with `{ type: 'response', id: '<cmd-id>', result|error }`.
 */
export class BridgeServer extends EventEmitter {
  private readonly port: number;
  private readonly authToken: string;

  private wss: WebSocketServer | null = null;
  private extensionSocket: WebSocket | null = null;

  /** Pending outbound commands waiting for a response from the extension. */
  private pending = new Map<string, PendingCommand>();

  /** Map command ID to the controller WebSocket client that issued it */
  private forwardMap = new Map<string, WebSocket>();

  /** Set of connected controller/MCP clients */
  private controllers = new Set<WebSocket>();

  /** Registered inbound-action handlers (for MCP → extension routing). */
  private handlers = new Map<string, MessageHandler>();

  constructor(options: BridgeServerOptions) {
    super();
    this.port = options.port;
    this.authToken = options.authToken;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Start the WebSocket server. Resolves when the server is listening. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.once('error', (err) => {
        logger.error(`WebSocket server error: ${err.message}`);
        reject(err);
      });

      this.wss.once('listening', () => {
        logger.info(`WebSocket server listening on ws://localhost:${this.port}`);
        resolve();
      });

      this.wss.on('connection', (ws, req) => {
        const remoteAddr = req.socket.remoteAddress ?? 'unknown';
        logger.info(`Incoming connection from ${remoteAddr}`);
        this.handleConnection(ws, remoteAddr);
      });
    });
  }

  /** Stop the server gracefully, closing all connections. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Reject all pending commands
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Bridge shutting down'));
        this.pending.delete(id);
      }

      this.extensionSocket?.close();
      this.wss?.close(() => {
        logger.info('WebSocket server closed.');
        resolve();
      });
    });
  }

  /**
   * Send a command to the connected Chrome Extension and await its response.
   * @param action  The action name (e.g. `'tab:screenshot'`).
   * @param payload Arbitrary data forwarded to the extension.
   * @returns       Resolves with the response payload or rejects on timeout/error.
   */
  sendCommand(action: string, payload: unknown = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
        reject(new Error('No extension connected'));
        return;
      }

      const id = uuidv4();
      const message: BridgeMessage = { type: 'command', id, action, payload };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command "${action}" timed out after ${COMMAND_TIMEOUT_MS}ms`));
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.extensionSocket.send(JSON.stringify(message));
        logger.debug(`→ Command [${id}] action=${action}`);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Register a handler for messages that arrive *from* the extension (inbound).
   * @param action  The `type` or `action` field to match.
   * @param handler Async function receiving the message payload.
   */
  registerHandler(action: string, handler: MessageHandler): void {
    this.handlers.set(action, handler);
    logger.debug(`Registered handler for action: ${action}`);
  }

  /** Returns `true` if a Chrome Extension is currently connected and authenticated. */
  get isExtensionConnected(): boolean {
    return this.extensionSocket?.readyState === WebSocket.OPEN;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private handleConnection(ws: WebSocket, remoteAddr: string): void {
    let authenticated = false;
    let isController = false;

    ws.on('message', async (data) => {
      let msg: BridgeMessage & { client?: string; role?: string };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        logger.warn('Received non-JSON message; closing connection.');
        ws.close(4001, 'Invalid JSON');
        return;
      }

      // ── Auth handshake (must be first message) ──
      if (!authenticated) {
        if (msg.type !== 'auth' || !msg.token) {
          logger.warn(`Auth failed from ${remoteAddr}: first message must be { type: 'auth', token }`);
          ws.close(4002, 'Authentication required');
          return;
        }

        if (!validateAuthToken(msg.token, this.authToken)) {
          logger.warn(`Auth failed from ${remoteAddr}: invalid token`);
          ws.close(4003, 'Invalid auth token');
          return;
        }

        authenticated = true;

        if (msg.client === 'mcp' || msg.role === 'controller') {
          isController = true;
          this.controllers.add(ws);
          ws.send(JSON.stringify({ type: 'auth:ok' }));
          logger.info(`MCP Client authenticated from ${remoteAddr}`);
          return;
        }

        // If an existing extension socket is open, evict it to allow fresh/reloaded connection
        if (this.extensionSocket && this.extensionSocket.readyState === WebSocket.OPEN && this.extensionSocket !== ws) {
          logger.info(`Replacing prior extension connection from ${remoteAddr} with fresh connection`);
          try {
            this.extensionSocket.close(1000, 'Replaced by newer connection');
          } catch {
            // ignore
          }
        }

        this.extensionSocket = ws;
        ws.send(JSON.stringify({ type: 'auth:ok' }));
        logger.info(`Chrome Extension authenticated from ${remoteAddr}`);
        this.emit('extension:connected');
        return;
      }

      // ── Ping / Pong heartbeat ──
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }

      // ── Forward command from MCP Controller to Chrome Extension ──
      if (isController && msg.id && msg.action) {
        if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({ id: msg.id, success: false, error: 'No Chrome Extension connected to bridge' }));
          return;
        }
        this.forwardMap.set(msg.id, ws);
        this.extensionSocket.send(JSON.stringify({ id: msg.id, action: msg.action, payload: msg.payload }));
        return;
      }

      // ── Response from Chrome Extension ──
      if (msg.type === 'response' && msg.id) {
        // Forward to waiting MCP Controller if applicable
        const clientWs = this.forwardMap.get(msg.id);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          this.forwardMap.delete(msg.id);
          clientWs.send(JSON.stringify({ id: msg.id, success: !msg.error, result: msg.result, error: msg.error }));
        }

        // Also resolve in-process pending command if applicable
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          if (msg.error) {
            logger.debug(`← Error [${msg.id}]: ${msg.error}`);
            pending.reject(new Error(msg.error));
          } else {
            logger.debug(`← Response [${msg.id}]`);
            pending.resolve(msg.result);
          }
        }
        return;
      }

      // ── Inbound extension event / action ──
      const handler = this.handlers.get(msg.type) ?? this.handlers.get(msg.action ?? '');
      if (handler) {
        try {
          const result = await handler(msg.payload);
          if (msg.id) {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, result }));
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Handler error for action "${msg.type}": ${errMsg}`);
          if (msg.id) {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, error: errMsg }));
          }
        }
      } else {
        logger.debug(`No handler registered for type="${msg.type}" action="${msg.action}"`);
      }
    });

    ws.on('close', (code, reason) => {
      this.controllers.delete(ws);
      if (this.extensionSocket === ws) {
        this.extensionSocket = null;
      }

      if (authenticated) {
        logger.info(`Chrome Extension disconnected (code=${code} reason=${reason.toString()})`);

        // Reject all pending commands since the connection dropped
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Extension disconnected'));
          this.pending.delete(id);
        }

        this.emit('extension:disconnected');
      } else {
        logger.debug(`Unauthenticated connection from ${remoteAddr} closed`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket error (${remoteAddr}): ${err.message}`);
      this.emit('error', err);
    });
  }
}
