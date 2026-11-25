import { randomBytes } from 'crypto';

/**
 * Generates a cryptographically secure random auth token (64 hex characters = 32 bytes).
 */
export function generateAuthToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Constant-time comparison of two auth tokens to prevent timing attacks.
 */
export function validateAuthToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
