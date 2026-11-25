import { logger } from './logger.js';
import type { BridgeServer } from './bridge-server.js';

/**
 * The set of action names that the MCP server is permitted to invoke.
 * Any action not in this list is rejected before it reaches the bridge.
 */
const ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  // Tab management
  'tab:list',
  'tab:activate',
  'tab:close',
  'tab:create',
  'tab:reload',
  // Page interaction
  'page:screenshot',
  'page:scroll',
  'page:click',
  'page:type',
  'page:navigate',
  'page:evaluate',
  'page:content',
  'page:find',
  // History / bookmarks
  'history:search',
  'bookmarks:list',
  'bookmarks:add',
  'bookmarks:remove',
  // Browser info
  'browser:info',
  'browser:cookies',
  // Downloads
  'downloads:list',
  'downloads:search',
]);

export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Routes commands from the MCP server layer to the Chrome Extension via the bridge,
 * enforcing an action allowlist and providing structured error responses.
 */
export class CommandRouter {
  private bridge: BridgeServer;

  constructor(bridge: BridgeServer) {
    this.bridge = bridge;
  }

  /**
   * Route a command to the Chrome Extension.
   *
   * @param action  The action identifier (must be in ALLOWED_ACTIONS).
   * @param payload Arbitrary data forwarded to the extension.
   * @returns       A structured `CommandResult`.
   */
  async route(action: string, payload: unknown = {}): Promise<CommandResult> {
    // ── Allowlist check ───────────────────────────────────────────────────
    if (!ALLOWED_ACTIONS.has(action)) {
      logger.warn(`CommandRouter: Rejected unknown action "${action}"`);
      return {
        success: false,
        error: `Action "${action}" is not allowed. Permitted actions: ${[...ALLOWED_ACTIONS].join(', ')}`,
      };
    }

    // ── Availability check ────────────────────────────────────────────────
    if (!this.bridge.isExtensionConnected) {
      logger.warn(`CommandRouter: Cannot route "${action}" — no extension connected`);
      return {
        success: false,
        error: 'Chrome Extension is not connected. Make sure the bridge is running and the extension is loaded.',
      };
    }

    // ── Dispatch ──────────────────────────────────────────────────────────
    logger.info(`CommandRouter: → ${action}`, payload);
    const start = Date.now();

    try {
      const data = await this.bridge.sendCommand(action, payload);
      const elapsed = Date.now() - start;
      logger.info(`CommandRouter: ← ${action} OK (${elapsed}ms)`);
      return { success: true, data };
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`CommandRouter: ← ${action} ERROR (${elapsed}ms): ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Returns the list of actions this router will accept.
   */
  getAllowedActions(): string[] {
    return [...ALLOWED_ACTIONS];
  }
}
