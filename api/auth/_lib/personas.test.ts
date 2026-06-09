// Unit tests for api/auth/_lib/personas.ts (B8, B9, D18).
//
// `ROLE_DEFAULTS`, `resolveSubscriber`, and `resolveDemoPersona` translate a
// phone + app role into a stable, role-scoped entity ID so verify-otp.ts and
// verify-password.ts mint byte-identical claims. The demo promise (CLAUDE.md §8)
// is that EVERY demo login succeeds — an unrecognised phone falls back to the
// seeded `ROLE_DEFAULTS[role]` id rather than failing.
//
// These pin: (1) the full `ROLE_DEFAULTS` table incl. the `admin: 'admin-001'`
// fallback that no test asserted before (audit §7b.4); (2) `resolveSubscriber`
// returns the newest matching row, null on miss, null on DB error; (3)
// `resolveDemoPersona` returns the matched row, falls back to ROLE_DEFAULTS on
// miss, and STILL falls back (never throws) when the lookup errors.
//
// The Supabase admin client is stubbed with a fluent chain whose terminal
// `.maybeSingle()` resolves to a per-call canned `{ data, error }` — this also
// lets us assert the query shape (eq filters, the newest-first ORDER BY).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ROLE_DEFAULTS,
  resolveSubscriber,
  resolveDemoPersona,
} from './personas';

// ---------------------------------------------------------------------------
// Fluent query-builder stub. Each method records its call and returns `this`;
// `.maybeSingle()` resolves to the canned result the test passed in.
// ---------------------------------------------------------------------------

type Canned = { data: unknown; error: unknown };

function makeAdmin(result: Canned) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => chain);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, from, chain };
}

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // personas.ts logs DB errors as non-fatal — silence + capture them.
  warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ROLE_DEFAULTS', () => {
  it('maps every app role to its seeded fallback id (incl. admin → admin-001)', () => {
    expect(ROLE_DEFAULTS).toEqual({
      subscriber: 's-0001',
      agent: 'a-001',
      branch: 'b-kam-015',
      distributor: 'd-001',
      employer: 'emp-001',
      admin: 'admin-001',
    });
  });
});

describe('resolveSubscriber', () => {
  it('returns the matched row mapped to { entityId, name }', async () => {
    const { client, from, chain } = makeAdmin({
      data: { id: 's-0007', name: 'Brian Okello' }, error: null,
    });
    const res = await resolveSubscriber(client, '+256777247884');
    expect(res).toEqual({ entityId: 's-0007', name: 'Brian Okello' });
    expect(from).toHaveBeenCalledWith('subscribers');
    expect(chain.eq).toHaveBeenCalledWith('phone', '+256777247884');
    // Newest-wins: ORDER BY created_at DESC then LIMIT 1.
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('returns null when no row matches', async () => {
    const { client } = makeAdmin({ data: null, error: null });
    expect(await resolveSubscriber(client, '+256711000099')).toBeNull();
  });

  it('returns null (non-fatal) when the lookup errors and logs it', async () => {
    const { client } = makeAdmin({ data: null, error: { message: 'boom' } });
    expect(await resolveSubscriber(client, '+256711000099')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('coerces a null name to undefined on a matched row', async () => {
    const { client } = makeAdmin({ data: { id: 's-0001', name: null }, error: null });
    const res = await resolveSubscriber(client, '+256700000000');
    expect(res).toEqual({ entityId: 's-0001', name: undefined });
  });
});

describe('resolveDemoPersona', () => {
  it('returns the matched demo_personas row mapped to { entityId, name }', async () => {
    const { client, from, chain } = makeAdmin({
      data: { entity_id: 'a-042', label: 'Alice Field-Agent' }, error: null,
    });
    const res = await resolveDemoPersona(client, '+256777247884', 'agent');
    expect(res).toEqual({ entityId: 'a-042', name: 'Alice Field-Agent' });
    expect(from).toHaveBeenCalledWith('demo_personas');
    expect(chain.eq).toHaveBeenCalledWith('phone', '+256777247884');
    expect(chain.eq).toHaveBeenCalledWith('role', 'agent');
  });

  it.each(['agent', 'branch', 'distributor', 'employer', 'admin'] as const)(
    'falls back to ROLE_DEFAULTS.%s when no row matches', async (role) => {
      const { client } = makeAdmin({ data: null, error: null });
      const res = await resolveDemoPersona(client, '+256711000099', role);
      expect(res).toEqual({ entityId: ROLE_DEFAULTS[role] });
    },
  );

  it('admin miss resolves to admin-001 specifically (regression: never asserted before)', async () => {
    const { client } = makeAdmin({ data: null, error: null });
    expect(await resolveDemoPersona(client, '+256700000031', 'admin')).toEqual({ entityId: 'admin-001' });
  });

  it('STILL falls back (never throws) when the lookup errors, and logs it', async () => {
    const { client } = makeAdmin({ data: null, error: { message: 'db down' } });
    const res = await resolveDemoPersona(client, '+256700000000', 'branch');
    expect(res).toEqual({ entityId: ROLE_DEFAULTS.branch });
    expect(warnSpy).toHaveBeenCalled();
  });
});
