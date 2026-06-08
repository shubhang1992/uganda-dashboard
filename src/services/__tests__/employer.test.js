// Employer service tests — UNIFIED MODEL (0043–0045). The employer's staff are
// tagged subscribers; funding is a single company-wide config (Issue 2) applied
// by submit_employer_contribution_run (employer-source transactions).
//
// Two branches, mirroring subscriber.test.js:
//   * real (Supabase) branch — asserts the RPC/select call SHAPE.
//   * mock-fallback branch (VITE_USE_SUPABASE=false) — exercises the roster +
//     the employer-run math (match % of each member's own saving, capped),
//     suspended skips, and nonce idempotency. NO commission side-effects.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';
import { EMPLOYER, MEMBERS } from '../../data/employerSeed';

const supabaseMock = makeSupabaseMock();

vi.mock('@/services/supabaseClient', () => ({
  supabase: supabaseMock, default: supabaseMock,
  getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
}));
vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock, default: supabaseMock,
  getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
}));

beforeEach(() => supabaseMock.__reset());

const round = (n) => Math.round(n);
const CFG = EMPLOYER.defaultContributionConfig;
const ACTIVE = MEMBERS.filter((m) => m.status === 'active');

/** Expected employer match for one member under the company config. */
function expectedMatch(m) {
  let amt = round(Number(m.monthlyContribution) * (CFG.matchPct ?? 0) / 100);
  if (CFG.maxContribution != null) amt = Math.min(amt, round(CFG.maxContribution));
  return amt;
}
const EXPECTED_EMPLOYER_TOTAL = ACTIVE.reduce((s, m) => s + expectedMatch(m), 0);

// =============================================================================
// Real (Supabase) branch — call shape
// =============================================================================
describe('employer service — real (Supabase) branch', () => {
  let svc;
  beforeEach(async () => { svc = await import('../employer'); });

  describe('submitContributionRun → submit_employer_contribution_run', () => {
    it('passes p_period_label / p_method / p_nonce (no rows) and returns data', async () => {
      supabaseMock.__queueRpc('submit_employer_contribution_run', {
        data: { runId: 'run-x', linesCreated: 14, employerTotal: 700000, employeeTotal: 0, grandTotal: 700000, skipped: [] },
        error: null,
      });
      const result = await svc.submitContributionRun('emp-001', { periodLabel: 'May 2026', method: 'Bank transfer', nonce: 'n-1' });
      expect(result.runId).toBe('run-x');
      const call = supabaseMock.__getRpcCalls('submit_employer_contribution_run').at(-1);
      expect(call.args.p_period_label).toBe('May 2026');
      expect(call.args.p_method).toBe('Bank transfer');
      expect(call.args.p_nonce).toBe('n-1');
    });

    it('throws on RPC error', async () => {
      supabaseMock.__queueRpc('submit_employer_contribution_run', { data: null, error: { message: 'permission denied' } });
      await expect(svc.submitContributionRun('emp-001', { nonce: 'n' })).rejects.toMatchObject({ message: 'permission denied' });
    });
  });

  describe('createSubscriberFromEmployerOnboard → create_subscriber_from_employer_onboard', () => {
    it('passes payload / calling_employer_id / p_nonce and wraps the id', async () => {
      supabaseMock.__queueRpc('create_subscriber_from_employer_onboard', { data: 's-999', error: null });
      const res = await svc.createSubscriberFromEmployerOnboard('emp-001', { fullName: 'Jane Akello', phone: '700100099' }, 'n-2');
      expect(res).toEqual({ subscriberId: 's-999' });
      const call = supabaseMock.__getRpcCalls('create_subscriber_from_employer_onboard').at(-1);
      expect(call.args.calling_employer_id).toBe('emp-001');
      expect(call.args.p_nonce).toBe('n-2');
      expect(call.args.payload.fullName).toBe('Jane Akello');
    });
  });

  describe('applyGroupInsurance', () => {
    it('calls apply_group_insurance with p_cover', async () => {
      supabaseMock.__queueRpc('apply_group_insurance', { data: { updated: 16, cover: 5000000 }, error: null });
      const summary = await svc.applyGroupInsurance('emp-001', { cover: 5000000 });
      expect(summary).toEqual({ updated: 16, cover: 5000000 });
      expect(supabaseMock.__getRpcCalls('apply_group_insurance').at(-1).args.p_cover).toBe(5000000);
    });
  });

  describe('getEmployees → subscribers WHERE employer_id', () => {
    it('selects subscribers filtered by employer_id and maps the member shape', async () => {
      supabaseMock.__queueFrom('subscribers', {
        data: [{ id: 's-1', employer_id: 'emp-001', name: 'Jane', phone: '700100099', is_active: true, kyc_status: 'pending',
          subscriber_balances: { total_balance: 300000, retirement_balance: 240000, emergency_balance: 60000, units: 300 },
          contribution_schedules: { amount: 100000, retirement_pct: 80, emergency_pct: 20, frequency: 'monthly' } }],
        error: null,
      });
      const members = await svc.getEmployees('emp-001');
      expect(supabaseMock.__getFromCalls('subscribers').at(-1).chain.eq).toHaveBeenCalledWith('employer_id', 'emp-001');
      expect(members[0]).toMatchObject({ id: 's-1', status: 'active', netBalance: 300000, monthlyContribution: 100000, kycStatus: 'pending' });
    });

    it('maps a missing kyc_status to "complete" (legacy rows are not "pending")', async () => {
      supabaseMock.__queueFrom('subscribers', {
        data: [{ id: 's-2', employer_id: 'emp-001', name: 'Sam', is_active: true }],
        error: null,
      });
      const members = await svc.getEmployees('emp-001');
      expect(members[0].kycStatus).toBe('complete');
    });
  });

  describe('getEmployerMetrics', () => {
    it('calls the get_employer_metrics RPC', async () => {
      supabaseMock.__queueRpc('get_employer_metrics', { data: { headcount: 16, active: 14 }, error: null });
      const m = await svc.getEmployerMetrics();
      expect(m.headcount).toBe(16);
      expect(supabaseMock.__getRpcCalls('get_employer_metrics').length).toBe(1);
    });
  });

  describe('removeEmployee', () => {
    it('calls the remove_employer_member RPC (un-link, not suspend)', async () => {
      supabaseMock.__queueRpc('remove_employer_member', { data: { id: 's-1', removed: true }, error: null });
      const res = await svc.removeEmployee('emp-001', 's-1');
      expect(res).toMatchObject({ id: 's-1', removed: true });
      expect(supabaseMock.__getRpcCalls('remove_employer_member').length).toBe(1);
    });
  });
});

