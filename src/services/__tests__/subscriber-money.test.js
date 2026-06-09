// subscriber money-RPC tests — covers the 0054 idempotent + atomic refactor of
// the subscriber Save (top-up) and Withdraw flows (audit §4a F-1/F-2/F-3/F-5).
//
// The live (Supabase-enabled) path of makeAdHocContribution / requestWithdrawal
// now routes through the make_contribution / request_withdrawal SECURITY DEFINER
// RPCs instead of writing `transactions` (and `withdrawals`) directly. These
// RPCs are DORMANT on live (PGRST202/404) until 0054 is applied at the G-DB
// gate, so we mock supabase.rpc and assert call args / nonce stability — never
// hitting a real DB.
//
// What we assert:
//   * the page-minted nonce is threaded into the RPC as p_nonce;
//   * a RETRY with the SAME nonce reuses that nonce (the server collapses the
//     duplicate — the JS just has to pass a stable key);
//   * NO direct .from('transactions').insert / .from('withdrawals').insert
//     remains in the two refactored functions' live path.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';

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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('subscriber money RPCs — make_contribution (live path)', () => {
  let svc;
  beforeEach(async () => {
    svc = await import('../subscriber');
  });

  it('routes a one-off contribution through make_contribution with the passed nonce', async () => {
    supabaseMock.__queueRpc('make_contribution', {
      data: { id: 't-1', subscriberId: 's-1', type: 'contribution', amount: 25000, status: 'settled', reference: 'CT-123456' },
      error: null,
    });
    const tx = await svc.makeAdHocContribution('s-1', {
      amount: 25000,
      retirementPct: 70,
      method: 'Airtel Money',
      nonce: 'fixed-nonce-aaa',
    });

    // Returns the RPC's row shape verbatim (already camelCase from the RPC).
    expect(tx).toMatchObject({ id: 't-1', amount: 25000, reference: 'CT-123456' });

    const call = supabaseMock.__getRpcCalls('make_contribution').at(-1);
    expect(call.args).toMatchObject({
      p_nonce: 'fixed-nonce-aaa',
      p_amount: 25000,
      p_retirement_pct: 70,
      p_method: 'Airtel Money',
    });

    // No direct ledger write remains in the live contribution path.
    expect(supabaseMock.__getFromCalls('transactions')).toHaveLength(0);
  });

  it('reuses the SAME nonce across a retry (idempotency key is stable)', async () => {
    // Two attempts with the same page-minted nonce — e.g. the first timed out
    // and the operator retried. The RPC collapses the duplicate server-side; the
    // JS contract is simply that it passes the identical nonce both times.
    supabaseMock.__queueRpc('make_contribution', {
      data: { id: 't-1', amount: 10000, reference: 'CT-1' }, error: null,
    });
    supabaseMock.__queueRpc('make_contribution', {
      // Idempotent replay returns the ORIGINAL row (same id/reference).
      data: { id: 't-1', amount: 10000, reference: 'CT-1' }, error: null,
    });

    const payload = { amount: 10000, nonce: 'retry-nonce-bbb' };
    await svc.makeAdHocContribution('s-1', payload);
    await svc.makeAdHocContribution('s-1', payload);

    const calls = supabaseMock.__getRpcCalls('make_contribution');
    expect(calls).toHaveLength(2);
    expect(calls[0].args.p_nonce).toBe('retry-nonce-bbb');
    expect(calls[1].args.p_nonce).toBe('retry-nonce-bbb');
  });

  it('mints a fresh nonce when the caller omits one (still always keyed)', async () => {
    supabaseMock.__queueRpc('make_contribution', { data: { id: 't-1' }, error: null });
    await svc.makeAdHocContribution('s-1', { amount: 5000 });
    const call = supabaseMock.__getRpcCalls('make_contribution').at(-1);
    expect(typeof call.args.p_nonce).toBe('string');
    expect(call.args.p_nonce.length).toBeGreaterThan(0);
  });

  it('propagates an RPC error (e.g. server-side validation)', async () => {
    supabaseMock.__queueRpc('make_contribution', {
      data: null,
      error: { message: 'amount must be positive' },
    });
    await expect(
      svc.makeAdHocContribution('s-1', { amount: 25000, nonce: 'n' }),
    ).rejects.toMatchObject({ message: 'amount must be positive' });
  });
});

