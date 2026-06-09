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

  // ─── Seven previously-untested reads/writes (audit §7b.6) ─────────────────

  describe('getEmployer', () => {
    it('selects the employer by id and maps the row', async () => {
      supabaseMock.__queueFrom('employers', {
        data: { id: 'emp-001', name: 'Acme Ltd', sector: 'Manufacturing', registration_no: 'RN-1', district: 'Kampala' },
        error: null,
      });
      const emp = await svc.getEmployer('emp-001');
      expect(supabaseMock.__getFromCalls('employers').at(-1).chain.eq).toHaveBeenCalledWith('id', 'emp-001');
      expect(emp).toMatchObject({ id: 'emp-001', name: 'Acme Ltd', sector: 'Manufacturing', registrationNo: 'RN-1', district: 'Kampala' });
    });

    it('returns null when the row is missing (PGRST116)', async () => {
      supabaseMock.__queueFrom('employers', { data: null, error: { code: 'PGRST116', message: 'no row' } });
      expect(await svc.getEmployer('emp-999')).toBeNull();
    });
  });

  describe('getEmployee', () => {
    it('selects one member, fetches their txn breakdown, and folds own/employer totals', async () => {
      supabaseMock.__queueFrom('subscribers', {
        data: { id: 's-1', employer_id: 'emp-001', name: 'Jane', is_active: true,
          subscriber_balances: { total_balance: 300000 } },
        error: null,
      });
      // fetchMemberBreakdown reads transactions (type=contribution) split by source.
      supabaseMock.__queueFrom('transactions', {
        data: [
          { amount: 100000, source: 'own', type: 'contribution' },
          { amount: 40000, source: 'employer', type: 'contribution' },
        ],
        error: null,
      });
      const member = await svc.getEmployee('s-1');
      expect(supabaseMock.__getFromCalls('subscribers').at(-1).chain.eq).toHaveBeenCalledWith('id', 's-1');
      expect(member).toMatchObject({
        id: 's-1', name: 'Jane', netBalance: 300000,
        ownContributions: 100000, employerContributions: 40000, totalContributions: 140000,
      });
    });

    it('returns null when the member is missing (PGRST116)', async () => {
      supabaseMock.__queueFrom('subscribers', { data: null, error: { code: 'PGRST116', message: 'no row' } });
      expect(await svc.getEmployee('s-999')).toBeNull();
    });

    it('short-circuits with null for a falsy id (no network)', async () => {
      expect(await svc.getEmployee('')).toBeNull();
      expect(supabaseMock.__getFromCalls('subscribers')).toHaveLength(0);
    });
  });

  describe('getContributionRun', () => {
    it('fetches the run header + its lines, attaching the member name to each line', async () => {
      supabaseMock.__queueFrom('contribution_runs', {
        data: { id: 'run-1', employer_id: 'emp-001', period_label: 'May 2026', status: 'completed', grand_total: 700000 },
        error: null,
      });
      supabaseMock.__queueFrom('transactions', {
        data: [{ id: 't-1', subscriber_id: 's-1', amount: 50000, type: 'contribution', source: 'employer',
          contribution_run_id: 'run-1', subscribers: { name: 'Jane' } }],
        error: null,
      });
      const { run, lines } = await svc.getContributionRun('run-1');
      expect(supabaseMock.__getFromCalls('contribution_runs').at(-1).chain.eq).toHaveBeenCalledWith('id', 'run-1');
      expect(supabaseMock.__getFromCalls('transactions').at(-1).chain.eq).toHaveBeenCalledWith('contribution_run_id', 'run-1');
      expect(run).toMatchObject({ id: 'run-1', periodLabel: 'May 2026', grandTotal: 700000 });
      expect(lines[0]).toMatchObject({ id: 't-1', amount: 50000, memberName: 'Jane' });
    });

    it('returns null when the run is missing (PGRST116)', async () => {
      supabaseMock.__queueFrom('contribution_runs', { data: null, error: { code: 'PGRST116', message: 'no row' } });
      expect(await svc.getContributionRun('run-999')).toBeNull();
    });
  });

  describe('getEmployeeContributions', () => {
    it('selects contribution txns for one member newest-first and maps them', async () => {
      supabaseMock.__queueFrom('transactions', {
        data: [{ id: 't-1', subscriber_id: 's-1', amount: 50000, type: 'contribution', source: 'employer', date: '2026-05-01' }],
        error: null,
      });
      const rows = await svc.getEmployeeContributions('s-1');
      const call = supabaseMock.__getFromCalls('transactions').at(-1);
      expect(call.chain.eq).toHaveBeenCalledWith('subscriber_id', 's-1');
      expect(call.chain.eq).toHaveBeenCalledWith('type', 'contribution');
      expect(call.chain.order).toHaveBeenCalledWith('date', { ascending: false });
      expect(rows[0]).toMatchObject({ id: 't-1', amount: 50000, source: 'employer' });
    });

    it('short-circuits with [] for a falsy id (no network)', async () => {
      expect(await svc.getEmployeeContributions('')).toEqual([]);
      expect(supabaseMock.__getFromCalls('transactions')).toHaveLength(0);
    });
  });

  describe('getEmployerLeaderboard', () => {
    it('ranks the employer against the seeded competitor field, flagging "you"', async () => {
      // getContributionRuns → newest run's grandTotal is the employer's monthly total.
      supabaseMock.__queueFrom('contribution_runs', {
        data: [{ id: 'run-1', employer_id: 'emp-001', grand_total: 9_000_000_000, run_at: '2026-05-01' }],
        error: null,
      });
      // getEmployer → company name.
      supabaseMock.__queueFrom('employers', { data: { id: 'emp-001', name: 'Acme Ltd' }, error: null });
      const board = await svc.getEmployerLeaderboard('emp-001');
      expect(Array.isArray(board)).toBe(true);
      // Best-first ranking with consecutive ranks.
      expect(board.map((e) => e.rank)).toEqual(board.map((_, i) => i + 1));
      // A huge grandTotal puts "you" at rank 1.
      const you = board.find((e) => e.isYou);
      expect(you).toBeDefined();
      expect(you.name).toBe('Acme Ltd');
      expect(you.rank).toBe(1);
    });

    it('returns [] for a falsy employerId (no network)', async () => {
      expect(await svc.getEmployerLeaderboard('')).toEqual([]);
    });
  });

  describe('updateEmployerProfile', () => {
    it('passes a profile-only patch (no insurance leg) and maps the returned employer', async () => {
      supabaseMock.__queueRpc('update_employer_profile', {
        data: { id: 'emp-001', name: 'Acme Renamed', sector: 'Tech' }, error: null,
      });
      const emp = await svc.updateEmployerProfile({ name: 'Acme Renamed', sector: 'Tech' });
      expect(emp).toMatchObject({ id: 'emp-001', name: 'Acme Renamed', sector: 'Tech' });
      const call = supabaseMock.__getRpcCalls('update_employer_profile').at(-1);
      expect(call.args.p_patch).toEqual({ name: 'Acme Renamed', sector: 'Tech' });
      // No insurance leg when insuranceEnabled is absent.
      expect('p_insurance_enabled' in call.args).toBe(false);
      expect('p_group_cover' in call.args).toBe(false);
    });

    it('folds the company-wide insurance leg into the same RPC call when insuranceEnabled is present', async () => {
      supabaseMock.__queueRpc('update_employer_profile', { data: { id: 'emp-001', name: 'Acme' }, error: null });
      await svc.updateEmployerProfile({ contactName: 'Sam', insuranceEnabled: true, groupCover: 5000000 });
      const call = supabaseMock.__getRpcCalls('update_employer_profile').at(-1);
      // Insurance control keys are stripped from p_patch and become their own RPC args.
      expect(call.args.p_patch).toEqual({ contactName: 'Sam' });
      expect(call.args.p_insurance_enabled).toBe(true);
      expect(call.args.p_group_cover).toBe(5000000);
    });

    it('throws on RPC error', async () => {
      supabaseMock.__queueRpc('update_employer_profile', { data: null, error: { message: 'permission denied' } });
      await expect(svc.updateEmployerProfile({ name: 'X' })).rejects.toMatchObject({ message: 'permission denied' });
    });
  });

  describe('cancelEmployerInvite', () => {
    it('calls the cancel_employer_invite RPC with p_token', async () => {
      supabaseMock.__queueRpc('cancel_employer_invite', { data: null, error: null });
      await svc.cancelEmployerInvite('inv-1');
      const call = supabaseMock.__getRpcCalls('cancel_employer_invite').at(-1);
      expect(call.args.p_token).toBe('inv-1');
    });

    it('throws on RPC error', async () => {
      supabaseMock.__queueRpc('cancel_employer_invite', { data: null, error: { message: 'not found' } });
      await expect(svc.cancelEmployerInvite('inv-x')).rejects.toMatchObject({ message: 'not found' });
    });
  });

  // ─── Admin-gated employer RPCs (0049) — audit §7b.5 ───────────────────────

  describe('createEmployer (admin) → create_employer RPC', () => {
    it('passes snake_case p_* args and maps the returned employer', async () => {
      supabaseMock.__queueRpc('create_employer', {
        data: { id: 'emp-new-1', name: 'New Co', sector: 'Retail', registration_no: 'RN-9',
          contact_name: 'Pat', contact_phone: '+256700000000', contact_email: 'pat@x.com', district: 'Jinja' },
        error: null,
      });
      const emp = await svc.createEmployer({
        name: 'New Co', sector: 'Retail', registrationNo: 'RN-9',
        contactName: 'Pat', contactPhone: '+256700000000', contactEmail: 'pat@x.com', district: 'Jinja',
      });
      expect(emp).toMatchObject({ id: 'emp-new-1', name: 'New Co', sector: 'Retail', registrationNo: 'RN-9', district: 'Jinja' });
      const call = supabaseMock.__getRpcCalls('create_employer').at(-1);
      expect(call.args).toMatchObject({
        p_name: 'New Co', p_sector: 'Retail', p_registration_no: 'RN-9',
        p_contact_name: 'Pat', p_contact_phone: '+256700000000', p_contact_email: 'pat@x.com',
        p_district: 'Jinja',
      });
    });

    it('defaults optional fields to null / {} when omitted', async () => {
      supabaseMock.__queueRpc('create_employer', { data: { id: 'emp-new-2', name: 'Minimal Co' }, error: null });
      await svc.createEmployer({ name: 'Minimal Co' });
      const call = supabaseMock.__getRpcCalls('create_employer').at(-1);
      expect(call.args.p_sector).toBeNull();
      expect(call.args.p_registration_no).toBeNull();
      expect(call.args.p_payroll_cadence).toBeNull();
      expect(call.args.p_default_contribution_config).toEqual({});
    });

    it('throws when the RPC returns an error (non-admin caller)', async () => {
      supabaseMock.__queueRpc('create_employer', { data: null, error: { code: 'P0001', message: 'admin only' } });
      await expect(svc.createEmployer({ name: 'X' })).rejects.toMatchObject({ code: 'P0001' });
    });
  });

  describe('getAllEmployersMetrics (admin) → get_all_employers_metrics RPC', () => {
    it('calls the no-arg RPC and returns the rows array', async () => {
      const rows = [{ id: 'emp-001', name: 'Acme', headcount: 16, activeCount: 14 }];
      supabaseMock.__queueRpc('get_all_employers_metrics', { data: rows, error: null });
      const result = await svc.getAllEmployersMetrics();
      expect(result).toEqual(rows);
      const calls = supabaseMock.__getRpcCalls('get_all_employers_metrics');
      expect(calls).toHaveLength(1);
      expect(calls[0].args).toBeUndefined();
    });

    it('returns [] when the RPC data is null', async () => {
      supabaseMock.__queueRpc('get_all_employers_metrics', { data: null, error: null });
      expect(await svc.getAllEmployersMetrics()).toEqual([]);
    });

    it('throws on RPC error', async () => {
      supabaseMock.__queueRpc('get_all_employers_metrics', { data: null, error: { code: 'P0001', message: 'admin only' } });
      await expect(svc.getAllEmployersMetrics()).rejects.toMatchObject({ code: 'P0001' });
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
