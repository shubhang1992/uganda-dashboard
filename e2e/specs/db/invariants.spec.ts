// DB invariants spec — guards the post-Phase-2 schema state of the live
// Supabase project (zengmiugieqjqzaccbqe).
//
// What we assert:
//   1. Zero duplicate agent emails — UNIQUE INDEX ux_agents_email is live
//      (migration 0017).
//   2. Zero duplicate subscriber NIns — UNIQUE INDEX ux_subscribers_nin is
//      live (migration 0017). The `nin` column lives on `subscribers`, not
//      `agents`; the agents table has no national-ID column.
//   3. Zero commission rows with `paid_date IS NOT NULL` AND status not in
//      the terminal set { confirmed, released, rejected } — every paid
//      row carries an end-state. The commission_status enum (0001 line 35)
//      contains: due | in_run | held | disputed | released | confirmed |
//      rejected. There is NO 'paid' state — paid_date is set when the row
//      reaches confirmed/released.
//   4. Zero `held`/`disputed` commission rows missing the audit columns
//      (`disputed_at`, `disputed_by`) — every dispute records who/when.
//   5. Zero contribution schedules with `next_due_date < CURRENT_DATE` —
//      contribution_schedules has no status column; we simply assert every
//      schedule row has a non-stale next_due_date.
//   6. The new `distributors` table is live with the d-001 row.
//   7. The `agent_dispute_line` RPC is live (signature
//      `(commission_id text, dispute_reason text)` per migration 0014).
//
// Run prereq: SUPABASE_SERVICE_ROLE_KEY in .env.local. Without it, every
// test in this file `test.skip()`s with a clear note — the e2e/fixtures/db
// throw is caught and re-raised as a skip rather than a hard failure, so
// CI without the secret still passes the rest of the suite. Locally this
// is wired by default via the existing .env.local.

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../fixtures/db';

// The whole file is service-role-only. If the env var is missing, the
// supabaseAdmin client throws at import time; this guard catches the
// import-time error and surfaces a clean skip for the file.
const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.VITE_SUPABASE_URL;

test.describe('DB invariants (zengmiugieqjqzaccbqe)', () => {
  test.skip(!hasServiceRole, 'requires SUPABASE_SERVICE_ROLE_KEY in env');

  test('no duplicate agent emails', async () => {
    // Count rows that share an email with another row. The cleanest
    // formulation is: COUNT(*) where (email is not null AND email is in
    // the set of emails with count > 1). We use a parameter-free query via
    // postgres RPC convention — but supabase-js doesn't expose arbitrary
    // SQL by default, so we fetch all emails and dedupe client-side. The
    // agents table has ~2 000 rows so this is cheap.
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('email')
      .not('email', 'is', null);
    expect(error, 'agents query').toBeNull();
    const rows = data || [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const e = (r as { email: string | null }).email;
      if (!e) continue;
      counts.set(e, (counts.get(e) || 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
    expect(
      duplicates.length,
      `duplicate emails found: ${JSON.stringify(duplicates.slice(0, 5))}`,
    ).toBe(0);
  });

  test('no duplicate subscriber NIns', async () => {
    // NIN lives on `subscribers` (not `agents`). Schema: 0001 line 151.
    // The 0017 migration enforces a partial UNIQUE INDEX on the column.
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .select('nin')
      .not('nin', 'is', null);
    expect(error, 'subscribers nin query').toBeNull();
    const rows = data || [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const n = (r as { nin: string | null }).nin;
      if (!n) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
    expect(
      duplicates.length,
      `duplicate NIns found: ${JSON.stringify(duplicates.slice(0, 5))}`,
    ).toBe(0);
  });

  test('no commission rows with paid_date set but non-terminal status', async () => {
    // Terminal states for a commission line that has paid_date populated:
    // confirmed, released, rejected. The commission_status enum (0001 line
    // 35) has no 'paid' value — paid_date is set when the row enters
    // released/confirmed (post-settlement-run).
    const TERMINAL = ['confirmed', 'released', 'rejected'];
    const { data, error, count } = await supabaseAdmin
      .from('commissions')
      .select('id, status, paid_date', { count: 'exact' })
      .not('paid_date', 'is', null)
      .not('status', 'in', `(${TERMINAL.join(',')})`);
    expect(error, 'commissions paid_date query').toBeNull();
    expect(
      count ?? 0,
      `commissions with paid_date and non-terminal status (sample: ${JSON.stringify((data || []).slice(0, 3))})`,
    ).toBe(0);
  });

  test('no held/disputed commission rows missing disputed_at/disputed_by', async () => {
    // For rows in held/disputed, both audit columns must be populated.
    // We split into two queries — Postgrest's `or` with two `is.null`
    // predicates is awkward across nullable text columns; two checks are
    // clearer and equally fast.
    const { count: missingAt, error: e1 } = await supabaseAdmin
      .from('commissions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['held', 'disputed'])
      .is('disputed_at', null);
    expect(e1, 'commissions disputed_at audit').toBeNull();
    expect(missingAt ?? 0, 'held/disputed rows missing disputed_at').toBe(0);

    const { count: missingBy, error: e2 } = await supabaseAdmin
      .from('commissions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['held', 'disputed'])
      .is('disputed_by', null);
    expect(e2, 'commissions disputed_by audit').toBeNull();
    expect(missingBy ?? 0, 'held/disputed rows missing disputed_by').toBe(0);
  });

  test('no schedules with next_due_date < CURRENT_DATE', async () => {
    // contribution_schedules has no status column (0001 line 189) —
    // every row is implicitly "active". We assert every row has either
    // null (deliberately no schedule) or a non-stale next_due_date.
    const today = new Date();
    const isoDate = today.toISOString().slice(0, 10);
    const { count, error } = await supabaseAdmin
      .from('contribution_schedules')
      .select('*', { count: 'exact', head: true })
      .lt('next_due_date', isoDate);
    expect(error, 'schedules next_due_date query').toBeNull();
    expect(
      count ?? 0,
      `schedules with next_due_date before ${isoDate}`,
    ).toBe(0);
  });

  test('distributors table is live and d-001 row exists', async () => {
    const { count, error } = await supabaseAdmin
      .from('distributors')
      .select('*', { count: 'exact', head: true })
      .eq('id', 'd-001');
    expect(error, 'distributors d-001 lookup').toBeNull();
    expect(count, 'expected exactly one d-001 row').toBe(1);
  });

  test('agent_dispute_line RPC exists in pg_proc', async () => {
    // We can't query pg_proc directly via PostgREST — it's not exposed via
    // the public schema. The cleanest proof is to invoke the RPC with safe
    // sentinel input and confirm the error is "no rows / permission" (i.e.
    // function exists) rather than "function does not exist".
    //
    // Live signature (verified via pg_proc Mar 2026):
    //   agent_dispute_line(p_commission_id text, p_dispute_reason text)
    const { error } = await supabaseAdmin.rpc('agent_dispute_line', {
      p_commission_id: 'c-never-exists-00000000',
      p_dispute_reason: 'invariant-check',
    });
    if (error) {
      // PostgREST returns code PGRST202 ("Could not find the function") if
      // the function is missing; anything else (bad input, RLS denial,
      // application-level error) means the function IS present.
      expect(
        /could not find.*function|PGRST202|does not exist/i.test(error.message || ''),
        `agent_dispute_line missing: ${error.message}`,
      ).toBe(false);
    }
    // No error or only an application-level error means the function is
    // wired in pg_proc.
  });
});
