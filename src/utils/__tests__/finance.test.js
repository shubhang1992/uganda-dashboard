import { describe, it, expect } from 'vitest';
import {
  formatUGX,
  fmtShort,
  parseAmount,
  normalizeFrequency,
  periodsPerYear,
  monthlyEquivalent,
  calcFV,
  sliderToAmt,
  amtToSlider,
  FREQUENCY,
} from '../finance';

describe('finance utils', () => {
  describe('parseAmount()', () => {
    it('parses plain digit strings', () => {
      expect(parseAmount('12500')).toBe(12500);
    });

    it('strips grouping separators', () => {
      expect(parseAmount('12,500')).toBe(12500);
      expect(parseAmount('1,200,000')).toBe(1200000);
    });

    it('strips a currency prefix', () => {
      expect(parseAmount('UGX 50,000')).toBe(50000);
    });

    it('rounds decimals to whole UGX (the BL-8 footgun: no off-by-100)', () => {
      // The old implementation stripped the decimal point → "12,500.50" became
      // 1250050 (off by 100×). The canonical parser rounds instead.
      expect(parseAmount('12,500.50')).toBe(12501);
      expect(parseAmount('45000.50')).toBe(45001);
      expect(parseAmount('45000.49')).toBe(45000);
      expect(parseAmount('1.5')).toBe(2);
    });

    it('accepts numeric input and rounds it', () => {
      expect(parseAmount(50000)).toBe(50000);
      expect(parseAmount(45000.5)).toBe(45001);
    });

    it('returns null for blank / non-numeric / non-positive input', () => {
      expect(parseAmount('')).toBeNull();
      expect(parseAmount('   ')).toBeNull();
      expect(parseAmount('abc')).toBeNull();
      expect(parseAmount('-')).toBeNull();
      expect(parseAmount('.')).toBeNull();
      expect(parseAmount(null)).toBeNull();
      expect(parseAmount(undefined)).toBeNull();
      expect(parseAmount('0')).toBeNull();
      expect(parseAmount(0)).toBeNull();
      expect(parseAmount('-500')).toBeNull();
      expect(parseAmount(-500)).toBeNull();
    });
  });

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

  describe('normalizeFrequency()', () => {
    it('passes canonical ids through unchanged', () => {
      expect(normalizeFrequency('weekly')).toBe(FREQUENCY.WEEKLY);
      expect(normalizeFrequency('monthly')).toBe(FREQUENCY.MONTHLY);
      expect(normalizeFrequency('quarterly')).toBe(FREQUENCY.QUARTERLY);
      expect(normalizeFrequency('half-yearly')).toBe(FREQUENCY.HALF_YEARLY);
      expect(normalizeFrequency('annually')).toBe(FREQUENCY.ANNUALLY);
    });

    it('resolves every half-yearly alias to the canonical id', () => {
      expect(normalizeFrequency('halfYearly')).toBe(FREQUENCY.HALF_YEARLY);
      expect(normalizeFrequency('halfyearly')).toBe(FREQUENCY.HALF_YEARLY);
      expect(normalizeFrequency('semi-annually')).toBe(FREQUENCY.HALF_YEARLY);
      expect(normalizeFrequency('semiannually')).toBe(FREQUENCY.HALF_YEARLY);
    });

    it('resolves the yearly alias to annually', () => {
      expect(normalizeFrequency('yearly')).toBe(FREQUENCY.ANNUALLY);
    });

    it('is case-insensitive', () => {
      expect(normalizeFrequency('WEEKLY')).toBe(FREQUENCY.WEEKLY);
      expect(normalizeFrequency('Half-Yearly')).toBe(FREQUENCY.HALF_YEARLY);
    });

    it('falls back to monthly for empty / unknown input', () => {
      expect(normalizeFrequency('')).toBe(FREQUENCY.MONTHLY);
      expect(normalizeFrequency(null)).toBe(FREQUENCY.MONTHLY);
      expect(normalizeFrequency(undefined)).toBe(FREQUENCY.MONTHLY);
      expect(normalizeFrequency('fortnightly')).toBe(FREQUENCY.MONTHLY);
    });
  });

  describe('periodsPerYear()', () => {
    it('returns the correct count for each canonical frequency', () => {
      expect(periodsPerYear('weekly')).toBe(52);
      expect(periodsPerYear('monthly')).toBe(12);
      expect(periodsPerYear('quarterly')).toBe(4);
      expect(periodsPerYear('half-yearly')).toBe(2);
      expect(periodsPerYear('annually')).toBe(1);
    });

    it('handles aliases via normalizeFrequency', () => {
      expect(periodsPerYear('semi-annually')).toBe(2);
      expect(periodsPerYear('yearly')).toBe(1);
    });

    it('falls back to monthly (12) for unknown input', () => {
      expect(periodsPerYear('fortnightly')).toBe(12);
      expect(periodsPerYear(undefined)).toBe(12);
    });
  });

  describe('monthlyEquivalent()', () => {
    it('returns the amount itself for a monthly schedule', () => {
      expect(monthlyEquivalent({ amount: 50000, frequency: 'monthly' })).toBe(50000);
    });

    it('scales weekly / quarterly / annual schedules to a monthly figure', () => {
      expect(monthlyEquivalent({ amount: 12000, frequency: 'annually' })).toBe(1000);
      expect(monthlyEquivalent({ amount: 30000, frequency: 'quarterly' })).toBe(10000);
      expect(monthlyEquivalent({ amount: 12, frequency: 'weekly' })).toBe(52);
    });

    it('returns 0 for zero / negative / non-finite amounts', () => {
      expect(monthlyEquivalent({ amount: 0, frequency: 'monthly' })).toBe(0);
      expect(monthlyEquivalent({ amount: -5000, frequency: 'monthly' })).toBe(0);
      expect(monthlyEquivalent({ amount: Number.NaN, frequency: 'monthly' })).toBe(0);
    });

    it('returns 0 for null / undefined / missing amount', () => {
      expect(monthlyEquivalent(null)).toBe(0);
      expect(monthlyEquivalent(undefined)).toBe(0);
      expect(monthlyEquivalent({})).toBe(0);
    });
  });

  describe('calcFV()', () => {
    it('returns 0 when years is 0 (no contribution periods)', () => {
      expect(calcFV(50000, 0)).toBe(0);
    });

    it('returns 0 when years is negative', () => {
      expect(calcFV(50000, -5)).toBe(0);
    });

    it('grows a positive payment over time', () => {
      const fv = calcFV(50000, 10);
      expect(fv).toBeGreaterThan(50000 * 12 * 10); // exceeds nominal contributions
    });
  });

  describe('sliderToAmt() / amtToSlider()', () => {
    it('maps slider extremes to the configured min / max', () => {
      expect(sliderToAmt(0, 1000, 1000000)).toBe(1000);
      expect(sliderToAmt(100, 1000, 1000000)).toBe(1000000);
    });

    it('rounds amounts to the nearest 1,000', () => {
      const amt = sliderToAmt(50, 1000, 1000000);
      expect(amt % 1000).toBe(0);
    });

    it('amtToSlider returns 0 / 100 at the bounds', () => {
      expect(amtToSlider(1000, 1000, 1000000)).toBe(0);
      expect(amtToSlider(1000000, 1000, 1000000)).toBe(100);
    });

    it('clamps amounts below min to slider position 0', () => {
      expect(amtToSlider(500, 1000, 1000000)).toBe(0);
    });

    it('round-trips a mid-range amount back to (approximately) itself', () => {
      const amt = sliderToAmt(50, 1000, 1000000);
      const back = sliderToAmt(amtToSlider(amt, 1000, 1000000), 1000, 1000000);
      expect(back).toBe(amt);
    });
  });
});
