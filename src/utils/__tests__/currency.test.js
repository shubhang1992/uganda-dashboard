import { describe, it, expect } from 'vitest';
import { formatUGX, formatNumber, formatUGXShort } from '../currency';

describe('currency utils', () => {
  describe('formatUGX() — compact (default)', () => {
    it('returns dash for 0', () => {
      expect(formatUGX(0)).toBe('—');
    });

    it('returns dash for negative amounts', () => {
      expect(formatUGX(-500)).toBe('—');
    });

    it('returns dash for null / undefined / NaN', () => {
      expect(formatUGX(null)).toBe('—');
      expect(formatUGX(undefined)).toBe('—');
      expect(formatUGX(Number.NaN)).toBe('—');
    });

    it('formats 1000 as UGX 1K', () => {
      expect(formatUGX(1000)).toBe('UGX 1K');
    });

    it('formats 50000 as UGX 50K', () => {
      expect(formatUGX(50000)).toBe('UGX 50K');
    });

    it('formats 1_000_000 as UGX 1.0M', () => {
      expect(formatUGX(1_000_000)).toBe('UGX 1.0M');
    });

    it('formats 2_500_000 as UGX 2.5M', () => {
      expect(formatUGX(2_500_000)).toBe('UGX 2.5M');
    });

    it('formats 1_000_000_000 as UGX 1.00B', () => {
      expect(formatUGX(1_000_000_000)).toBe('UGX 1.00B');
    });

    it('formats 1_500_000_000 as UGX 1.50B', () => {
      expect(formatUGX(1_500_000_000)).toBe('UGX 1.50B');
    });

    it('accepts explicit compact:true', () => {
      expect(formatUGX(50000, { compact: true })).toBe('UGX 50K');
    });
  });

  describe('formatUGX() — exact (compact:false)', () => {
    it('returns UGX 0 for 0', () => {
      expect(formatUGX(0, { compact: false })).toBe('UGX 0');
    });

    it('returns UGX 0 for negative amounts', () => {
      expect(formatUGX(-500, { compact: false })).toBe('UGX 0');
    });

    it('returns UGX 0 for null / undefined / NaN', () => {
      expect(formatUGX(null, { compact: false })).toBe('UGX 0');
      expect(formatUGX(undefined, { compact: false })).toBe('UGX 0');
      expect(formatUGX(Number.NaN, { compact: false })).toBe('UGX 0');
    });

    it('formats 50000 with grouping', () => {
      expect(formatUGX(50000, { compact: false })).toBe('UGX 50,000');
    });

    it('formats 1_234_567 with grouping', () => {
      expect(formatUGX(1_234_567, { compact: false })).toBe('UGX 1,234,567');
    });

    it('rounds non-integer input', () => {
      expect(formatUGX(50000.7, { compact: false })).toBe('UGX 50,001');
    });
  });

  describe('formatNumber()', () => {
    it('formats integers with locale grouping', () => {
      expect(formatNumber(12345)).toBe('12,345');
    });

    it('returns 0 for non-finite input', () => {
      expect(formatNumber(Number.NaN)).toBe('0');
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });

    it('rounds decimals', () => {
      expect(formatNumber(12.6)).toBe('13');
    });

    it('handles zero', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatUGXShort()', () => {
    it('formats 1000 as 1K', () => {
      expect(formatUGXShort(1000)).toBe('1K');
    });

    it('formats 50000 as 50K', () => {
      expect(formatUGXShort(50000)).toBe('50K');
    });

    it('formats 1_000_000 as 1M', () => {
      expect(formatUGXShort(1_000_000)).toBe('1M');
    });

    it('formats 2_500_000 as 3M (rounds to nearest integer)', () => {
      expect(formatUGXShort(2_500_000)).toBe('3M');
    });

    it('formats 1_000_000_000 as 1.0B', () => {
      expect(formatUGXShort(1_000_000_000)).toBe('1.0B');
    });

    it('formats 1_500_000_000 as 1.5B', () => {
      expect(formatUGXShort(1_500_000_000)).toBe('1.5B');
    });

    it('returns 0 for non-positive values', () => {
      expect(formatUGXShort(0)).toBe('0');
      expect(formatUGXShort(-100)).toBe('0');
    });

    it('shows the exact rounded amount below 1,000 (BL-33: no misleading "0K"/"1K")', () => {
      expect(formatUGXShort(400)).toBe('400');
      expect(formatUGXShort(500)).toBe('500');
      expect(formatUGXShort(999)).toBe('999');
      expect(formatUGXShort(999.6)).toBe('1,000');
    });
  });
});
