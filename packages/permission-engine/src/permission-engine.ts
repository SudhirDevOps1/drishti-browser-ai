// Permission Engine Types
export interface ActionContext {
  url: string;
  tabId: number;
  selector?: string;
  elementType?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  requiresConfirmation?: boolean;
}

export interface SecurityPolicy {
  allowedDomains: string[];          // empty = all allowed
  blockedDomains: string[];
  blocklist?: string[];
  allowedActions: string[];          // empty = all allowed
  blockedActions: string[];
  requireConfirmationFor: string[];  // action types that always need confirm
  allowFormFill: boolean;
  allowNavigation: boolean;
  allowFileDownload: boolean;
  allowClipboard: boolean;
  allowPopups: boolean;
  maxActionsPerTask: number;
  maxAutoActions?: number;
  neverExtractFields?: string[];
  sensitiveFieldBlocking: boolean;   // block auto-fill of sensitive fields
  logSecurityEvents: boolean;
}

export interface SecurityEvent {
  timestamp: number;
  type: 'blocked' | 'allowed' | 'confirmed' | 'suspicious';
  action: string;
  url: string;
  reason: string;
  tabId?: number;
}

// ─── Default Policy ───────────────────────────────────────────────────────────

export const defaultSecurityPolicy: SecurityPolicy = {
  allowedDomains: [],         // all domains allowed by default
  blockedDomains: [
    'accounts.google.com',
    'login.microsoftonline.com',
    'appleid.apple.com',
    'facebook.com/login',
    'github.com/login',
    'paypal.com',
    'bankofamerica.com',
    'chase.com',
    'wellsfargo.com',
  ],
  blocklist: [
    'accounts.google.com',
    'login.microsoftonline.com',
    'appleid.apple.com',
    'paypal.com',
    'bankofamerica.com',
  ],
  allowedActions: [],         // all actions allowed by default
  blockedActions: [
    'delete_account',
    'transfer_funds',
    'purchase',
    'submit_payment',
    'change_password',
    'revoke_permissions',
  ],
  requireConfirmationFor: [
    'click',
    'submit',
    'navigate',
    'type',
    'select',
    'download',
  ],
  allowFormFill: true,
  allowNavigation: true,
  allowFileDownload: false,
  allowClipboard: true,
  allowPopups: false,
  maxActionsPerTask: 100,
  maxAutoActions: 50,
  neverExtractFields: ['password', 'credit-card', 'card-number', 'ssn', 'cvv', 'pin'],
  sensitiveFieldBlocking: true,
  logSecurityEvents: true,
};

// ─── Utility: isSensitiveField ────────────────────────────────────────────────

const SENSITIVE_TYPE_PATTERNS = [
  'password',
];

const SENSITIVE_NAME_PATTERNS = [
  'password',
  'passwd',
  'pass',
  'pwd',
  'credit',
  'card',
  'cardnumber',
  'ccnumber',
  'cvv',
  'cvc',
  'cvc2',
  'cvv2',
  'security',
  'securitycode',
  'ssn',
  'socialsecurity',
  'pin',
  'secret',
  'token',
  'otp',
  'twofa',
  '2fa',
  'auth',
  'routing',
  'account',
  'bankaccount',
  'iban',
  'swift',
];

/**
 * Returns true if the given form field type or name matches known sensitive patterns.
 */
export function isSensitiveField(type: string, name: string): boolean {
  const normalizedType = type.toLowerCase().trim();
  const normalizedName = name.toLowerCase().trim().replace(/[\s_\-]/g, '');

  if (normalizedType === 'password') return true;

  for (const pattern of SENSITIVE_TYPE_PATTERNS) {
    if (normalizedType.includes(pattern)) return true;
  }

  for (const pattern of SENSITIVE_NAME_PATTERNS) {
    if (normalizedName.includes(pattern)) return true;
  }

  return false;
}

// ─── Utility: isDangerousAction ───────────────────────────────────────────────

const DANGEROUS_ACTION_PATTERNS = [
  'delete',
  'remove',
  'drop',
  'destroy',
  'purge',
  'wipe',
  'format',
  'purchase',
  'buy',
  'pay',
  'checkout',
  'transfer',
  'send_money',
  'withdraw',
  'submit_payment',
  'change_password',
  'reset_password',
  'revoke',
  'logout_all',
  'delete_account',
  'cancel_subscription',
  'unsubscribe',
];

const DANGEROUS_URL_PATTERNS = [
  /accounts\./i,
  /login\./i,
  /signin\./i,
  /auth\./i,
  /payment/i,
  /checkout/i,
  /billing/i,
  /bank/i,
  /paypal/i,
  /stripe\.com/i,
  /admin\./i,
  /dashboard.*delete/i,
];

/**
 * Returns true if the action is considered dangerous in the given context.
 */
export function isDangerousAction(action: string, context: ActionContext): boolean {
  const normalizedAction = action.toLowerCase().trim().replace(/[\s\-]/g, '_');

  for (const pattern of DANGEROUS_ACTION_PATTERNS) {
    if (normalizedAction.includes(pattern)) return true;
  }

  if (context.selector) {
    const normalizedSelector = context.selector.toLowerCase();
    for (const pattern of DANGEROUS_ACTION_PATTERNS) {
      if (normalizedSelector.includes(pattern)) return true;
    }
  }

  for (const pattern of DANGEROUS_URL_PATTERNS) {
    if (pattern.test(context.url)) return true;
  }

  return false;
}

// ─── PermissionEngine Class ───────────────────────────────────────────────────

export class PermissionEngine {
  private policy: SecurityPolicy;
  private securityLog: SecurityEvent[] = [];

  constructor(policy: SecurityPolicy = defaultSecurityPolicy) {
    this.policy = { ...defaultSecurityPolicy, ...policy };
  }

