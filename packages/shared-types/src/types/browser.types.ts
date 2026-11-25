// ─── Enums ────────────────────────────────────────────────────────────────────

export enum BrowserMode {
  EXISTING = 'existing',
  DEDICATED = 'dedicated',
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export enum AutomationMode {
  MANUAL = 'MANUAL',
  ASSISTED = 'ASSISTED',
  AUTO = 'AUTO',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  windowId: number;
  index: number;
}

export interface WindowInfo {
  id: number;
  tabs: TabInfo[];
  focused: boolean;
  type: string;
}

export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  children?: AccessibilityNode[];
  bounds?: DOMRect;
  id?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  html?: string;
  accessibility?: AccessibilityNode;
  screenshot?: string;
  timestamp: number;
  tabId: number;
}

export interface ElementInfo {
  selector: string;
  tagName: string;
  type?: string;
  text?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  role?: string;
  ariaLabel?: string;
  bounds: DOMRect;
  visible: boolean;
  interactive: boolean;
  id?: string;
  classes?: string[];
}

export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  type: string;
  timing?: number;
  requestId: string;
}

export interface BrowserState {
  connected: boolean;
  mode: BrowserMode;
  tabs: TabInfo[];
  activeTabId?: number;
  connectionStatus: ConnectionStatus;
}
