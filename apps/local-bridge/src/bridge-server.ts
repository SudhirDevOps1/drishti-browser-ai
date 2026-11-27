import { EventEmitter } from 'events';
import fs from 'node:fs';
import net from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { validateAuthToken } from './auth.js';
import { logger } from './logger.js';
import { confirmBrowserSaveDialog, type SaveDialogOptions } from './os-dialog.js';
import type { NativeHostTransport } from './native-host.js';

/** Milliseconds to wait for a command response before rejecting. */
const COMMAND_TIMEOUT_MS = 30_000;

export function getDefaultPipePath(): string {
  return process.platform === 'win32' ? '\\\\.\\pipe\\drishti-bridge' : '/tmp/drishti-bridge.sock';
}

export interface BridgeServerOptions {
  port: number;
  authToken: string;
  pipePath?: string | false;
  optionalWs?: boolean;
}

export interface TransportSink {
  isOpen(): boolean;
  send(payload: unknown): boolean;
  close(): void;
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
  private readonly pipePath: string | false;
  private readonly optionalWs: boolean;

  private wss: WebSocketServer | null = null;
  private pipeServer: net.Server | null = null;
  private extensionSink: TransportSink | null = null;

  /** Pending outbound commands waiting for a response from the extension. */
  private pending = new Map<string, PendingCommand>();

  /** Map command ID to the controller sink that issued it */
  private forwardMap = new Map<string, TransportSink>();

  /** Set of connected controller/MCP sinks */
  private controllers = new Set<TransportSink>();

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
    this.pipePath = options.pipePath === undefined ? getDefaultPipePath() : options.pipePath;
    this.optionalWs = Boolean(options.optionalWs);
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

  private wrapWs(ws: WebSocket): TransportSink {
    return {
      isOpen: () => ws.readyState === WebSocket.OPEN,
      send: (payload: unknown) => {
        if (ws.readyState !== WebSocket.OPEN) return false;
        try {
          ws.send(JSON.stringify(payload));
          return true;
        } catch (err) {
          logger.warn(`safeSend(ws) failed: ${err instanceof Error ? err.message : String(err)}`);
          return false;
        }
      },
      close: () => {
        try { ws.close(); } catch {}
      },
    };
  }

  private wrapPipe(sock: net.Socket): TransportSink {
    return {
      isOpen: () => !sock.destroyed && sock.writable,
      send: (payload: unknown) => {
        if (sock.destroyed || !sock.writable) return false;
        try {
          sock.write(JSON.stringify(payload) + '\n');
          return true;
        } catch (err) {
          logger.warn(`safeSend(pipe) failed: ${err instanceof Error ? err.message : String(err)}`);
          return false;
        }
      },
      close: () => {
        try { sock.destroy(); } catch {}
      },
    };
  }

  /** Attach Chrome Native Messaging stdio transport as the active extension link (no token required). */
  attachNativeExtension(transport: NativeHostTransport): void {
    if (this.extensionSink && this.extensionSink !== transport && this.extensionSink.isOpen()) {
      this.extensionSink.close();
    }
    this.extensionSink = transport;
    logger.info('Chrome Extension connected via Native Messaging (zero-token OS pipe)');
    this.emit('extension:connected');
  }

  /** Handle an incoming JSON message from the Native Messaging extension transport. */
  async handleNativeMessage(msg: BridgeMessage): Promise<void> {
    if (!this.extensionSink) return;
    if (msg.type === 'ping') {
      this.extensionSink.send({ type: 'pong', timestamp: Date.now() });
      return;
    }
    await this.handleExtensionMessage(this.extensionSink, msg);
  }

