// Unit tests for api/auth/_lib/password.ts.
//
// Covers the validatePasswordShape error vocabulary and the hash / verify
// round-trip. Runs under Vitest (`npm test`) — the embedded config in
// vite.config.js doesn't restrict the include pattern, so `*.test.ts`
// under api/ is picked up alongside the src/ suites.

import { describe, it, expect } from 'vitest';
import {
  validatePasswordShape,
  hashPassword,
  verifyPassword,
} from './password';

describe('validatePasswordShape', () => {
  it('flags empty string as password_required', () => {
    expect(validatePasswordShape('')).toBe('password_required');
  });

  it('flags non-string input as password_required', () => {
    // The route hands us req.body, so guard against undefined / wrong types.
    expect(validatePasswordShape(undefined)).toBe('password_required');
    expect(validatePasswordShape(null)).toBe('password_required');
    expect(validatePasswordShape(12345678)).toBe('password_required');
  });

  it('flags under-8-character input as password_too_short', () => {
    expect(validatePasswordShape('short')).toBe('password_too_short');
    expect(validatePasswordShape('Ab1')).toBe('password_too_short');
  });

  it('flags letter-only passwords as password_too_weak', () => {
    expect(validatePasswordShape('aaaaaaaa')).toBe('password_too_weak');
  });

  it('flags digit-only passwords as password_too_weak', () => {
    expect(validatePasswordShape('12345678')).toBe('password_too_weak');
  });

  it('accepts a well-formed password', () => {
    expect(validatePasswordShape('Demo1234')).toBeNull();
  });

  it('flags 73-character ASCII input as password_too_long', () => {
    // 73 ASCII bytes — one byte over bcrypt's 72-byte hard cap.
    expect(validatePasswordShape('a'.repeat(73))).toBe('password_too_long');
  });

  it('flags multi-byte UTF-8 input that exceeds 72 bytes (even at <73 chars)', () => {
    // Each "ñ" is 2 UTF-8 bytes — 40 chars * 2 = 80 bytes, well past the
    // bcrypt input cap, while only 40 .length. Catches the encoder check.
    expect(validatePasswordShape('ñ'.repeat(40))).toBe('password_too_long');
  });
});

describe('hashPassword / verifyPassword round-trip', () => {
  it('verifies a correct password against its own hash', async () => {
    const hash = await hashPassword('Demo1234');
    expect(await verifyPassword('Demo1234', hash)).toBe(true);
  });

  it('rejects an incorrect password against a valid hash', async () => {
    const hash = await hashPassword('Demo1234');
    expect(await verifyPassword('Demo1235', hash)).toBe(false);
  });

  it('rejects against a malformed hash without throwing', async () => {
    expect(await verifyPassword('Demo1234', 'not-a-hash')).toBe(false);
  });

  it('returns false for empty hash (covers NULL password_hash in DB)', async () => {
    expect(await verifyPassword('Demo1234', '')).toBe(false);
  });
});
