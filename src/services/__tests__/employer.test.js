// Employer service tests — focused on the contribution-run write path
// (`submitContributionRun`), the core flow of the Employer dashboard.
//
// Two branches, mirroring `subscriber.test.js`:
//   * real (Supabase) branch — asserts the `submit_contribution_run` RPC call
//     SHAPE (param names `p_rows` / `p_period_label` / `p_method` / `p_nonce`),
//     like the existing rpc-shape tests.
//   * mock-fallback branch (`VITE_USE_SUPABASE=false`) — exercises the math
//     matrix the RPC re-derives server-side: employer-only vs co-contribution,
//     pct-based vs fixed-amount config, the retirement/emergency split (default
//     80/20, `emergency = gross - retirement`), per-employee + grand totals,
//     skip reasons (suspended / not-owned / not-found), nonce idempotency, and
//     — critically — that the result carries NO commission side-effect (the
//     mock produces only the run summary; no `commissions`/`transactions`/
//     `subscriber_balances` artifact is exposed or touched).
//
// The seed roster (`src/data/employerSeed.js`) is the source of truth for the
// expected figures; we recompute the same way the RPC / `lineFor` does so the
// assertions stay aligned with the seed if salaries/config drift.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';
import {
  EMPLOYER,
  EMPLOYEES,
  EMPLOYER_UNIT_PRICE,
} from '../../data/employerSeed';

const supabaseMock = makeSupabaseMock();

