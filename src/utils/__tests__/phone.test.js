import { describe, it, expect } from 'vitest';
import {
  isValidUGPhone,
  parseUGPhoneLocal,
  formatUGPhone,
  toCanonicalUGPhone,
} from '../phone';

describe('parseUGPhoneLocal', () => {
  it('returns 9-digit local from canonical +256 format', () => {
    expect(parseUGPhoneLocal('+256701234567')).toBe('701234567');
  });
  it('strips leading 0 from local format', () => {
    expect(parseUGPhoneLocal('0701234567')).toBe('701234567');
  });
  it('returns input unchanged when already 9 digits with no prefix', () => {
    expect(parseUGPhoneLocal('701234567')).toBe('701234567');
  });
  it('handles formatted strings with spaces and brackets', () => {
    expect(parseUGPhoneLocal('+256 (70) 123 4567')).toBe('701234567');
  });
  it('returns empty for null/undefined', () => {
    expect(parseUGPhoneLocal(null)).toBe('');
    expect(parseUGPhoneLocal(undefined)).toBe('');
  });
  it('truncates excess digits to 9', () => {
    expect(parseUGPhoneLocal('70123456789')).toBe('701234567');
  });
});

describe('isValidUGPhone', () => {
  it('accepts every valid carrier prefix', () => {
    expect(isValidUGPhone('701234567')).toBe(true);
    expect(isValidUGPhone('711234567')).toBe(true);
    expect(isValidUGPhone('741234567')).toBe(true);
    expect(isValidUGPhone('751234567')).toBe(true);
    expect(isValidUGPhone('761234567')).toBe(true);
    expect(isValidUGPhone('771234567')).toBe(true);
    expect(isValidUGPhone('781234567')).toBe(true);
  });
  it('rejects unknown prefixes', () => {
    expect(isValidUGPhone('721234567')).toBe(false);
    expect(isValidUGPhone('801234567')).toBe(false);
    expect(isValidUGPhone('111111111')).toBe(false);
  });
  it('rejects short input', () => {
    expect(isValidUGPhone('70123456')).toBe(false);
    expect(isValidUGPhone('')).toBe(false);
    expect(isValidUGPhone(null)).toBe(false);
  });
  it('accepts canonical +256 format', () => {
    expect(isValidUGPhone('+256701234567')).toBe(true);
    expect(isValidUGPhone('+256 70 123 4567')).toBe(true);
  });
  it('accepts leading-0 format', () => {
    expect(isValidUGPhone('0701234567')).toBe(true);
  });
});

describe('formatUGPhone', () => {
  it('formats canonical input as +256 7XX XXX XXX', () => {
    expect(formatUGPhone('701234567')).toBe('+256 701 234 567');
    expect(formatUGPhone('+256701234567')).toBe('+256 701 234 567');
  });
  it('returns input unchanged when not 9 digits', () => {
    expect(formatUGPhone('70123')).toBe('70123');
    expect(formatUGPhone('')).toBe('');
  });
});

describe('toCanonicalUGPhone', () => {
  it('returns +256-prefixed 12-char string', () => {
    expect(toCanonicalUGPhone('701234567')).toBe('+256701234567');
    expect(toCanonicalUGPhone('+256 701 234 567')).toBe('+256701234567');
    expect(toCanonicalUGPhone('0701234567')).toBe('+256701234567');
  });
  it('returns empty for invalid input', () => {
    expect(toCanonicalUGPhone('70123')).toBe('');
    expect(toCanonicalUGPhone(null)).toBe('');
  });
});
