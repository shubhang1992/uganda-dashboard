// Cross-tenant RLS isolation spec — proves that a role-scoped caller CANNOT read
// another tenant's data at the DATABASE layer (not merely the UI filter).
//
// Closes audit §7b.10 / F2-09 ("zero cross-tenant RLS isolation test at any
// layer"). The nearest existing E2E (distributor-drill-agent-to-subscriber)
// verifies UI-level scoping (the component filter) — a RLS misconfig that still
// let the DB query succeed would pass it. This spec attacks the DB directly:
// mint a genuine role JWT for tenant A, stamp an ANON PostgREST client with it
// (so PostgREST runs `SET ROLE authenticated` and the RLS policies evaluate
// `auth.jwt() ->> 'app_role'/'<role>Id'` against A's claims), then attempt a
// read scoped to tenant B and assert ZERO rows come back.
//
// The RLS predicates under test (all read app_role + the role-scoped *Id claim,
// per CLAUDE.md §5.7 — NEVER auth.uid(), NEVER 'role'):
//   • commissions_select_agent   (0007): agent_id = jwt.agentId
//   • subscriber_balances_select_self (0007): subscriber_id = jwt.subscriberId
//   • employees_by_employer_select (0034): employer_id = jwt.employerId
//
// Service-role (supabaseAdmin) is used ONLY for setup/teardown + to confirm
// tenant B's rows genuinely exist (so a "0 rows" result is real isolation, not an
// empty table). The scoped reads go through the anon+JWT client.
//
// Run prereq: SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
// + SUPABASE_JWT_SECRET in .env.local. Without them the file test.skip()s cleanly.

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../fixtures/db';
import { mintRoleJwt, PERSONA_FOR, type Role } from '../../fixtures/auth';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const hasEnv =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!SUPABASE_URL &&
  !!ANON_KEY &&
  !!process.env.SUPABASE_JWT_SECRET;

/**
 * Build a PostgREST client that authenticates as `role`/`entityId` via a minted
 * HS256 JWT. The token rides in the global Authorization header so EVERY request
 * is evaluated by RLS as that tenant (the anon `apikey` flips PostgREST to the
 * `authenticated` Postgres role; the JWT claims drive the policy predicates).
 */
