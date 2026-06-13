import { describe, it, expect } from 'vitest';
import {
  deriveEmployeeAnalytics,
  buildRosterExport,
  buildSummaryExport,
  buildRunsExport,
  titleCase,
} from './deriveEmployeeAnalytics';

// v2 (migration 0062): the driver field is `compensation` (monthly UGX), NOT a
// self-set saving amount. The analytics "monthly" KPIs + the saving buckets now
// derive from compensation, so every fixture carries a compensation figure.
const ROSTER = [
  { name: 'Aml Driver', gender: 'male', age: 22, status: 'active', kycStatus: 'complete', insuranceStatus: 'active', compensation: 40000, occupation: 'Driver', joinedDate: '2025-01-15', netBalance: 100000, ownContributions: 90000, employerContributions: 10000, totalContributions: 100000 },
  { name: 'Bea Acct', gender: 'female', age: 30, status: 'active', kycStatus: 'pending', insuranceStatus: 'inactive', compensation: 75000, occupation: 'Accountant', joinedDate: '2025-01-20', netBalance: 200000 },
  { name: 'Cyr Driver', gender: 'male', age: 41, status: 'suspended', kycStatus: 'complete', insuranceStatus: 'active', compensation: 120000, occupation: 'Driver', joinedDate: '2025-03-10', netBalance: 300000 },
  { name: 'Dot Mgr', gender: 'female', age: 58, status: 'active', kycStatus: 'incomplete', insuranceStatus: 'inactive', compensation: 220000, occupation: 'Manager', joinedDate: '2025-03-12', netBalance: 400000 },
];

const find = (arr, key, val) => arr.find((d) => d[key] === val);

describe('deriveEmployeeAnalytics', () => {
  const a = deriveEmployeeAnalytics(ROSTER);

  it('computes headline KPIs', () => {
    expect(a.kpis.total).toBe(4);
    expect(a.kpis.active).toBe(3);
    expect(a.kpis.suspended).toBe(1);
    expect(a.kpis.avgAge).toBe(38); // (22+30+41+58)/4 = 37.75 → 38
    // v2: totalMonthly/avgMonthly are now summed from `compensation`.
    expect(a.kpis.totalMonthly).toBe(455000); // 40000+75000+120000+220000
    expect(a.kpis.avgMonthly).toBe(113750);
    expect(a.kpis.activePct).toBe(75);
    // Per-member insurance is no longer surfaced — coverage is company-wide.
    expect(a.kpis).not.toHaveProperty('insured');
    expect(a.kpis).not.toHaveProperty('insuredPct');
  });

  it('reads group cover from the company config (all-or-nothing), not per-member', () => {
    expect(a.coverage).toEqual({ enabled: false, cover: 0 }); // no config passed
    const on = deriveEmployeeAnalytics(ROSTER, { insuranceEnabled: true, groupCoverAmount: 15000000 });
    expect(on.coverage).toEqual({ enabled: true, cover: 15000000 });
  });

  it('does not expose any employee balance (employer privacy)', () => {
    expect(a.kpis).not.toHaveProperty('totalBalance');
    const { columns } = buildRosterExport(ROSTER);
    expect(columns.find((c) => /balance/i.test(c.label))).toBeUndefined();
  });

  it('builds the gender distribution (largest first)', () => {
    expect(find(a.gender, 'key', 'male').value).toBe(2);
    expect(find(a.gender, 'key', 'female').value).toBe(2);
    expect(find(a.gender, 'key', 'male').name).toBe('Male');
  });

  it('bucketises age into fixed bands', () => {
    expect(find(a.age, 'key', '18–24').value).toBe(1);
    expect(find(a.age, 'key', '25–34').value).toBe(1);
    expect(find(a.age, 'key', '35–44').value).toBe(1);
    expect(find(a.age, 'key', '45–54').value).toBe(0);
    expect(find(a.age, 'key', '55+').value).toBe(1);
  });

  it('splits employment status', () => {
    expect(find(a.status, 'key', 'active').value).toBe(3);
    expect(find(a.status, 'key', 'suspended').value).toBe(1);
  });

  it('bucketises monthly compensation (key stays `saving` for the stable contract)', () => {
    expect(find(a.saving, 'key', '<50k').value).toBe(1);
    expect(find(a.saving, 'key', '50–100k').value).toBe(1);
    expect(find(a.saving, 'key', '100–150k').value).toBe(1);
    expect(find(a.saving, 'key', '200k+').value).toBe(1);
  });

  it('ranks top occupations', () => {
    expect(a.occupation[0]).toMatchObject({ label: 'Driver', value: 2 });
    expect(a.occupation.map((o) => o.label)).toContain('Accountant');
  });

  it('accumulates headcount growth by join month', () => {
    expect(a.growth).toHaveLength(2);
    expect(a.growth[0]).toMatchObject({ key: '2025-01', joined: 2, total: 2, label: 'Jan 25' });
    expect(a.growth[1]).toMatchObject({ key: '2025-03', joined: 2, total: 4, label: 'Mar 25' });
  });

  it('handles an empty roster without dividing by zero', () => {
    const e = deriveEmployeeAnalytics([]);
    expect(e.isEmpty).toBe(true);
    expect(e.kpis.total).toBe(0);
    expect(e.kpis.avgAge).toBe(0);
    expect(e.coverage).toEqual({ enabled: false, cover: 0 });
    expect(e.growth).toEqual([]);
  });
});

