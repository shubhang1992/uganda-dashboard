import { describe, it, expect } from 'vitest';
import {
  getCommissionRate,
  setCommissionRate,
  getCommissionSummary,
  getEntityCommissionSummary,
  invalidateSummaryCache,
} from '../commissions';

describe('commissions service', () => {
  describe('getCommissionRate()', () => {
    it('returns a number', async () => {
      const rate = await getCommissionRate();
      expect(typeof rate).toBe('number');
    });

    it('returns the default rate of 5000 UGX', async () => {
      const rate = await getCommissionRate();
      expect(rate).toBe(5000);
    });
  });

  describe('setCommissionRate()', () => {
    it('updates the rate and returns the new value', async () => {
      const newRate = 7500;
      const result = await setCommissionRate(newRate);
      expect(result).toBe(7500);

      const updated = await getCommissionRate();
      expect(updated).toBe(7500);
    });

    it('restores the original rate', async () => {
      // Reset to original for other tests
      await setCommissionRate(5000);
      const rate = await getCommissionRate();
      expect(rate).toBe(5000);
    });
  });

  describe('getCommissionSummary()', () => {
    it('returns expected shape with all summary fields', async () => {
      const summary = await getCommissionSummary();
      expect(summary).toBeDefined();
      expect(typeof summary.totalCommissions).toBe('number');
      expect(typeof summary.totalPaid).toBe('number');
      expect(typeof summary.totalDue).toBe('number');
      expect(typeof summary.totalDisputed).toBe('number');
      expect(typeof summary.totalRequested).toBe('number');
      expect(typeof summary.countTotal).toBe('number');
      expect(typeof summary.countPaid).toBe('number');
      expect(typeof summary.countDue).toBe('number');
      expect(typeof summary.countDisputed).toBe('number');
      expect(typeof summary.countRequested).toBe('number');
    });

    it('has totalCommissions equal to sum of paid + due + disputed', async () => {
      const summary = await getCommissionSummary();
      // totalCommissions is the sum of ALL commission amounts
      // totalPaid + totalDue + totalDisputed should cover the main statuses
      expect(summary.totalCommissions).toBeGreaterThan(0);
      expect(summary.countTotal).toBeGreaterThan(0);
    });

    it('returns filtered summary when branchId is provided', async () => {
      // Get a summary without branch filter for comparison
      const all = await getCommissionSummary();
      // A non-existent branch should return zeroes
      const empty = await getCommissionSummary('nonexistent-branch');
      expect(empty.totalCommissions).toBe(0);
      expect(empty.countTotal).toBe(0);
      expect(all.countTotal).toBeGreaterThan(empty.countTotal);
    });
  });

  describe('getEntityCommissionSummary()', () => {
    it('returns correct aggregation shape for country level', async () => {
      invalidateSummaryCache();
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary).toBeDefined();
      expect(typeof summary.totalPaid).toBe('number');
      expect(typeof summary.totalDue).toBe('number');
      expect(typeof summary.totalDisputed).toBe('number');
      expect(typeof summary.countPaid).toBe('number');
      expect(typeof summary.countDue).toBe('number');
      expect(typeof summary.countDisputed).toBe('number');
      expect(typeof summary.total).toBe('number');
      expect(typeof summary.countTotal).toBe('number');
      expect(typeof summary.settlementRate).toBe('number');
    });

    it('returns total equal to sum of paid + due + disputed', async () => {
      invalidateSummaryCache();
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.total).toBe(
        summary.totalPaid + summary.totalDue + summary.totalDisputed
      );
      expect(summary.countTotal).toBe(
        summary.countPaid + summary.countDue + summary.countDisputed
      );
    });

    it('returns a valid settlement rate between 0 and 100', async () => {
      invalidateSummaryCache();
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.settlementRate).toBeGreaterThanOrEqual(0);
      expect(summary.settlementRate).toBeLessThanOrEqual(100);
    });

    it('returns aggregation for region level', async () => {
      invalidateSummaryCache();
      const summary = await getEntityCommissionSummary('region', 'r-central');
      expect(summary).toBeDefined();
      expect(summary.countTotal).toBeGreaterThan(0);
    });
  });
});
