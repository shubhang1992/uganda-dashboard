import { describe, it, expect } from 'vitest';
import { formatDate } from '../date';

describe('date utils', () => {
  describe('formatDate()', () => {
    const ref = new Date(2026, 3, 8, 14, 32, 0); // 8 April 2026, 14:32 local

    it('formats short variant by default', () => {
      const out = formatDate(ref);
      // Locale formatting can vary by environment; assert structural pieces.
      expect(out).toMatch(/8/);
      expect(out).toMatch(/Apr/);
      expect(out).toMatch(/2026/);
    });

    it('accepts ISO strings', () => {
      const out = formatDate('2026-04-08T14:32:00.000Z');
      expect(out).toMatch(/2026/);
    });

    it('accepts millisecond timestamps', () => {
      const out = formatDate(ref.getTime());
      expect(out).toMatch(/2026/);
    });

    it('formats long variant with the full month name', () => {
      const out = formatDate(ref, { variant: 'long' });
      expect(out).toMatch(/April/);
      expect(out).toMatch(/2026/);
    });

    it('formats time variant with hour and minute', () => {
      const out = formatDate(ref, { variant: 'time' });
      // Should contain colon between hour and minute (locale-dependent).
      expect(out).toMatch(/\d{1,2}[:.]\d{2}/);
    });

    it('formats month-year variant', () => {
      const out = formatDate(ref, { variant: 'month-year' });
      expect(out).toMatch(/April/);
      expect(out).toMatch(/2026/);
      expect(out).not.toMatch(/\b8\b/);
    });

    it('formats day-month variant', () => {
      const out = formatDate(ref, { variant: 'day-month' });
      expect(out).toMatch(/8/);
      expect(out).toMatch(/Apr/);
      expect(out).not.toMatch(/2026/);
    });

    it('returns dash for null / undefined / empty string', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('')).toBe('—');
    });

    it('returns dash for unparseable input', () => {
      expect(formatDate('not a date')).toBe('—');
      expect(formatDate(Number.NaN)).toBe('—');
    });

    it('falls back to short for unknown variants', () => {
      const out = formatDate(ref, { variant: 'mystery' });
      expect(out).toMatch(/Apr/);
      expect(out).toMatch(/2026/);
    });
  });
});
