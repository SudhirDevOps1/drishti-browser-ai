import { describe, it, expect } from 'vitest';
import { generateAuthToken, validateAuthToken } from '../../apps/local-bridge/src/auth.js';

describe('Local Bridge Auth Utilities', () => {
  describe('generateAuthToken', () => {
    it('should produce 64-character hex string (256-bit entropy)', () => {
      const token = generateAuthToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce cryptographically unique tokens across calls', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 20; i++) {
        tokens.add(generateAuthToken());
      }
      expect(tokens.size).toBe(20);
    });
  });

  describe('validateAuthToken', () => {
    it('should accept matching tokens', () => {
      const token = generateAuthToken();
      expect(validateAuthToken(token, token)).toBe(true);
    });

    it('should reject mismatched tokens', () => {
      const t1 = generateAuthToken();
      const t2 = generateAuthToken();
      expect(validateAuthToken(t1, t2)).toBe(false);
    });

    it('should reject partial or empty tokens', () => {
      expect(validateAuthToken('', '')).toBe(false);
      expect(validateAuthToken('abc', 'abcdef')).toBe(false);
      expect(validateAuthToken(null as any, 'abc')).toBe(false);
    });
  });
});