describe('export builders', () => {
  it('buildRosterExport maps every member to labelled columns', () => {
    const { rows, columns } = buildRosterExport(ROSTER);
    expect(columns.find((c) => c.key === 'kyc')).toBeTruthy();
    // v2: `compensation` (a real Supabase column) is the "Monthly compensation"
    // column, replacing the vestigial monthlyContribution.
    const compCol = columns.find((c) => c.key === 'compensation');
    expect(compCol).toBeTruthy();
    expect(compCol.label).toBe('Monthly compensation (UGX)');
    expect(columns.find((c) => c.key === 'monthlyContribution')).toBeUndefined();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ gender: 'Male', status: 'Active', kyc: 'Complete', compensation: 40000 });
    // Per-member insurance + mock-only contribution columns are intentionally gone.
    for (const key of ['insurance', 'insuranceCover', 'ownContributions', 'employerContributions', 'totalContributions']) {
      expect(columns.find((c) => c.key === key)).toBeUndefined();
    }
  });

  it('keys every roster row by each column.key so the Excel export is non-empty (audit §7e.1)', () => {
    // The roster export feeds { key, label } columns straight into downloadSheet.
    // buildWorkbookBuffer looks up each cell by column.key — so EVERY column key
    // must resolve to a defined cell on every row, or the .xlsx export goes blank.
    const { rows, columns } = buildRosterExport(ROSTER);
    for (const col of columns) {
      expect(Object.prototype.hasOwnProperty.call(rows[0], col.key)).toBe(true);
      expect(rows[0][col.key]).not.toBeUndefined();
    }
    // At least one human-readable cell carries real content (not '').
    expect(rows[0].name).toBe('Aml Driver');
  });

  it('buildSummaryExport flattens every distribution with percentages', () => {
    const a = deriveEmployeeAnalytics(ROSTER);
    const { rows, columns } = buildSummaryExport(a);
    expect(columns.map((c) => c.key)).toEqual(['metric', 'category', 'count', 'percent']);
    const genderRows = rows.filter((r) => r.metric === 'Gender');
    expect(genderRows.length).toBe(a.gender.length);
    expect(genderRows[0].percent).toMatch(/%$/);
    // v2: the compensation distribution is surfaced under the "Monthly
    // compensation" metric (the `saving` analytics key), not "Monthly saving".
    const compRows = rows.filter((r) => r.metric === 'Monthly compensation');
    expect(compRows.length).toBe(a.saving.length);
    expect(rows.filter((r) => r.metric === 'Monthly saving')).toHaveLength(0);
    // Company group-cover block is appended (shows "Not set up" with no config).
    const coverRows = rows.filter((r) => r.metric === 'Group cover');
    expect(coverRows.length).toBeGreaterThan(0);
    expect(coverRows[0].category).toBe('Not set up');
  });

  it('buildSummaryExport surfaces the group cover when the company config enables it', () => {
    const a = deriveEmployeeAnalytics(ROSTER, { insuranceEnabled: true, groupCoverAmount: 15000000 });
    const { rows } = buildSummaryExport(a);
    const coverRows = rows.filter((r) => r.metric === 'Group cover');
    expect(coverRows).toContainEqual({ metric: 'Group cover', category: 'Covered (all staff)', count: 4, percent: '100%' });
    expect(coverRows).toContainEqual({ metric: 'Group cover', category: 'Cover per member (UGX)', count: 15000000, percent: '' });
  });

  it('buildRunsExport maps run rows', () => {
    const { rows } = buildRunsExport([{ periodLabel: 'May 2026', runAt: '2026-05-21T00:00:00Z', employerTotal: 2500000, employeeTotal: 0, grandTotal: 2500000 }]);
    expect(rows[0]).toMatchObject({ period: 'May 2026', date: '2026-05-21', employer: 2500000, grand: 2500000 });
  });
});

describe('titleCase', () => {
  it('capitalises and guards empties', () => {
    expect(titleCase('male')).toBe('Male');
    expect(titleCase('')).toBe('—');
    expect(titleCase(null)).toBe('—');
  });
});
