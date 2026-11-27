import { logger } from './logger.js';
import type { BridgeServer } from './bridge-server.js';

/**
 * The set of real MCP bridge action names that the Chrome Extension handles.
 */
const ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'BROWSER_STATUS',
  'BROWSER_BRIDGE_HEALTH',
  'BRIDGE_HEALTH',
  'GET_TABS',
  'GET_ACTIVE_TAB',
  'USE_TAB',
  'NAVIGATE',
  'NEW_TAB',
  'CLOSE_TAB',
  'SWITCH_TAB',
  'GROUP_TABS',
  'RELOAD',
  'GO_BACK',
  'GO_FORWARD',
  'SCREENSHOT',
  'PRINT_PDF',
  'EXECUTE_SCRIPT',
  'OBSERVE',
  'browser_observe',
  'GET_DOM_SNAPSHOT',
  'INSPECT',
  'GET_TEXT',
  'EVALUATE',
  'READ_PAGE',
  'GREP_PAGE',
  'GET_LINKS',
  'FIND_ELEMENT',
  'GET_TABLES',
  'GET_FORMS',
  'CLICK',
  'DOUBLE_CLICK',
  'HOVER',
  'TYPE',
  'SCROLL',
  'SCROLL_INTO_VIEW',
  'PRESS_KEY',
  'SELECT_OPTION',
  'DRAG',
  'WAIT',
  'WAIT_FOR',
  'DOWNLOAD_MEDIA',
  'DOWNLOAD_STATUS',
  'WAIT_DOWNLOAD',
  'GET_PAGE_INFO',
  'GET_CONSOLE_LOGS',
  'GET_NETWORK_LOGS',
  'BATCH_COMPARE',
  'GET_LEARNING_STATS',
  'EXECUTE_WORKFLOW',
  'VERIFY_ACTION',
  'TASK_STATUS',
  'STOP_TASK',
  'REQUEST_HUMAN_HELP',
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