  /** Clean up when Native Messaging extension disconnects. */
  detachNativeExtension(transport: NativeHostTransport): void {
    if (this.extensionSink === transport) {
      this.extensionSink = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Extension disconnected'));
        this.pending.delete(id);
      }
      if (this.pipeServer) {
        try {
          this.pipeServer.close();
        } catch {}
        this.pipeServer = null;
      }
      this.emit('extension:disconnected');
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Start WebSocket and/or Named Pipe server. Resolves when ready. */
  async start(): Promise<void> {
    if (this.pipePath) {
      await this.startPipeServer(this.pipePath);
    }

    if (this.port <= 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
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

      this.wss.once('error', (err: NodeJS.ErrnoException) => {
        if (this.optionalWs && err.code === 'EADDRINUSE') {
          logger.warn(`WebSocket port ${this.port} already in use; continuing with Named Pipe only.`);
          this.wss = null;
          resolve();
          return;
        }
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

  private async startPipeServer(pipePath: string): Promise<void> {
    const maxAttempts = this.optionalWs ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const bound = await new Promise<boolean>((resolve) => {
        if (process.platform !== 'win32' && fs.existsSync(pipePath)) {
          try { fs.unlinkSync(pipePath); } catch {}
        }
        const server = net.createServer((sock) => {
          const sink = this.wrapPipe(sock);
          this.controllers.add(sink);
          logger.info(`MCP Client connected via Named Pipe (${pipePath})`);

          let buf = '';
          sock.on('data', (chunk) => {
            buf += chunk.toString('utf8');
            let nl: number;
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              try {
                const msg = JSON.parse(line) as BridgeMessage;
                if (msg.type === 'ping') {
                  sink.send({ type: 'pong', timestamp: Date.now() });
                  continue;
                }
                void this.handleControllerMessage(sink, msg);
              } catch {
                logger.warn('Received invalid JSON over Named Pipe');
              }
            }
          });

          const cleanup = () => {
            this.controllers.delete(sink);
            for (const [cmdId, mapped] of this.forwardMap.entries()) {
              if (mapped === sink) this.forwardMap.delete(cmdId);
            }
          };
          sock.on('close', cleanup);
          sock.on('error', cleanup);
        });

        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
            resolve(false);
            return;
          }
          logger.warn(`Named Pipe listener skipped (${pipePath}): ${err.message}`);
          resolve(true);
        });

        server.listen(pipePath, () => {
          this.pipeServer = server;
          logger.info(`Named Pipe server listening on ${pipePath}`);
          resolve(true);
        });
      });

      if (bound) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /** Stop the server gracefully, closing all connections. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Bridge shutting down'));
        this.pending.delete(id);
      }

      this.extensionSink?.close();
      for (const ctrl of this.controllers) {
        ctrl.close();
      }
      this.controllers.clear();

      const closePipe = () =>
        new Promise<void>((resPipe) => {
          if (!this.pipeServer) return resPipe();
          this.pipeServer.close(() => {
            if (this.pipePath && process.platform !== 'win32' && fs.existsSync(this.pipePath)) {
              try { fs.unlinkSync(this.pipePath); } catch {}
            }
            resPipe();
          });
        });

      const closeWs = () =>
        new Promise<void>((resWs) => {
          if (!this.wss) return resWs();
          this.wss.close(() => {
            logger.info('WebSocket server closed.');
            resWs();
          });
        });

      void Promise.all([closePipe(), closeWs()]).then(() => resolve());
    });
  }

  /**
   * Send a command to the connected Chrome Extension and await its response.
   */
  sendCommand(action: string, payload: unknown = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.extensionSink || !this.extensionSink.isOpen()) {
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

      if (!this.extensionSink.send(message)) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('Failed to send command to extension'));
      } else {
        logger.debug(`→ Command [${id}] action=${action}`);
      }
    });
  }

  registerHandler(action: string, handler: MessageHandler): void {
    this.handlers.set(action, handler);
    logger.debug(`Registered handler for action: ${action}`);
  }

  /** Returns `true` if a Chrome Extension is currently connected and authenticated. */
  get isExtensionConnected(): boolean {
    return Boolean(this.extensionSink?.isOpen());
  }

  private async handleControllerMessage(sink: TransportSink, msg: BridgeMessage): Promise<void> {
    if (msg.id && msg.action === 'OS_SAVE_DIALOG') {
      const opts = (msg.payload || {}) as SaveDialogOptions;
      const result = await confirmBrowserSaveDialog(opts);
      sink.send({ id: msg.id, success: true, result });
      return;
    }

    if (msg.id && msg.action === 'GET_MISSIONS') {
      sink.send({
        id: msg.id,
        success: true,
        result: {
          missions: this.missions,
          antigravityDirectEnabled: Boolean(process.env.ANTIGRAVITY_LS_ADDRESS && process.env.ANTIGRAVITY_CSRF_TOKEN),
        },
      });
      return;
    }

    if (msg.id && msg.action === 'UPDATE_MISSION') {
      const p = (msg.payload || {}) as Record<string, any>;
      const target = this.missions.find((m) => m.id === p.missionId);
      if (!target) {
        sink.send({ id: msg.id, success: false, error: `Mission not found: ${p.missionId}` });
        return;
      }
      if (p.status) target.status = p.status;
      if (p.summary) target.summary = String(p.summary);
      this.extensionSink?.send({ type: 'mission_update', mission: target });
      sink.send({ id: msg.id, success: true, result: target });
      return;
    }

    if (msg.id && msg.action) {
      if (!this.extensionSink || !this.extensionSink.isOpen()) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!this.extensionSink || !this.extensionSink.isOpen()) {
        sink.send({ id: msg.id, success: false, error: 'No Chrome Extension connected to bridge' });
        return;
      }
      this.forwardMap.set(msg.id, sink);
      if (!this.extensionSink.send({ id: msg.id, action: msg.action, payload: msg.payload })) {
        this.forwardMap.delete(msg.id);
        sink.send({ id: msg.id, success: false, error: 'Failed to forward command to Chrome Extension' });
      }
    }
  }

  private async handleExtensionMessage(sink: TransportSink, msg: BridgeMessage): Promise<void> {
    if (msg.type === 'dispatch_mission' && msg.id) {
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

      sink.send({
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

    if (msg.type === 'response' && msg.id) {
      const clientSink = this.forwardMap.get(msg.id);
      if (clientSink) {
        this.forwardMap.delete(msg.id);
        clientSink.send({ id: msg.id, success: !msg.error, result: msg.result, error: msg.error });
      }

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

    const handler = this.handlers.get(msg.type) ?? this.handlers.get(msg.action ?? '');
    if (handler) {
      try {
        const result = await handler(msg.payload);
        if (msg.id) {
          sink.send({ type: 'response', id: msg.id, result });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Handler error for action "${msg.type}": ${errMsg}`);
        if (msg.id) {
          sink.send({ type: 'response', id: msg.id, error: errMsg });
        }
      }
    } else {
      logger.debug(`No handler registered for type="${msg.type}" action="${msg.action}"`);
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private handleConnection(ws: WebSocket, remoteAddr: string): void {
    const sink = this.wrapWs(ws);
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
          sink.send({ type: 'auth_fail', reason: 'invalid token' });
          ws.close(4003, 'Invalid auth token');
          return;
        }

        authenticated = true;

        if (msg.client === 'mcp' || msg.role === 'controller') {
          isController = true;
          this.controllers.add(sink);
          sink.send({ type: 'auth:ok' });
          logger.info(`MCP Client authenticated from ${remoteAddr}`);
          return;
        }

        if (this.extensionSink && this.extensionSink.isOpen() && this.extensionSink !== sink) {
          logger.info(`Replacing prior extension connection from ${remoteAddr} with fresh connection`);
          this.extensionSink.close();
        }

        this.extensionSink = sink;
        sink.send({ type: 'auth:ok' });
        logger.info(`Chrome Extension authenticated from ${remoteAddr}`);
        this.emit('extension:connected');
        return;
      }

      if (msg.type === 'ping') {
        sink.send({ type: 'pong', timestamp: Date.now() });
        return;
      }

      if (isController) {
        await this.handleControllerMessage(sink, msg);
        return;
      }

      await this.handleExtensionMessage(sink, msg);
    });

    const hbWs = ws as WebSocket & { isAlive?: boolean };
    hbWs.isAlive = true;
    ws.on('pong', () => {
      hbWs.isAlive = true;
    });

    ws.on('close', (code, reason) => {
      this.controllers.delete(sink);
      for (const [cmdId, mapped] of this.forwardMap.entries()) {
        if (mapped === sink) this.forwardMap.delete(cmdId);
      }
      const wasExtension = this.extensionSink === sink;
      if (wasExtension) {
        this.extensionSink = null;
      }

      if (authenticated && wasExtension) {
        logger.info(`Chrome Extension disconnected (code=${code} reason=${reason.toString()})`);
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
      this.controllers.delete(sink);
      for (const [cmdId, mapped] of this.forwardMap.entries()) {
        if (mapped === sink) this.forwardMap.delete(cmdId);
      }
    });
  }
}