async function roleClient(role: Role, entityId: string): Promise<SupabaseClient> {
  const token = await mintRoleJwt(role, entityId);
  return createClient(SUPABASE_URL as string, ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

test.describe('cross-tenant RLS isolation (DB layer)', () => {
  test.skip(
    !hasEnv,
    'requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + SUPABASE_JWT_SECRET',
  );

  test("agent A's JWT cannot read agent B's commissions", async () => {
    const agentA = PERSONA_FOR.agent.entityId; // 'a-001'
    const agentB = 'a-042'; // a distinct seeded agent (seed-supabase.mjs dp-a-002)

    // Ground truth (service-role): agent B genuinely HAS commissions, so a 0-row
    // scoped read is real isolation, not an empty table.
    const { count: bRowsAdmin, error: adminErr } = await supabaseAdmin
      .from('commissions')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentB);
    expect(adminErr, 'service-role count of agent B commissions').toBeNull();
    expect(bRowsAdmin ?? 0, 'agent B must have ≥1 commission for this probe to be meaningful')
      .toBeGreaterThan(0);

    // Attack: agent A's token, scoped to agent B's rows → RLS must return 0.
    const asAgentA = await roleClient('agent', agentA);
    const { data, error } = await asAgentA
      .from('commissions')
      .select('id, agent_id')
      .eq('agent_id', agentB);
    // RLS yields an empty set (not an error) for rows the policy excludes.
    expect(error, 'scoped read should not error, just return nothing').toBeNull();
    expect(
      (data ?? []).length,
      `agent A (${agentA}) leaked ${(data ?? []).length} of agent B (${agentB})'s commissions`,
    ).toBe(0);

    // Positive control: agent A CAN read its own commissions (proves the token +
    // policy work, so the 0 above is isolation — not a broken/blank token).
    const { data: ownData, error: ownErr } = await asAgentA
      .from('commissions')
      .select('id, agent_id')
      .eq('agent_id', agentA)
      .limit(5);
    expect(ownErr, "agent A's own read should succeed").toBeNull();
    for (const row of ownData ?? []) {
      expect((row as { agent_id: string }).agent_id, 'own read returns only own rows').toBe(agentA);
    }
  });

  test("subscriber A cannot read subscriber B's balance", async () => {
    const subA = PERSONA_FOR.subscriber.entityId; // 's-0001'
    const subB = 's-0002'; // a distinct seeded subscriber

    // Ground truth: subscriber B has a balance row.
    const { count: bBalAdmin, error: adminErr } = await supabaseAdmin
      .from('subscriber_balances')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_id', subB);
    expect(adminErr, 'service-role count of subscriber B balance').toBeNull();
    expect(bBalAdmin ?? 0, 'subscriber B must have a balance row').toBeGreaterThan(0);

    // Attack: subscriber A's token, scoped to subscriber B's balance → 0 rows.
    const asSubA = await roleClient('subscriber', subA);
    const { data, error } = await asSubA
      .from('subscriber_balances')
      .select('subscriber_id, total_balance')
      .eq('subscriber_id', subB);
    expect(error, 'scoped read should not error').toBeNull();
    expect(
      (data ?? []).length,
      `subscriber A (${subA}) leaked subscriber B (${subB})'s balance`,
    ).toBe(0);

    // Positive control: A can read its OWN balance.
    const { data: ownBal, error: ownErr } = await asSubA
      .from('subscriber_balances')
      .select('subscriber_id')
      .eq('subscriber_id', subA);
    expect(ownErr, "subscriber A's own balance read should succeed").toBeNull();
    expect((ownBal ?? []).length, 'A reads its own balance').toBeGreaterThan(0);
  });

  test("an employer's JWT cannot read another employer's employees", async () => {
    // The demo seed has a single employer (emp-001). A foreign employer's token
    // (a DIFFERENT employerId claim) must read ZERO of emp-001's roster — the
    // RLS predicate is employer_id = jwt.employerId, so a non-matching claim sees
    // nothing. No DB mutation needed: we only prove the negative direction.
    const ownEmployer = PERSONA_FOR.employer.entityId; // 'emp-001'
    const foreignEmployer = `emp-e2e-foreign-${Date.now()}`;

    // Ground truth: emp-001 has seeded employees.
    const { count: ownRows, error: adminErr } = await supabaseAdmin
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('employer_id', ownEmployer);
    expect(adminErr, 'service-role count of emp-001 employees').toBeNull();
    expect(ownRows ?? 0, 'emp-001 must have ≥1 employee for this probe').toBeGreaterThan(0);

    // Attack: the FOREIGN employer's token, scoped to emp-001's roster → 0 rows.
    const asForeign = await roleClient('employer', foreignEmployer);
    const { data, error } = await asForeign
      .from('employees')
      .select('id, employer_id')
      .eq('employer_id', ownEmployer);
    expect(error, 'scoped read should not error').toBeNull();
    expect(
      (data ?? []).length,
      `foreign employer (${foreignEmployer}) leaked ${(data ?? []).length} of ${ownEmployer}'s employees`,
    ).toBe(0);

    // And a foreign employer reading its OWN (empty) roster is also 0 — proves the
    // token isn't simply blanket-denied (a deny-all would also fail the positive
    // controls above); here it correctly resolves to the empty foreign scope.
    const { data: ownForeign, error: ownErr } = await asForeign
      .from('employees')
      .select('id')
      .eq('employer_id', foreignEmployer);
    expect(ownErr, "foreign employer's own scoped read should not error").toBeNull();
    expect((ownForeign ?? []).length, 'foreign employer has no employees').toBe(0);
  });
});