vi.mock('@/services/supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));
vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

beforeEach(() => {
  supabaseMock.__reset();
});

const round = (n) => Math.round(n);
const empById = (id) => EMPLOYEES.find((e) => e.id === id);

/**
 * Re-derive one active employee's expected line the same way the RPC does.
 * NEW co-contribution model: the employer MATCHES `matchPct` of the employee's
 * own monthly saving (monthlyContribution), capped by an optional fixed UGX
 * maximum on the employer top-up. Dual-read: a legacy co row (employeePct, no
 * matchPct) falls back to the OLD salary-based math. employer-only unchanged.
 */
function expectedLine(emp) {
  const cfg = emp.contributionConfig ?? {};
  const mode = cfg.mode ?? 'employer-only';
  let employerHalf;
  let employeeHalf;
  if (mode === 'co-contribution') {
    if (cfg.matchPct != null) {
      employeeHalf = round(emp.monthlyContribution ?? 0);
      employerHalf = round(employeeHalf * (cfg.matchPct ?? 0) / 100);
      if (cfg.maxContribution != null && cfg.maxContribution !== '') {
        employerHalf = Math.min(employerHalf, round(cfg.maxContribution));
      }
    } else {
      employerHalf =
        cfg.employerAmount != null
          ? round(cfg.employerAmount)
          : round((emp.salary ?? 0) * (cfg.employerPct ?? 0) / 100);
      employeeHalf =
        cfg.employeeAmount != null
          ? round(cfg.employeeAmount)
          : round((emp.salary ?? 0) * (cfg.employeePct ?? 0) / 100);
    }
  } else {
    employerHalf =
      cfg.employerAmount != null
        ? round(cfg.employerAmount)
        : round((emp.salary ?? 0) * (cfg.employerPct ?? 0) / 100);
    employeeHalf = 0;
  }
  const gross = employerHalf + employeeHalf;
  const retPct = emp.contributionSchedule?.retirementPct ?? 80;
  const retirement = round(gross * retPct / 100);
  const emergency = gross - retirement;
  return { employerHalf, employeeHalf, gross, retirement, emergency };
}

// =============================================================================
// Real (Supabase) branch — RPC call shape
// =============================================================================

describe('employer service — real (Supabase) branch', () => {
  let svc;
  beforeEach(async () => {
    svc = await import('../employer');
  });

  describe('submitContributionRun', () => {
    it('calls submit_contribution_run with p_rows / p_period_label / p_method / p_nonce', async () => {
      supabaseMock.__queueRpc('submit_contribution_run', {
        data: {
          runId: 'run-x',
          linesCreated: 2,
          employerTotal: 700000,
          employeeTotal: 350000,
          grandTotal: 1050000,
          skipped: [],
        },
        error: null,
      });
      const rows = [{ employeeId: 'empe-001' }, { employeeId: 'empe-002' }];
      const result = await svc.submitContributionRun('emp-001', {
        rows,
        periodLabel: 'May 2026',
        method: 'Bank transfer',
        nonce: 'nonce-abc',
      });
      expect(result.runId).toBe('run-x');
      expect(result.linesCreated).toBe(2);
      const call = supabaseMock.__getRpcCalls('submit_contribution_run').at(-1);
      expect(call.args.p_rows).toEqual(rows);
      expect(call.args.p_period_label).toBe('May 2026');
      expect(call.args.p_method).toBe('Bank transfer');
      expect(call.args.p_nonce).toBe('nonce-abc');
    });

    it('passes nulls for omitted period/method/nonce', async () => {
      supabaseMock.__queueRpc('submit_contribution_run', {
        data: { runId: 'run-y', linesCreated: 0, employerTotal: 0, employeeTotal: 0, grandTotal: 0, skipped: [] },
        error: null,
      });
      await svc.submitContributionRun('emp-001', { rows: [{ employeeId: 'empe-001' }] });
      const call = supabaseMock.__getRpcCalls('submit_contribution_run').at(-1);
      expect(call.args.p_period_label).toBeNull();
      expect(call.args.p_method).toBeNull();
      expect(call.args.p_nonce).toBeNull();
    });

    it('throws on RPC error', async () => {
      supabaseMock.__queueRpc('submit_contribution_run', {
        data: null,
        error: { message: 'permission denied', code: 'PGRST301' },
      });
      await expect(
        svc.submitContributionRun('emp-001', { rows: [{ employeeId: 'empe-001' }], nonce: 'n' }),
      ).rejects.toMatchObject({ message: 'permission denied' });
    });
  });

  describe('getContributionRuns', () => {
    it('selects from contribution_runs filtered by employer_id, newest-first', async () => {
      supabaseMock.__queueFrom('contribution_runs', { data: [], error: null });
      await svc.getContributionRuns('emp-001');
      const call = supabaseMock.__getFromCalls('contribution_runs').at(-1);
      expect(call.chain.eq).toHaveBeenCalledWith('employer_id', 'emp-001');
      expect(call.chain.order).toHaveBeenCalledWith('run_at', { ascending: false });
    });
  });

  describe('getContributionRun', () => {
    it('fetches the run header then its lines', async () => {
      supabaseMock.__queueFrom('contribution_runs', {
        data: {
          id: 'run-1', employer_id: 'emp-001', period_label: 'March 2026', status: 'completed',
          employer_total: 700000, employee_total: 350000, grand_total: 1050000, run_at: '2026-03-01',
        },
        error: null,
      });
      supabaseMock.__queueFrom('contribution_run_lines', {
        data: [
          { id: 'crl-1', run_id: 'run-1', employee_id: 'empe-001', employer_amount: 420000, employee_amount: 210000, retirement_amount: 504000, emergency_amount: 126000, method: 'Bank transfer' },
        ],
        error: null,
      });
      const result = await svc.getContributionRun('run-1');
      expect(result.run.id).toBe('run-1');
      expect(result.run.grandTotal).toBe(1050000);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].employeeId).toBe('empe-001');
      const lineCall = supabaseMock.__getFromCalls('contribution_run_lines').at(-1);
      expect(lineCall.chain.eq).toHaveBeenCalledWith('run_id', 'run-1');
    });
  });
});

// =============================================================================
// Mock-fallback branch — the math matrix + idempotency + no-commission proof
// =============================================================================

