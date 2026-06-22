// deriveSubscriberMetrics — agent-facing engagement metrics for the subscriber
// detail page. Key invariant: it surfaces `insured` (a boolean) but NEVER a
// cover amount — agents must not see a subscriber's cover.

import { describe, it, expect } from 'vitest';
import { deriveSubscriberMetrics } from './subscriberMetrics';

describe('deriveSubscriberMetrics', () => {
  it('derives largest / last / ad hoc from contribution history', () => {
    const m = deriveSubscriberMetrics({
      contributionHistory: [10000, 10000, 10000, 50000],
      lastContribution: 50000,
      lastContributionDate: '2026-06-01',
    });
    expect(m.largest).toBe(50000);
    expect(m.last).toBe(50000);
    expect(m.lastDate).toBe('2026-06-01');
    expect(m.adHoc).toBe(1); // the 50000 is >25% above the 10000 median
  });

  it('reports insured=true for an active life policy with cover', () => {
    const m = deriveSubscriberMetrics({
      contributionHistory: [],
      insurance: { cover: 1000000, premiumMonthly: 2000, status: 'active' },
    });
    expect(m.insured).toBe(true);
  });

  it('reports insured=false when there is no cover or the policy is inactive', () => {
    expect(deriveSubscriberMetrics({ insurance: null }).insured).toBe(false);
    expect(
      deriveSubscriberMetrics({ insurance: { cover: 0, status: 'active' } }).insured,
    ).toBe(false);
    expect(
      deriveSubscriberMetrics({ insurance: { cover: 1000000, status: 'inactive' } }).insured,
    ).toBe(false);
  });

  it('NEVER returns a cover amount (agents must not see cover)', () => {
    const m = deriveSubscriberMetrics({
      insurance: { cover: 5000000, premiumMonthly: 7500, status: 'active' },
    });
    expect(m).not.toHaveProperty('cover');
    expect(Object.values(m)).not.toContain(5000000);
  });
});
