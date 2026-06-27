import { describe, it, expect } from 'vitest';
import {
  deriveMetrics,
  calcScore,
  scoreLabel,
  monthlyContribStat,
  computeAttention,
  topAgent,
} from '../branchOverviewDerive';

const metrics = {
  totalSubscribers: 1000,
  activeRate: 60,
  kycPending: 5,
  kycIncomplete: 3,
  monthlyContributions: [10, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 20],
};

const agents = [
  { id: 'a1', name: 'James Okello', status: 'active', metrics: { totalContributions: 9_000_000, totalSubscribers: 156, activeRate: 72 } },
  { id: 'a2', name: 'Grace Namubiru', status: 'active', metrics: { totalContributions: 3_000_000, totalSubscribers: 90, activeRate: 60 } },
  { id: 'a3', name: 'New Agent', status: 'inactive', metrics: { totalContributions: 0, totalSubscribers: 0, activeRate: 0 } },
];

describe('branchOverviewDerive', () => {
  it('deriveMetrics computes subscriber/agent splits', () => {
    const d = deriveMetrics(metrics, agents);
    expect(d.totalSubs).toBe(1000);
    expect(d.activeSubs).toBe(600); // 1000 * 60%
    expect(d.dormant).toBe(400);
    expect(d.activeAgents).toBe(2);
    expect(Math.round(d.retentionRate)).toBe(60);
  });

  it('calcScore is clamped to 0..100', () => {
    const d = deriveMetrics(metrics, agents);
    const s = calcScore(d);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('scoreLabel buckets correctly', () => {
    expect(scoreLabel(90)).toBe('Excellent');
    expect(scoreLabel(78)).toBe('Good');
    expect(scoreLabel(55)).toBe('Fair');
    expect(scoreLabel(40)).toBe('Needs Attention');
  });

  it('monthlyContribStat reads current vs previous month', () => {
    const m = monthlyContribStat(metrics);
    expect(m.current).toBe(20);
    expect(m.prev).toBe(18);
    expect(m.changePct).toBe(Math.round(((20 - 18) / 18) * 100)); // +11%
  });

  it('computeAttention returns Dormant + Overdue + Inactive agents (no KYC, no commission tile)', () => {
    const a = computeAttention(
      metrics,
      [{ status: 'active' }, { status: 'inactive' }, { status: 'inactive' }],
      { overdue: 7 },
    );
    expect(a).toHaveLength(3);
    expect(a[0].type).toBe('dormant');
    expect(a[0].label).toBe('Dormant subscribers');
    expect(a[0].value).toBe(400);
    expect(a[1].type).toBe('overdue');
    expect(a[1].label).toBe('Overdue contributions');
    expect(a[1].value).toBe(7); // from the overdue option (RPC total)
    expect(a[1].severity).toBe('warning');
    expect(a[2].type).toBe('inactiveAgents');
    expect(a[2].value).toBe(2); // 2 of 3 agents inactive
    expect(a[2].severity).toBe('warning');
    // KYC row removed; no commission tile.
    expect(a.some((x) => /kyc/i.test(x.label))).toBe(false);
    expect(a.some((x) => /settle|commission/i.test(x.label))).toBe(false);
  });

  it('computeAttention defaults overdue to 0 (all-clear) when not provided', () => {
    const a = computeAttention(metrics, agents);
    const overdue = a.find((x) => x.type === 'overdue');
    expect(overdue.value).toBe(0);
    expect(overdue.severity).toBe('ok');
  });

  it('topAgent picks the contributions leader with its branch-average multiple', () => {
    const t = topAgent(agents);
    expect(t.name).toBe('James Okello');
    // avg = (9M + 3M + 0) / 3 = 4M; James = 9M → 2.25x
    expect(t.multiple).toBeCloseTo(2.25, 2);
  });

  it('handles empty inputs without throwing', () => {
    const d = deriveMetrics({}, []);
    expect(d.totalSubs).toBe(0);
    expect(calcScore(d)).toBeGreaterThanOrEqual(0);
    expect(calcScore(d)).toBeLessThanOrEqual(100);
    expect(topAgent([])).toBeNull();
    expect(computeAttention({})).toHaveLength(3);
  });
});