describe('employer service — mock-fallback branch (IS_SUPABASE_ENABLED=false)', () => {
  let svc;

  beforeEach(async () => {
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    vi.doMock('../supabaseClient', () => ({
      supabase: supabaseMock,
      default: supabaseMock,
      getToken: vi.fn(),
      setToken: vi.fn(),
      clearToken: vi.fn(),
    }));
    svc = await import('../employer');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ── co-contribution match (uncapped) + 80/20 split ─────────────────────────
  it('co-contribution (match, uncapped): employer matches matchPct of own saving', async () => {
    // empe-002: monthlyContribution 140,000, co(50) → employee 140k, employer
    // 50% × 140k = 70k (no cap), gross 210k.
    const emp = empById('empe-002');
    const e = expectedLine(emp);
    expect(e.employeeHalf).toBe(140000); // the employee's own saving
    expect(e.employerHalf).toBe(70000); // 50% match, uncapped
    expect(e.gross).toBe(210000);
    expect(e.retirement).toBe(168000); // 80% of 210k
    expect(e.emergency).toBe(42000); // gross - retirement
    expect(e.retirement + e.emergency).toBe(e.gross);

    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-002' }],
      periodLabel: 'May 2026',
      method: 'Bank transfer',
      nonce: 'n-co-1',
    });
    expect(result.linesCreated).toBe(1);
    expect(result.employerTotal).toBe(70000);
    expect(result.employeeTotal).toBe(140000);
    expect(result.grandTotal).toBe(210000);
    expect(result.skipped).toEqual([]);

    // The run is now readable from history with matching per-line amounts.
    const detail = await svc.getContributionRun(result.runId);
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({
      employeeId: 'empe-002',
      employerAmount: 70000,
      employeeAmount: 140000,
      retirementAmount: 168000,
      emergencyAmount: 42000,
      method: 'Bank transfer',
    });
  });

  // ── co-contribution match where the maxContribution cap BINDS ──────────────
  it('co-contribution (match, capped): employer top-up is clamped to maxContribution', async () => {
    // empe-001: monthlyContribution 210,000, co(50, 80000) → uncapped match
    // would be 50% × 210k = 105k, but the 80k cap binds → employer pays 80k.
    const emp = empById('empe-001');
    const e = expectedLine(emp);
    expect(e.employeeHalf).toBe(210000); // the employee's own saving
    expect(e.employerHalf).toBe(80000); // 105k match clamped to the 80k cap
    expect(e.gross).toBe(290000);
    expect(e.retirement).toBe(232000); // 80% of 290k
    expect(e.emergency).toBe(58000); // gross - retirement

    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-001' }],
      nonce: 'n-cap-1',
    });
    expect(result.employerTotal).toBe(80000);
    expect(result.employeeTotal).toBe(210000);
    expect(result.grandTotal).toBe(290000);
    const detail = await svc.getContributionRun(result.runId);
    expect(detail.lines[0]).toMatchObject({
      employeeId: 'empe-001',
      employerAmount: 80000,
      employeeAmount: 210000,
      retirementAmount: 232000,
      emergencyAmount: 58000,
    });
  });

  // ── legacy co-contribution shape (employeePct, no matchPct) → OLD math ──────
  it('co-contribution (legacy shape): falls back to the old salary-based math', async () => {
    // Patch empe-014 to a LEGACY co config (employerPct/employeePct, NO
    // matchPct) — the dual-read must keep it on the OLD salary-based math so an
    // un-migrated live row never zeroes out during cutover. empe-014 salary
    // 1,800,000 → employer 10% = 180k, employee 5% = 90k, gross 270k.
    await svc.updateEmployeeContributionConfig('empe-014', {
      mode: 'co-contribution',
      employerPct: 10,
      employeePct: 5,
      employerAmount: null,
      employeeAmount: null,
    });
    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-014' }],
      nonce: 'n-legacy-1',
    });
    expect(result.employerTotal).toBe(180000); // 10% of salary (legacy)
    expect(result.employeeTotal).toBe(90000); // 5% of salary (legacy)
    expect(result.grandTotal).toBe(270000);
    const detail = await svc.getContributionRun(result.runId);
    // 80/20 split of the 270k gross.
    expect(detail.lines[0].retirementAmount).toBe(216000);
    expect(detail.lines[0].emergencyAmount).toBe(54000);
  });

  // ── employer-only mode → employee half is 0 ────────────────────────────────
  it('employer-only: employee half is 0; gross = employer half', async () => {
    // empe-003: salary 3,100,000, employerOnly(8) → employer 248k, employee 0.
    const emp = empById('empe-003');
    const e = expectedLine(emp);
    expect(e.employerHalf).toBe(248000);
    expect(e.employeeHalf).toBe(0);
    expect(e.gross).toBe(248000);

    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-003' }],
      nonce: 'n-eo-1',
    });
    expect(result.employerTotal).toBe(248000);
    expect(result.employeeTotal).toBe(0);
    expect(result.grandTotal).toBe(248000);
    expect(result.linesCreated).toBe(1);
  });

  // ── legacy fixed-amount co config overrides pct (dual-read) ─────────────────
  it('legacy fixed-amount config: employerAmount/employeeAmount override the pct math', async () => {
    // Patch empe-002 to a LEGACY fixed-amount co-contribution config (no
    // matchPct) via the session override — the dual-read keeps it on the OLD
    // math and the run must use the fixed amounts, not the pct.
    await svc.updateEmployeeContributionConfig('empe-002', {
      mode: 'co-contribution',
      employerPct: 10,
      employeePct: 5,
      employerAmount: 300000,
      employeeAmount: 100000,
    });
    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-002' }],
      nonce: 'n-fixed-1',
    });
    expect(result.employerTotal).toBe(300000);
    expect(result.employeeTotal).toBe(100000);
    expect(result.grandTotal).toBe(400000);
    const detail = await svc.getContributionRun(result.runId);
    // 80/20 split of the 400k gross.
    expect(detail.lines[0].retirementAmount).toBe(320000);
    expect(detail.lines[0].emergencyAmount).toBe(80000);
  });

  // ── grand totals across a multi-employee run ───────────────────────────────
  it('sums per-employee halves into grand totals across multiple employees', async () => {
    const ids = ['empe-001', 'empe-003', 'empe-004'];
    const expected = ids.map((id) => expectedLine(empById(id)));
    const employerTotal = expected.reduce((s, e) => s + e.employerHalf, 0);
    const employeeTotal = expected.reduce((s, e) => s + e.employeeHalf, 0);
    const grandTotal = expected.reduce((s, e) => s + e.gross, 0);

    const result = await svc.submitContributionRun('emp-001', {
      rows: ids.map((id) => ({ employeeId: id })),
      nonce: 'n-multi-1',
    });
    expect(result.linesCreated).toBe(3);
    expect(result.employerTotal).toBe(employerTotal);
    expect(result.employeeTotal).toBe(employeeTotal);
    expect(result.grandTotal).toBe(grandTotal);
    expect(result.grandTotal).toBe(result.employerTotal + result.employeeTotal);
  });

  // ── balances move by the gross; net = retirement + emergency ───────────────
  it('applies the run to the employee balance (net += gross, units += gross/1000)', async () => {
    const before = await svc.getEmployee('empe-004');
    const e = expectedLine(empById('empe-004'));
    await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-004' }],
      nonce: 'n-bal-1',
    });
    const after = await svc.getEmployee('empe-004');
    expect(after.netBalance).toBe(before.netBalance + e.gross);
    expect(after.retirementBalance).toBe(before.retirementBalance + e.retirement);
    expect(after.emergencyBalance).toBe(before.emergencyBalance + e.emergency);
    expect(after.unitsHeld).toBeCloseTo(before.unitsHeld + e.gross / EMPLOYER_UNIT_PRICE, 6);
    expect(after.totalContributions).toBe(before.totalContributions + e.gross);
  });

  // ── skip reasons ───────────────────────────────────────────────────────────
  it('skips a suspended employee with reason "suspended"', async () => {
    // empe-013 is suspended in the seed.
    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-013' }],
      nonce: 'n-susp-1',
    });
    expect(result.linesCreated).toBe(0);
    expect(result.runId).toBeNull();
    expect(result.skipped).toContainEqual({ employeeId: 'empe-013', reason: 'suspended' });
  });

  it('skips an unknown employee with reason "not_found"', async () => {
    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-does-not-exist' }],
      nonce: 'n-nf-1',
    });
    expect(result.linesCreated).toBe(0);
    expect(result.skipped).toContainEqual({ employeeId: 'empe-does-not-exist', reason: 'not_found' });
  });

  it('skips an employee owned by another employer with reason "not_owned"', async () => {
    // Call with a different employerId than the roster's owner (emp-001).
    const result = await svc.submitContributionRun('emp-999', {
      rows: [{ employeeId: 'empe-001' }],
      nonce: 'n-owned-1',
    });
    expect(result.linesCreated).toBe(0);
    expect(result.skipped).toContainEqual({ employeeId: 'empe-001', reason: 'not_owned' });
  });

  it('mixes valid + skipped rows in one run', async () => {
    const result = await svc.submitContributionRun('emp-001', {
      rows: [
        { employeeId: 'empe-001' }, // active → line
        { employeeId: 'empe-013' }, // suspended → skip
        { employeeId: 'empe-nope' }, // unknown → skip
      ],
      nonce: 'n-mixed-1',
    });
    expect(result.linesCreated).toBe(1);
    expect(result.skipped).toHaveLength(2);
    const e = expectedLine(empById('empe-001'));
    expect(result.grandTotal).toBe(e.gross);
  });

  // ── nonce idempotency ──────────────────────────────────────────────────────
  it('is idempotent on a repeated nonce: same result, balances NOT double-applied', async () => {
    const before = await svc.getEmployee('empe-005');
    const payload = {
      rows: [{ employeeId: 'empe-005' }],
      periodLabel: 'May 2026',
      method: 'Bank transfer',
      nonce: 'n-idem-1',
    };
    const first = await svc.submitContributionRun('emp-001', payload);
    const second = await svc.submitContributionRun('emp-001', payload);

    // Second call returns the prior result object (reference-identical).
    expect(second).toBe(first);
    expect(second.runId).toBe(first.runId);
    expect(second.grandTotal).toBe(first.grandTotal);

    // Balance moved exactly once.
    const after = await svc.getEmployee('empe-005');
    const e = expectedLine(empById('empe-005'));
    expect(after.netBalance).toBe(before.netBalance + e.gross);

    // History has exactly one new run for this nonce, not two.
    const runs = await svc.getContributionRuns('emp-001');
    const matching = runs.filter((r) => r.id === first.runId);
    expect(matching).toHaveLength(1);
  });

  // ── NO commission / transactions / subscriber_balances side-effect ─────────
  it('produces NO commission side-effect: result shape is exactly the run summary', async () => {
    const result = await svc.submitContributionRun('emp-001', {
      rows: [{ employeeId: 'empe-001' }],
      nonce: 'n-nocomm-1',
    });
    // The result is ONLY the run summary — no commission field of any kind.
    expect(Object.keys(result).sort()).toEqual(
      ['employeeTotal', 'employerTotal', 'grandTotal', 'linesCreated', 'runId', 'skipped'].sort(),
    );
    expect(result).not.toHaveProperty('commission');
    expect(result).not.toHaveProperty('commissions');
    expect(result).not.toHaveProperty('commissionId');
    expect(result).not.toHaveProperty('transactions');
    expect(result).not.toHaveProperty('subscriberBalances');

    // Per-line shape is also commission-free (just the run-ledger fields).
    const detail = await svc.getContributionRun(result.runId);
    for (const line of detail.lines) {
      expect(Object.keys(line).sort()).toEqual(
        ['emergencyAmount', 'employeeAmount', 'employeeId', 'employerAmount', 'id', 'method', 'retirementAmount', 'runId'].sort(),
      );
    }

    // No supabase `commissions`/`transactions` table or RPC was touched on the
    // mock path (the only side-effect lives in the in-memory employee store).
    expect(supabaseMock.__getFromCalls('commissions')).toHaveLength(0);
    expect(supabaseMock.__getFromCalls('transactions')).toHaveLength(0);
    expect(supabaseMock.__getFromCalls('subscriber_balances')).toHaveLength(0);
    expect(supabaseMock.__getRpcCalls('apply_settlement')).toHaveLength(0);
  });

  // ── empty / malformed input ────────────────────────────────────────────────
  it('returns a zero-line summary (runId null) when no rows resolve to a line', async () => {
    const result = await svc.submitContributionRun('emp-001', {
      rows: [],
      nonce: 'n-empty-1',
    });
    expect(result.linesCreated).toBe(0);
    expect(result.runId).toBeNull();
    expect(result.grandTotal).toBe(0);
  });

  it('throws when rows is not an array', async () => {
    await expect(
      svc.submitContributionRun('emp-001', { rows: null, nonce: 'n-bad-1' }),
    ).rejects.toThrow(/array/i);
  });

  it('getContributionRuns(mock) returns the seed runs newest-first for the employer', async () => {
    const runs = await svc.getContributionRuns(EMPLOYER.id);
    expect(runs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < runs.length; i += 1) {
      expect(String(runs[i - 1].runAt) >= String(runs[i].runAt)).toBe(true);
    }
    expect(runs.every((r) => r.employerId === EMPLOYER.id)).toBe(true);
  });
});
