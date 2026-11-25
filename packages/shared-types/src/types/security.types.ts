// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Permission {
  READ_TABS = 'READ_TABS',
  WRITE_TABS = 'WRITE_TABS',
  NAVIGATE = 'NAVIGATE',
  SCREENSHOT = 'SCREENSHOT',
  INTERACT = 'INTERACT',
  EXECUTE_SCRIPT = 'EXECUTE_SCRIPT',
  READ_CONTENT = 'READ_CONTENT',
  NETWORK_INSPECT = 'NETWORK_INSPECT',
}

export enum PermissionLevel {
  NONE = 'NONE',
  READ = 'READ',
  READ_WRITE = 'READ_WRITE',
  FULL = 'FULL',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DomainRule {
  domain: string;
  pattern: string;
  rule: 'allow' | 'block';
  permissions: Permission[];
}

export interface SecurityPolicy {
  allowlist: DomainRule[];
  blocklist: DomainRule[];
  defaultPermissions: Permission[];
  requireConfirmationFor: string[];
  neverExtractFields: string[];
  maxAutoActions: number;
  sessionTimeout: number;
}

export interface SecurityEvent {
  type: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  message: string;
  timestamp: number;
  tabId?: number;
  url?: string;
}
