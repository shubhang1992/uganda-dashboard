// Unit tests for the contribution-schedule "settle this period" math.
import { describe, it, expect } from 'vitest';
import {
  paidThisMonth,
  contributionOwed,
  newlyAddedProducts,
  buildSettleLineItems,
} from './periodSettlement';
import { INSURANCE_PRODUCTS } from '../constants/savings';

const NOW = new Date(2026, 4, 26); // 2026-05-26 (the demo MOCK_NOW)

describe('paidThisMonth', () => {
  it('sums own contributions in the current month', () => {
    const txns = [
      { type: 'contribution', source: 'own', amount: 5000, date: '2026-05-02' },
      { type: 'contribution', source: 'own', amount: 3000, date: '2026-05-20' },
    ];
    expect(paidThisMonth(txns, NOW)).toBe(8000);
  });

  it('ignores employer-sourced contributions', () => {
    const txns = [
      { type: 'contribution', source: 'own', amount: 5000, date: '2026-05-02' },
      { type: 'contribution', source: 'employer', amount: 9999, date: '2026-05-10' },
    ];
    expect(paidThisMonth(txns, NOW)).toBe(5000);
  });

  it('ignores other transaction types and other months', () => {
    const txns = [
      { type: 'contribution', source: 'own', amount: 5000, date: '2026-05-02' },
      { type: 'premium', source: 'own', amount: 2000, date: '2026-05-03' },
      { type: 'withdrawal', source: 'own', amount: 1000, date: '2026-05-04' },
      { type: 'contribution', source: 'own', amount: 7000, date: '2026-04-30' }, // last month
      { type: 'contribution', source: 'own', amount: 4000, date: '2026-06-01' }, // next month
    ];
    expect(paidThisMonth(txns, NOW)).toBe(5000);
  });

  it('returns 0 for empty / invalid input', () => {
    expect(paidThisMonth([], NOW)).toBe(0);
    expect(paidThisMonth(null, NOW)).toBe(0);
    expect(paidThisMonth([{ type: 'contribution', amount: 5000, date: 'not-a-date' }], NOW)).toBe(0);
  });
});

describe('contributionOwed', () => {
  it('owes the difference when the old amount is already paid (5k → 10k)', () => {
    expect(contributionOwed(10000, 5000)).toBe(5000);
  });

  it('owes the full amount when nothing is paid yet', () => {
    expect(contributionOwed(10000, 0)).toBe(10000);
  });

  it('owes nothing when already covered or over-paid', () => {
    expect(contributionOwed(10000, 10000)).toBe(0);
    expect(contributionOwed(10000, 15000)).toBe(0);
  });
});

describe('newlyAddedProducts', () => {
  it('returns products in next not already held', () => {
    expect(newlyAddedProducts(['life'], ['life', 'health', 'funeral'])).toEqual(['health', 'funeral']);
  });

  it('returns nothing when no new products are added', () => {
    expect(newlyAddedProducts(['life', 'health'], ['life'])).toEqual([]);
    expect(newlyAddedProducts(['life'], ['life'])).toEqual([]);
  });

  it('treats missing prev/next as empty', () => {
    expect(newlyAddedProducts(undefined, ['health'])).toEqual(['health']);
    expect(newlyAddedProducts(['life'], undefined)).toEqual([]);
  });

  it('adds nothing when a fully-held plan is re-saved unchanged (no double-charge)', () => {
    // The form now pre-checks held products from the SAME active-policy set the
    // settle flow diffs against, so an untouched re-save yields no new product.
    expect(newlyAddedProducts(['life', 'health', 'funeral'], ['life', 'health', 'funeral'])).toEqual([]);
  });
});

describe('buildSettleLineItems', () => {
  const FUNERAL = INSURANCE_PRODUCTS.find((p) => p.id === 'funeral');
  const HEALTH = INSURANCE_PRODUCTS.find((p) => p.id === 'health');

  it('includes only the contribution line when nothing is added', () => {
    const { lineItems, total } = buildSettleLineItems({ owed: 5000, addedProductIds: [], freqPerYear: 12 });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].kind).toBe('contribution');
    expect(total).toBe(5000);
  });

  it('adds one premium line per new product, summing the total (monthly)', () => {
    const { lineItems, total, products } = buildSettleLineItems({
      owed: 5000,
      addedProductIds: ['health', 'funeral'],
      freqPerYear: 12,
    });
    expect(lineItems).toHaveLength(3);
    expect(products.map((p) => p.id).sort()).toEqual(['funeral', 'health']);
    // monthly → per-period premium === premiumMonthly
    expect(total).toBe(5000 + HEALTH.premiumMonthly + FUNERAL.premiumMonthly);
  });

  it('omits the contribution line when owed is 0 (insurance-only settle)', () => {
    const { lineItems, total } = buildSettleLineItems({ owed: 0, addedProductIds: ['funeral'], freqPerYear: 12 });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].kind).toBe('insurance');
    expect(total).toBe(FUNERAL.premiumMonthly);
  });

  it('prorates the premium per period for non-monthly frequencies (annually)', () => {
    const { total } = buildSettleLineItems({ owed: 0, addedProductIds: ['funeral'], freqPerYear: 1 });
    // annually → one period carries the full year's premium
    expect(total).toBe(FUNERAL.premiumMonthly * 12);
  });
});
