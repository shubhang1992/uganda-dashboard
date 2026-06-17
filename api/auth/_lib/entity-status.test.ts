// Unit tests for api/auth/_lib/entity-status.ts — the shared deactivation gate
// (H1). Previously covered only transitively via the verify-otp / verify-password
// route tests; this pins the branch matrix directly:
//
//   subscriber / admin  → false WITHOUT any `.from()` DB round-trip (unmapped role)
//   agent/branch/distributor/employer with status 'inactive' → true
//   any non-'inactive' status (e.g. 'active', null, missing)  → false
//   a Supabase lookup error                                   → false (non-fatal)
//   a missing row (demo-fallback id)                          → false (non-fatal)
//
// The query shape (`.from(table).select('status').eq('id', entityId).maybeSingle()`)
// is asserted too, so a refactor that drops the id filter or queries the wrong
// table surfaces. The supabase-admin client is stubbed with a fluent chain whose
// terminal `.maybeSingle()` resolves a canned `{ data, error }` — mirroring the
// personas / claims unit tests.

import { describe, it, expect, vi } from 'vitest';
import { isEntityDeactivated, ACCOUNT_DEACTIVATED_RESPONSE } from './entity-status';
import type { JwtRole } from '../../_lib/jwt.js';

type Canned = { data: unknown; error: unknown };

// Fluent stub: select/eq return `this`; maybeSingle resolves the canned result.
function makeAdmin(result: Canned) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => chain);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, from, chain };
}

describe('isEntityDeactivated — unmapped roles short-circuit (no DB round-trip)', () => {
  it.each(['subscriber', 'admin'] as const)(
    'returns false for %s WITHOUT calling .from()',
    async (role) => {
      const { client, from } = makeAdmin({ data: { status: 'inactive' }, error: null });
      expect(await isEntityDeactivated(client, role as JwtRole, 'x-001')).toBe(false);
      // The deliberate short-circuit: never touch the DB for ungated roles, even
      // if a (hypothetical) row would say 'inactive'.
      expect(from).not.toHaveBeenCalled();
    },
  );
});

describe('isEntityDeactivated — gated roles, status matrix', () => {
  const ROLES: JwtRole[] = ['agent', 'branch', 'distributor', 'employer'];
  const TABLE: Record<string, string> = {
    agent: 'agents', branch: 'branches', distributor: 'distributors', employer: 'employers',
  };

  it.each(ROLES)('returns true when %s status is exactly "inactive"', async (role) => {
    const { client, from, chain } = makeAdmin({ data: { status: 'inactive' }, error: null });
    expect(await isEntityDeactivated(client, role, 'e-001')).toBe(true);
    // Query shape: the role's table, selecting status, filtered by id, single row.
    expect(from).toHaveBeenCalledWith(TABLE[role]);
    expect(chain.select).toHaveBeenCalledWith('status');
    expect(chain.eq).toHaveBeenCalledWith('id', 'e-001');
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it.each(['active', 'pending', '', null, undefined] as const)(
    'returns false for any non-"inactive" status (%s)',
    async (status) => {
      const { client } = makeAdmin({ data: { status }, error: null });
      expect(await isEntityDeactivated(client, 'agent', 'a-001')).toBe(false);
    },
  );

  it('returns false when the row has no status field at all', async () => {
    const { client } = makeAdmin({ data: { id: 'd-001' }, error: null });
    expect(await isEntityDeactivated(client, 'distributor', 'd-001')).toBe(false);
  });
});

describe('isEntityDeactivated — non-fatal lookup failures never gate login', () => {
  it('returns false on a Supabase error (even if data would be inactive)', async () => {
    const { client } = makeAdmin({ data: { status: 'inactive' }, error: { message: 'boom' } });
    expect(await isEntityDeactivated(client, 'branch', 'b-kam-015')).toBe(false);
  });

  it('returns false on a missing row (demo-fallback id with no entity row)', async () => {
    const { client } = makeAdmin({ data: null, error: null });
    expect(await isEntityDeactivated(client, 'employer', 'emp-001')).toBe(false);
  });
});

describe('ACCOUNT_DEACTIVATED_RESPONSE', () => {
  it('exposes the stable 403 body the auth routes return', () => {
    expect(ACCOUNT_DEACTIVATED_RESPONSE.code).toBe('account_deactivated');
    expect(ACCOUNT_DEACTIVATED_RESPONSE.message).toMatch(/deactivated/i);
  });
});
