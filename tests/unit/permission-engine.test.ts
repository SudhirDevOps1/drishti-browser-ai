import { describe, it, expect } from 'vitest';
import { isSensitiveField, isDangerousAction, defaultSecurityPolicy } from '../../packages/permission-engine/src/permission-engine.js';

describe('Permission Engine Unit Tests', () => {
  describe('isSensitiveField', () => {
    it('should identify password fields', () => {
      expect(isSensitiveField('password', 'password')).toBe(true);
      expect(isSensitiveField('text', 'user_password')).toBe(true);
      expect(isSensitiveField('password', 'pwd')).toBe(true);
    });

    it('should identify credit card and payment fields', () => {
      expect(isSensitiveField('text', 'credit-card')).toBe(true);
      expect(isSensitiveField('text', 'cardNumber')).toBe(true);
      expect(isSensitiveField('text', 'cvv')).toBe(true);
      expect(isSensitiveField('text', 'security_code')).toBe(true);
    });

    it('should identify SSN and PIN fields', () => {
      expect(isSensitiveField('text', 'ssn')).toBe(true);
      expect(isSensitiveField('text', 'user_pin')).toBe(true);
    });

    it('should not flag non-sensitive fields', () => {
      expect(isSensitiveField('text', 'username')).toBe(false);
      expect(isSensitiveField('text', 'search_query')).toBe(false);
      expect(isSensitiveField('email', 'user_email')).toBe(false);
    });
  });

  describe('isDangerousAction', () => {
    it('should flag financial or checkout actions as dangerous', () => {
      expect(isDangerousAction('click', { url: 'https://shop.com/checkout', selector: 'button.pay' })).toBe(true);
      expect(isDangerousAction('click', { url: 'https://bank.com/transfer', selector: 'button#send' })).toBe(true);
    });

    it('should flag destructive actions as dangerous', () => {
      expect(isDangerousAction('click', { url: 'https://app.com/settings', selector: 'button.delete-account' })).toBe(true);
    });

    it('should allow benign navigation and search clicks', () => {
      expect(isDangerousAction('click', { url: 'https://google.com', selector: 'button#search' })).toBe(false);
      expect(isDangerousAction('navigate', { url: 'https://wikipedia.org' })).toBe(false);
    });
  });

  describe('defaultSecurityPolicy', () => {
    it('should define domain rules and action limits', () => {
      expect(defaultSecurityPolicy.maxAutoActions).toBeGreaterThan(0);
      expect(defaultSecurityPolicy.blocklist.length).toBeGreaterThan(0);
      expect(defaultSecurityPolicy.neverExtractFields).toContain('password');
    });
  });
});