// =============================================================================
// Mock-fallback branch — roster + employer-run math + idempotency
// =============================================================================
describe('employer service — mock-fallback branch (IS_SUPABASE_ENABLED=false)', () => {
  let svc;
  beforeEach(async () => {
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    vi.doMock('../supabaseClient', () => ({
      supabase: supabaseMock, default: supabaseMock,
      getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
    }));
    svc = await import('../employer');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('getEmployees returns the seeded members (member shape)', async () => {
    const members = await svc.getEmployees('emp-001');
    expect(members).toHaveLength(MEMBERS.length);
    expect(members[0]).toMatchObject({ id: MEMBERS[0].id, status: 'active' });
    expect(members[0].netBalance).toBeGreaterThan(0);
  });

  it('seeded members are all KYC-complete (pending KYC = pending invites, not members)', async () => {
    const members = await svc.getEmployees('emp-001');
    // Real signup always completes KYC; no employer member is ever pending.
    const pending = members.filter((m) => m.kycStatus === 'pending' || m.kycStatus === 'incomplete');
    expect(pending).toHaveLength(0);
    expect(members.every((m) => typeof m.kycStatus === 'string')).toBe(true);
  });

  it('removeEmployee un-links a member from the roster (mock) — it does not suspend', async () => {
    const before = await svc.getEmployees('emp-001');
    const target = before.find((m) => m.status === 'active');
    const res = await svc.removeEmployee('emp-001', target.id);
    expect(res).toMatchObject({ id: target.id, removed: true });

    const after = await svc.getEmployees('emp-001');
    expect(after).toHaveLength(before.length - 1);
    expect(after.find((m) => m.id === target.id)).toBeUndefined();
    // Other members are untouched (no status change anywhere).
    expect(after.filter((m) => m.status === 'suspended')).toHaveLength(
      before.filter((m) => m.status === 'suspended').length,
    );
  });

  it('bulkCreateEmployerInvites creates one pending invite per row (mock)', async () => {
    const res = await svc.bulkCreateEmployerInvites([
      { fullName: 'Bulk One', phone: '700000001', email: 'one@example.com' },
      { fullName: 'Bulk Two', phone: '700000002', email: 'two@example.com' },
    ]);
    expect(res).toMatchObject({ created: 2, failed: 0, total: 2 });
    const pending = await svc.listPendingInvites('emp-001');
    expect(pending.length).toBe(2);
  });

  it('submitContributionRun posts the employer match to every active member', async () => {
    const result = await svc.submitContributionRun('emp-001', { periodLabel: 'May 2026', method: 'Bank transfer', nonce: 'run-1' });
    expect(result.linesCreated).toBe(ACTIVE.length);
    expect(result.employerTotal).toBe(EXPECTED_EMPLOYER_TOTAL);
    expect(result.grandTotal).toBe(EXPECTED_EMPLOYER_TOTAL);
    expect(result.employeeTotal).toBe(0);
    // Suspended members are skipped.
    const suspended = MEMBERS.filter((m) => m.status === 'suspended');
    expect(result.skipped.filter((s) => s.reason === 'suspended')).toHaveLength(suspended.length);
  });

  it('is idempotent — replaying the same nonce returns the prior result', async () => {
    const a = await svc.submitContributionRun('emp-001', { periodLabel: 'May', method: 'Bank transfer', nonce: 'dup' });
    const b = await svc.submitContributionRun('emp-001', { periodLabel: 'May', method: 'Bank transfer', nonce: 'dup' });
    expect(b.employerTotal).toBe(a.employerTotal);
    expect(b.linesCreated).toBe(a.linesCreated);
  });

  it('getEmployerMetrics reports the single company mode + own/employer totals', async () => {
    const m = await svc.getEmployerMetrics();
    expect(m.headcount).toBe(MEMBERS.length);
    expect(m.active).toBe(ACTIVE.length);
    expect(m.suspended).toBe(MEMBERS.length - ACTIVE.length);
    expect(m.modeSplit).toEqual({ coContribution: MEMBERS.length, employerOnly: 0 });
    expect(m.employerContributions).toBeGreaterThan(0);
    expect(m.ownContributions).toBeGreaterThan(0);
  });
});

// =============================================================================
// Employer invites (KYC onboarding) — 0047 RPC call shapes
// =============================================================================
describe('employer service — invites (real Supabase branch)', () => {
  let svc; let subSvc;
  beforeEach(async () => {
    svc = await import('../employer');
    subSvc = await import('../subscriber');
  });

  it('createEmployerInvite passes p_prefill and returns { token, collectSchedule }', async () => {
    supabaseMock.__queueRpc('create_employer_invite', { data: { token: 'inv-1', collectSchedule: false }, error: null });
    const res = await svc.createEmployerInvite({ fullName: 'Jane Akello', phone: '700100099' });
    expect(res).toEqual({ token: 'inv-1', collectSchedule: false });
    expect(supabaseMock.__getRpcCalls('create_employer_invite').at(-1).args.p_prefill.fullName).toBe('Jane Akello');
  });

  it('listPendingInvites filters employer_invites by employer + pending and maps', async () => {
    supabaseMock.__queueFrom('employer_invites', {
      data: [{ token: 'inv-1', employer_id: 'emp-001', prefill: { fullName: 'Jane' }, collect_schedule: false, status: 'pending' }],
      error: null,
    });
    const rows = await svc.listPendingInvites('emp-001');
    const call = supabaseMock.__getFromCalls('employer_invites').at(-1);
    expect(call.chain.eq).toHaveBeenCalledWith('employer_id', 'emp-001');
    expect(call.chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(rows[0]).toMatchObject({ token: 'inv-1', collectSchedule: false, prefill: { fullName: 'Jane' } });
  });

  it('getEmployerInvite passes p_token', async () => {
    supabaseMock.__queueRpc('get_employer_invite', { data: { employerId: 'emp-001', employerName: 'X', prefill: {}, collectSchedule: true }, error: null });
    const inv = await subSvc.getEmployerInvite('inv-1');
    expect(inv.collectSchedule).toBe(true);
    expect(supabaseMock.__getRpcCalls('get_employer_invite').at(-1).args.p_token).toBe('inv-1');
  });

  it('createFromEmployerInvite passes payload / p_token / p_nonce and wraps the id', async () => {
    supabaseMock.__queueRpc('create_subscriber_from_employer_invite', { data: 's-777', error: null });
    const res = await subSvc.createFromEmployerInvite({ fullName: 'Jane' }, 'inv-1', 'n-1');
    expect(res).toEqual({ subscriberId: 's-777' });
    const call = supabaseMock.__getRpcCalls('create_subscriber_from_employer_invite').at(-1);
    expect(call.args.p_token).toBe('inv-1');
    expect(call.args.p_nonce).toBe('n-1');
    expect(call.args.payload.fullName).toBe('Jane');
  });
});