  /**
   * Returns true if the given URL is allowed by the current policy.
   */
  isUrlAllowed(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      this.logSecurityEvent({
        timestamp: Date.now(),
        type: 'blocked',
        action: 'navigate',
        url,
        reason: 'Invalid URL format',
      });
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    const fullUrl = url.toLowerCase();

    // Check blocked domains first (block takes priority)
    for (const blocked of this.policy.blockedDomains) {
      if (hostname.includes(blocked.toLowerCase()) || fullUrl.includes(blocked.toLowerCase())) {
        this.logSecurityEvent({
          timestamp: Date.now(),
          type: 'blocked',
          action: 'navigate',
          url,
          reason: `URL matches blocked domain: ${blocked}`,
        });
        return false;
      }
    }

    // If allowedDomains is non-empty, URL must match one of them
    if (this.policy.allowedDomains.length > 0) {
      const isAllowed = this.policy.allowedDomains.some(
        (allowed) => hostname.includes(allowed.toLowerCase())
      );
      if (!isAllowed) {
        this.logSecurityEvent({
          timestamp: Date.now(),
          type: 'blocked',
          action: 'navigate',
          url,
          reason: 'URL not in allowed domains list',
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates whether the given action is permitted in the given context.
   */
  isActionPermitted(action: string, context: ActionContext): PermissionResult {
    const normalizedAction = action.toLowerCase().trim();

    // Check URL allowed
    if (!this.isUrlAllowed(context.url)) {
      return {
        allowed: false,
        reason: `URL not permitted: ${context.url}`,
        requiresConfirmation: false,
      };
    }

    // Check explicitly blocked actions
    for (const blocked of this.policy.blockedActions) {
      if (normalizedAction.includes(blocked.toLowerCase())) {
        this.logSecurityEvent({
          timestamp: Date.now(),
          type: 'blocked',
          action,
          url: context.url,
          reason: `Action blocked by policy: ${blocked}`,
          tabId: context.tabId,
        });
        return {
          allowed: false,
          reason: `Action '${action}' is blocked by security policy`,
          requiresConfirmation: false,
        };
      }
    }

    // Check navigation policy
    if (normalizedAction === 'navigate' && !this.policy.allowNavigation) {
      return { allowed: false, reason: 'Navigation is disabled by policy' };
    }

    // Check file download policy
    if (normalizedAction === 'download' && !this.policy.allowFileDownload) {
      return { allowed: false, reason: 'File downloads are disabled by policy' };
    }

    // Check popup policy
    if (normalizedAction === 'open_popup' && !this.policy.allowPopups) {
      return { allowed: false, reason: 'Popups are disabled by policy' };
    }

    // Check clipboard policy
    if (
      (normalizedAction === 'copy' || normalizedAction === 'paste') &&
      !this.policy.allowClipboard
    ) {
      return { allowed: false, reason: 'Clipboard access is disabled by policy' };
    }

    // Check form fill on sensitive fields
    if (normalizedAction === 'type' || normalizedAction === 'fill') {
      if (this.policy.sensitiveFieldBlocking && context.elementType) {
        const selector = context.selector ?? '';
        if (this.isSensitiveField(context.elementType, selector)) {
          return {
            allowed: false,
            reason: 'Auto-fill of sensitive fields is blocked by policy',
            requiresConfirmation: false,
          };
        }
      }
      if (!this.policy.allowFormFill) {
        return { allowed: false, reason: 'Form fill is disabled by policy' };
      }
    }

    // Check if allowedActions whitelist applies
    if (this.policy.allowedActions.length > 0) {
      const isWhitelisted = this.policy.allowedActions.some((a) =>
        normalizedAction.includes(a.toLowerCase())
      );
      if (!isWhitelisted) {
        return {
          allowed: false,
          reason: `Action '${action}' is not in the allowed actions list`,
        };
      }
    }

    // Determine if confirmation is required
    const requiresConfirmation = this.requiresConfirmation(context.elementType ?? action, context);

    this.logSecurityEvent({
      timestamp: Date.now(),
      type: 'allowed',
      action,
      url: context.url,
      reason: requiresConfirmation ? 'Allowed, confirmation required' : 'Allowed by policy',
      tabId: context.tabId,
    });

    return {
      allowed: true,
      reason: requiresConfirmation ? 'Action allowed, but requires user confirmation' : 'Action permitted by policy',
      requiresConfirmation,
    };
  }

  /**
   * Returns true if the given element type or action requires explicit user confirmation.
   */
  requiresConfirmation(elementType: string, context: ActionContext): boolean {
    const normalized = elementType.toLowerCase().trim();

    for (const pattern of this.policy.requireConfirmationFor) {
      if (normalized.includes(pattern.toLowerCase())) return true;
    }

    // Always confirm dangerous actions
    if (isDangerousAction(elementType, context)) return true;

    return false;
  }

  /**
   * Merge new policy settings into the current policy.
   */
  setPolicy(policy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * Check if a form field is sensitive based on its type and name.
   */
  isSensitiveField(fieldType: string, fieldName: string): boolean {
    return isSensitiveField(fieldType, fieldName);
  }

  /**
   * Log a security event (kept in-memory, capped at 500 entries).
   */
  logSecurityEvent(event: SecurityEvent): void {
    if (!this.policy.logSecurityEvents) return;
    this.securityLog.push(event);
    if (this.securityLog.length > 500) {
      this.securityLog.shift();
    }
  }

  /**
   * Get a copy of the security event log.
   */
  getSecurityLog(): SecurityEvent[] {
    return [...this.securityLog];
  }

  /**
   * Clear the security event log.
   */
  clearSecurityLog(): void {
    this.securityLog = [];
  }

  /**
   * Get the current active policy.
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }
}