describe('subscriber money RPCs — request_withdrawal (live path)', () => {
  let svc;
  beforeEach(async () => {
    svc = await import('../subscriber');
  });

  it('routes a withdrawal through request_withdrawal with the passed nonce — single atomic call', async () => {
    supabaseMock.__queueRpc('request_withdrawal', {
      data: { id: 'w-1', amount: 40000, bucket: 'emergency', reason: 'Medical', method: 'MTN Mobile Money', status: 'processing', date: '2026-05-26', reference: 'WD-7' },
      error: null,
    });
    const wd = await svc.requestWithdrawal('s-1', {
      amount: 40000,
      bucket: 'emergency',
      reason: 'Medical',
      method: 'MTN Mobile Money',
      nonce: 'fixed-wd-nonce-aaa',
    });

    expect(wd).toMatchObject({ id: 'w-1', amount: 40000, bucket: 'emergency', reference: 'WD-7' });

    const call = supabaseMock.__getRpcCalls('request_withdrawal').at(-1);
    expect(call.args).toMatchObject({
      p_nonce: 'fixed-wd-nonce-aaa',
      p_amount: 40000,
      p_bucket: 'emergency',
      p_reason: 'Medical',
      p_method: 'MTN Mobile Money',
    });

    // F-2: the two former inserts are now ONE atomic RPC — neither table is
    // written directly from the client.
    expect(supabaseMock.__getFromCalls('transactions')).toHaveLength(0);
    expect(supabaseMock.__getFromCalls('withdrawals')).toHaveLength(0);
  });

  it('reuses the SAME nonce across a retry', async () => {
    supabaseMock.__queueRpc('request_withdrawal', {
      data: { id: 'w-1', amount: 20000, bucket: 'emergency', reference: 'WD-1' }, error: null,
    });
    supabaseMock.__queueRpc('request_withdrawal', {
      data: { id: 'w-1', amount: 20000, bucket: 'emergency', reference: 'WD-1' }, error: null,
    });

    const payload = { amount: 20000, bucket: 'emergency', reason: 'Medical', nonce: 'retry-wd-nonce-bbb' };
    await svc.requestWithdrawal('s-1', payload);
    await svc.requestWithdrawal('s-1', payload);

    const calls = supabaseMock.__getRpcCalls('request_withdrawal');
    expect(calls).toHaveLength(2);
    expect(calls[0].args.p_nonce).toBe('retry-wd-nonce-bbb');
    expect(calls[1].args.p_nonce).toBe('retry-wd-nonce-bbb');
  });

  it('threads explicit splits through to the RPC for server-side validation (F-5)', async () => {
    supabaseMock.__queueRpc('request_withdrawal', {
      data: { id: 'w-1', amount: 30000, bucket: 'retirement', reference: 'WD-2' }, error: null,
    });
    await svc.requestWithdrawal('s-1', {
      amount: 30000,
      splitRetirement: 30000,
      splitEmergency: 0,
      nonce: 'wd-split-nonce',
    });
    const call = supabaseMock.__getRpcCalls('request_withdrawal').at(-1);
    expect(call.args.p_split_retirement).toBe(30000);
    expect(call.args.p_split_emergency).toBe(0);
  });

  it('propagates an over-balance RPC error (F-5 server-side guard)', async () => {
    supabaseMock.__queueRpc('request_withdrawal', {
      data: null,
      error: { message: 'withdrawal of 999999 exceeds available balance 1000' },
    });
    await expect(
      svc.requestWithdrawal('s-1', { amount: 999999, bucket: 'emergency', nonce: 'n' }),
    ).rejects.toMatchObject({ message: /exceeds available balance/ });
  });
});
