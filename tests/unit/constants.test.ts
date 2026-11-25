import { describe, it, expect } from 'vitest';
import {
  BRIDGE_WS_PORT,
  MCP_HTTP_PORT,
  MAX_AUTO_ACTIONS,
  DEFAULT_TIMEOUT_MS,
  SENSITIVE_INPUT_TYPES,
  NEVER_AUTOMATE_PATTERNS,
} from '../../packages/shared-types/src/constants/index.js';

describe('Shared Constants Tests', () => {
  it('BRIDGE_WS_PORT should be 7483', () => {
    expect(BRIDGE_WS_PORT).toBe(7483);
  });

  it('MCP_HTTP_PORT should be 3456', () => {
    expect(MCP_HTTP_PORT).toBe(3456);
  });

  it('MAX_AUTO_ACTIONS safeguard should be 50', () => {
    expect(MAX_AUTO_ACTIONS).toBe(50);
  });

  it('DEFAULT_TIMEOUT_MS should be 30,000ms', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
  });

  it('SENSITIVE_INPUT_TYPES must safeguard passwords and credit cards', () => {
    expect(SENSITIVE_INPUT_TYPES).toContain('password');
    expect(SENSITIVE_INPUT_TYPES).toContain('credit-card');
    expect(SENSITIVE_INPUT_TYPES).toContain('cvv');
  });

  it('NEVER_AUTOMATE_PATTERNS must include critical financial operations', () => {
    expect(NEVER_AUTOMATE_PATTERNS).toContain('checkout');
    expect(NEVER_AUTOMATE_PATTERNS).toContain('payment');
    expect(NEVER_AUTOMATE_PATTERNS).toContain('delete-account');
  });
});
