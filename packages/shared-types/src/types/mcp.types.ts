// ─── Enums ────────────────────────────────────────────────────────────────────

export enum MCPToolName {
  // Browser Status & Observation
  BROWSER_STATUS = 'browser_status',
  BROWSER_OBSERVE = 'browser_observe',
  BROWSER_SCREENSHOT = 'browser_screenshot',
  BROWSER_SNAPSHOT = 'browser_snapshot',
  BROWSER_CONSOLE = 'browser_console',
  BROWSER_NETWORK = 'browser_network',

  // Navigation
  BROWSER_NAVIGATE = 'browser_navigate',
  BROWSER_NAVIGATE_BACK = 'browser_navigate_back',
  BROWSER_NAVIGATE_FORWARD = 'browser_navigate_forward',
  BROWSER_RELOAD = 'browser_reload',

  // Tabs
  BROWSER_TABS_LIST = 'browser_tabs_list',
  BROWSER_TAB_OPEN = 'browser_tab_open',
  BROWSER_TAB_CLOSE = 'browser_tab_close',
  BROWSER_TAB_SWITCH = 'browser_tab_switch',
  BROWSER_TAB_INFO = 'browser_tab_info',

  // Interaction
  BROWSER_CLICK = 'browser_click',
  BROWSER_TYPE = 'browser_type',
  BROWSER_FILL = 'browser_fill',
  BROWSER_SCROLL = 'browser_scroll',
  BROWSER_HOVER = 'browser_hover',
  BROWSER_DOUBLE_CLICK = 'browser_double_click',
  BROWSER_PRESS_KEY = 'browser_press_key',
  BROWSER_SELECT = 'browser_select',
  BROWSER_DRAG = 'browser_drag',
  BROWSER_FOCUS = 'browser_focus',

  // Content
  BROWSER_GET_TEXT = 'browser_get_text',
  BROWSER_GET_LINKS = 'browser_get_links',
  BROWSER_GET_HTML = 'browser_get_html',
  BROWSER_FIND = 'browser_find',
  BROWSER_WAIT = 'browser_wait',

  // Automation / Task
  TASK_CREATE = 'task_create',
  TASK_STATUS = 'task_status',
  TASK_APPROVE = 'task_approve',
  TASK_CANCEL = 'task_cancel',
  TASK_LIST = 'task_list',
}

export enum MCPToolCategory {
  BROWSER = 'BROWSER',
  NAVIGATION = 'NAVIGATION',
  TABS = 'TABS',
  INTERACTION = 'INTERACTION',
  CONTENT = 'CONTENT',
  AUTOMATION = 'AUTOMATION',
  DEBUGGING = 'DEBUGGING',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface MCPMessage {
  id: string;
  type: 'request' | 'response' | 'error';
  tool?: string;
  args?: Record<string, unknown>;
  result?: MCPToolResult;
  timestamp: number;
}

export interface BridgeMessage {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
  authToken?: string;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface MCPServerConfig {
  port: number;
  wsPort: number;
  authToken: string;
  maxConnections: number;
  timeoutMs: number;
}
