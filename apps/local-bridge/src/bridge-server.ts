import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { validateAuthToken } from './auth.js';
import { logger } from './logger.js';
import { confirmBrowserSaveDialog, type SaveDialogOptions } from './os-dialog.js';

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

export interface MissionRecord {
  id: string;
  prompt: string;
  mode: string;
  tabId?: number;
  url?: string;
  title?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  dispatchedTo: 'antigravity' | 'mcp-queue';
  conversationId?: string;
  summary?: string;
  createdAt: string;
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

  /** Mission Inbox queue dispatched from Drishti Control Deck Sidepanel. */
  private missions: MissionRecord[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private static processGuardsInstalled = false;

  constructor(options: BridgeServerOptions) {
    super();
    this.port = options.port;
    this.authToken = options.authToken;
    if (!BridgeServer.processGuardsInstalled) {
      BridgeServer.processGuardsInstalled = true;
      process.on('uncaughtException', (err) => {
        logger.error(`Uncaught exception (bridge kept alive): ${err instanceof Error ? err.message : String(err)}`);
      });
      process.on('unhandledRejection', (reason) => {
        logger.error(`Unhandled rejection (bridge kept alive): ${reason instanceof Error ? reason.message : String(reason)}`);
      });
    }
  }

  private safeSend(ws: WebSocket | null | undefined, payload: unknown): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      logger.warn(`safeSend failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Start the WebSocket server. Resolves when the server is listening. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        host: '127.0.0.1',
        port: this.port,
        maxPayload: 10 * 1024 * 1024, // 10 MB DoS guard
        verifyClient: (info, cb) => {
          const origin = info.origin || info.req.headers.origin;
          // Allow Node CLI/MCP clients (no Origin) and Chrome/Brave extensions only; block CSWSH from web pages
          if (!origin || origin.startsWith('chrome-extension://')) {
            cb(true);
            return;
          }
          logger.warn(`Blocked WebSocket connection from untrusted Origin: ${origin}`);
          cb(false, 403, 'Forbidden Origin');
        },
      });

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

      this.heartbeatTimer = setInterval(() => {
        if (!this.wss) return;
        for (const client of this.wss.clients) {
          const ext = client as WebSocket & { isAlive?: boolean };
          if (ext.isAlive === false) {
            try {
              ext.terminate();
            } catch {}
            continue;
          }
          ext.isAlive = false;
          try {
            if (ext.readyState === WebSocket.OPEN) ext.ping();
          } catch {}
        }
      }, 30_000);
    });
  }

  /** Stop the server gracefully, closing all connections. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
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

      // ── Handle Sidepanel Mission Dispatch (Extension → Antigravity / MCP Queue) ──
      if (!isController && msg.type === 'dispatch_mission' && msg.id) {
        const p = (msg.payload || {}) as Record<string, any>;
        const record: MissionRecord = {
          id: 'mission-' + Date.now().toString(36),
          prompt: String(p.prompt || ''),
          mode: String(p.mode || 'auto'),
          tabId: typeof p.tabId === 'number' ? p.tabId : undefined,
          url: p.url ? String(p.url) : undefined,
          title: p.title ? String(p.title) : undefined,
          status: 'queued',
          dispatchedTo: 'mcp-queue',
          createdAt: new Date().toISOString(),
        };

        const lsAddr = process.env.ANTIGRAVITY_LS_ADDRESS;
        const csrf = process.env.ANTIGRAVITY_CSRF_TOKEN;
        if (lsAddr && csrf) {
          try {
            const agPrompt = [
              `[Drishti Control Deck Mission | ID: ${record.id}]`,
              `User Instruction: ${record.prompt}`,
              `Mode: ${record.mode}`,
              record.tabId ? `Target Tab ID: ${record.tabId} (${record.title || ''} - ${record.url || ''})` : '',
              `Execute this browser task on the user's live Chrome/Brave browser using Drishti (drishti-exec.mjs or MCP tools), and call browser_update_mission({ missionId: "${record.id}", status: "completed", summary: "..." }) when done.`,
            ].filter(Boolean).join('\n');

            const resp = await fetch(`http://${lsAddr}/product.v1.ConversationService/CreateConversation`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'x-antigravity-csrf-token': csrf,
              },
              body: JSON.stringify({
                title: `Drishti: ${record.prompt.slice(0, 40)}`,
                tags: ['drishti-mission'],
                prompt: [{ text: agPrompt }],
              }),
            });
            if (resp.ok) {
              const data = (await resp.json().catch(() => ({}))) as any;
              record.dispatchedTo = 'antigravity';
              record.status = 'running';
              record.conversationId = data.conversationId || data.id;
              logger.info(`Mission ${record.id} dispatched to Antigravity (${record.conversationId || 'started'})`);
            }
          } catch (err) {
            logger.warn(`Antigravity dispatch fallback to MCP queue: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        this.missions = [record, ...this.missions].slice(0, 25);
        logger.info(`Mission ${record.id} [${record.dispatchedTo}]: ${record.prompt.slice(0, 60)}`);

        this.safeSend(ws, {
          type: 'response',
          id: msg.id,
          result: {
            success: true,
            missionId: record.id,
            dispatchedTo: record.dispatchedTo,
            conversationId: record.conversationId,
            steps: [
              record.dispatchedTo === 'antigravity'
                ? `Dispatched directly to Antigravity (${record.conversationId || 'Active'})`
                : `Queued in Universal MCP Mission Inbox (${record.id})`,
            ],
          },
        });
        return;
      }

      // ── Handle Bridge-level OS Save As dialog confirmation ──
      if (isController && msg.id && msg.action === 'OS_SAVE_DIALOG') {
        const opts = (msg.payload || {}) as SaveDialogOptions;
        const result = await confirmBrowserSaveDialog(opts);
        this.safeSend(ws, { id: msg.id, success: true, result });
        return;
      }

      // ── Handle Bridge-level Mission Queue commands from MCP/CLI ──
      if (isController && msg.id && msg.action === 'GET_MISSIONS') {
        this.safeSend(ws, {
          id: msg.id,
          success: true,
          result: {
            missions: this.missions,
            antigravityDirectEnabled: Boolean(process.env.ANTIGRAVITY_LS_ADDRESS && process.env.ANTIGRAVITY_CSRF_TOKEN),
          },
        });
        return;
      }

      if (isController && msg.id && msg.action === 'UPDATE_MISSION') {
        const p = (msg.payload || {}) as Record<string, any>;
        const target = this.missions.find((m) => m.id === p.missionId);
        if (!target) {
          this.safeSend(ws, { id: msg.id, success: false, error: `Mission not found: ${p.missionId}` });
          return;
        }
        if (p.status) target.status = p.status;
        if (p.summary) target.summary = String(p.summary);
        this.safeSend(this.extensionSocket, { type: 'mission_update', mission: target });
        this.safeSend(ws, { id: msg.id, success: true, result: target });
        return;
      }

      // ── Forward command from MCP Controller to Chrome Extension ──
      if (isController && msg.id && msg.action) {
        if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
          this.safeSend(ws, { id: msg.id, success: false, error: 'No Chrome Extension connected to bridge' });
          return;
        }
        this.forwardMap.set(msg.id, ws);
        if (!this.safeSend(this.extensionSocket, { id: msg.id, action: msg.action, payload: msg.payload })) {
          this.forwardMap.delete(msg.id);
          this.safeSend(ws, { id: msg.id, success: false, error: 'Failed to forward command to Chrome Extension' });
        }
        return;
      }

      // ── Response from Chrome Extension ──
      if (msg.type === 'response' && msg.id) {
        // Forward to waiting MCP Controller if applicable
        const clientWs = this.forwardMap.get(msg.id);
        if (clientWs) {
          this.forwardMap.delete(msg.id);
          this.safeSend(clientWs, { id: msg.id, success: !msg.error, result: msg.result, error: msg.error });
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
            this.safeSend(ws, { type: 'response', id: msg.id, result });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Handler error for action "${msg.type}": ${errMsg}`);
          if (msg.id) {
            this.safeSend(ws, { type: 'response', id: msg.id, error: errMsg });
          }
        }
      } else {
        logger.debug(`No handler registered for type="${msg.type}" action="${msg.action}"`);
      }
    });

    const hbWs = ws as WebSocket & { isAlive?: boolean };
    hbWs.isAlive = true;
    ws.on('pong', () => {
      hbWs.isAlive = true;
    });

    ws.on('close', (code, reason) => {
      this.controllers.delete(ws);
      for (const [cmdId, mappedWs] of this.forwardMap.entries()) {
        if (mappedWs === ws) this.forwardMap.delete(cmdId);
      }
      const wasExtension = this.extensionSocket === ws;
      if (wasExtension) {
        this.extensionSocket = null;
      }

      if (authenticated && wasExtension) {
        logger.info(`Chrome Extension disconnected (code=${code} reason=${reason.toString()})`);

        // Reject all pending commands since the connection dropped
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Extension disconnected'));
          this.pending.delete(id);
        }

        this.emit('extension:disconnected');
      } else {
        logger.debug(`Connection from ${remoteAddr} closed (code=${code})`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket error (${remoteAddr}): ${err.message}`);
      this.controllers.delete(ws);
      for (const [cmdId, mappedWs] of this.forwardMap.entries()) {
        if (mappedWs === ws) this.forwardMap.delete(cmdId);
      }
    });
  }
}
