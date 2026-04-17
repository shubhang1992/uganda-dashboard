import { describe, it, expect } from 'vitest';
import { formatUGX, fmtShort } from '../finance';

describe('finance utils', () => {
  describe('formatUGX()', () => {
    it('returns dash for 0', () => {
      expect(formatUGX(0)).toBe('—');
    });

    it('returns dash for negative amounts', () => {
      expect(formatUGX(-500)).toBe('—');
    });

    it('formats 1000 as UGX 1K', () => {
      expect(formatUGX(1000)).toBe('UGX 1K');
    });

    it('formats 50000 as UGX 50K', () => {
      expect(formatUGX(50000)).toBe('UGX 50K');
    });

    it('formats 1000000 as UGX 1.0M', () => {
      expect(formatUGX(1000000)).toBe('UGX 1.0M');
    });

    it('formats 2500000 as UGX 2.5M', () => {
      expect(formatUGX(2500000)).toBe('UGX 2.5M');
    });

    it('formats 1000000000 as UGX 1.00B', () => {
      expect(formatUGX(1000000000)).toBe('UGX 1.00B');
    });

    it('formats 1500000000 as UGX 1.50B', () => {
      expect(formatUGX(1500000000)).toBe('UGX 1.50B');
    });
  });

  describe('fmtShort()', () => {
    it('formats 1000 as 1K', () => {
      expect(fmtShort(1000)).toBe('1K');
    });

    it('formats 50000 as 50K', () => {
      expect(fmtShort(50000)).toBe('50K');
    });

    it('formats 1000000 as 1M', () => {
      expect(fmtShort(1000000)).toBe('1M');
    });

    it('formats 2500000 as 3M (rounds to nearest integer)', () => {
      expect(fmtShort(2500000)).toBe('3M');
    });

    it('formats 1000000000 as 1.0B', () => {
      expect(fmtShort(1000000000)).toBe('1.0B');
    });

    it('formats 1500000000 as 1.5B', () => {
      expect(fmtShort(1500000000)).toBe('1.5B');
    });
  });
});
