// ─── Port & Network ───────────────────────────────────────────────────────────

/** WebSocket port for the Chrome extension bridge */
export const BRIDGE_WS_PORT = 7483;

/** HTTP port for the MCP server */
export const MCP_HTTP_PORT = 3456;

/** HTTP header carrying the bridge auth token */
export const AUTH_TOKEN_HEADER = 'x-bridge-auth';

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Maximum screenshot payload size in bytes (2 MB) */
export const MAX_SCREENSHOT_SIZE = 2097152;

/** Default operation timeout in milliseconds (30 s) */
export const DEFAULT_TIMEOUT_MS = 30000;

/** Maximum number of autonomous actions before requiring user approval */
export const MAX_AUTO_ACTIONS = 50;

// ─── Versioning ───────────────────────────────────────────────────────────────

export const BRIDGE_VERSION = '0.1.0';

export const EXTENSION_ID_PLACEHOLDER = 'sudhir-browser-ai-extension';

// ─── Security ─────────────────────────────────────────────────────────────────

/** Input types that should never be auto-filled by the agent */
export const SENSITIVE_INPUT_TYPES: readonly string[] = [
  'password',
  'credit-card',
  'card-number',
  'ssn',
  'cvv',
];

/** URL path patterns that the agent must never automate */
export const NEVER_AUTOMATE_PATTERNS: readonly string[] = [
  'checkout',
  'payment',
  'delete-account',
  'send-money',
];
