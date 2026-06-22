// E2E Supabase admin client + DB verification helpers.
//
// !!! SECURITY !!! ----------------------------------------------------------
// This file uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS. It MUST be
// imported ONLY from Node-side Playwright fixtures and spec files — never
// from code that runs inside `page.evaluate(...)` or any browser context.
// Specs themselves run in Node, so importing this module at the top of a
// spec is safe. Do NOT pass the client (or its results) into a browser
// callback in a way that exposes the key.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

let cachedClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error('VITE_SUPABASE_URL is required for E2E DB verification. Check .env.local.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for E2E DB verification. Check .env.local.');
  }
  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export const supabaseAdmin = getAdminClient();

/**
 * Returns the count of rows matching `where`. Canonical implementation —
 * `rowExists` is a thin boolean wrapper over this. Uses PostgREST
 * `count: 'exact', head: true` so no rows travel over the wire (the
 * `Content-Range` header carries the count).
 */
export async function countWhere(table: string, where: Record<string, unknown>): Promise<number> {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(where)) {
    query = query.eq(k, v as never);
  }
  const { count, error } = await query;
  if (error) throw new Error(`countWhere ${table}: ${error.message}`);
  return count ?? 0;
}

/** Returns true if at least one row matches `where`. Wraps `countWhere`. */
export async function rowExists(table: string, where: Record<string, unknown>): Promise<boolean> {
  return (await countWhere(table, where)) > 0;
}

/** Returns the first row matching `where`, or null. */
export async function getRow<T = Record<string, unknown>>(
  table: string,
  where: Record<string, unknown>,
): Promise<T | null> {
  let query = supabaseAdmin.from(table).select('*');
  for (const [k, v] of Object.entries(where)) {
    query = query.eq(k, v as never);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(`getRow ${table}: ${error.message}`);
  return data as T | null;
}

/**
 * Canonical list of subscriber-FK child tables in the schema. Sourced from
 * `supabase/migrations/0001_initial_schema.sql` — every table with a
 * `subscriber_id ... REFERENCES subscribers(id)` clause appears here.
 *
 * Order is deletion-safe (no inter-child FK dependencies among these), and
 * the same list drives both `cleanupSubscriberByPhone` and
 * `assertNoSubscriberOrphans` so the cleanup contract and the orphan probe
 * stay in lockstep.
 */
export const SUBSCRIBER_CHILD_TABLES = [
  'transactions',
  'nominees',
  'subscriber_balances',
  'contribution_schedules',
  'insurance_policies',
  'subscriber_insurance_products',
  'claims',
  'withdrawals',
  'commissions',
] as const;

/**
 * Deletes any subscriber rows matching `phone`, walking every subscriber-FK
 * child table first so FK constraints don't bite and so no orphan rows are
 * left behind even if `ON DELETE CASCADE` is dropped on a future migration.
 * Use in afterEach for signup flow specs that create real DB rows.
 *
 * Returns the number of subscriber rows deleted.
 */
export async function cleanupSubscriberByPhone(phone: string): Promise<number> {
  const { data: subs, error: subErr } = await supabaseAdmin
    .from('subscribers')
    .select('id')
    .eq('phone', phone);
  if (subErr) throw new Error(`cleanup: subscriber lookup for ${phone}: ${subErr.message}`);
  if (!subs || subs.length === 0) return 0;

  const ids = subs.map((s) => (s as { id: string }).id);
  // Delete child rows first to respect FK constraints AND to guarantee no
  // orphans linger if cascades are removed on a future migration. Every
  // subscriber-FK child table from the schema appears in
  // SUBSCRIBER_CHILD_TABLES — keep that list authoritative.
  for (const table of SUBSCRIBER_CHILD_TABLES) {
    const { error: childErr } = await supabaseAdmin
      .from(table)
      .delete()
      .in('subscriber_id', ids);
    if (childErr) {
      throw new Error(`cleanup: child delete on ${table}: ${childErr.message}`);
    }
  }
  const { error: delErr } = await supabaseAdmin.from('subscribers').delete().in('id', ids);
  if (delErr) throw new Error(`cleanup: subscriber delete: ${delErr.message}`);
  return ids.length;
}

/**
 * Post-suite probe: walks every subscriber-FK child table and asserts that
 * no row references a `subscriber_id` that no longer exists in `subscribers`.
 * Throws with a clear message naming each offending table + the orphan count
 * if any orphans are found.
 *
 * Intended for use after the E2E suite (or per-spec, defensively) to catch
 * cleanup regressions before they accumulate across runs.
 *
 * Each child table is queried explicitly (rather than via the
 * SUBSCRIBER_CHILD_TABLES loop) so that grep audits + per-table error
 * messages name the exact offending source without indirection.
 */
export async function assertNoSubscriberOrphans(): Promise<void> {
  // Fetch the full set of live subscriber IDs once. The seeded demo table
  // is ~30k rows so this is bounded and cheap relative to per-table joins.
  const { data: subRows, error: subErr } = await supabaseAdmin
    .from('subscribers')
    .select('id');
  if (subErr) {
    throw new Error(`assertNoSubscriberOrphans: subscribers lookup: ${subErr.message}`);
  }
  const liveIds = new Set((subRows ?? []).map((r) => (r as { id: string }).id));

  const offenders: { table: string; orphanCount: number; sampleIds: string[] }[] = [];

  async function probe(table: string, rows: { subscriber_id: string }[] | null) {
    const orphans = (rows ?? [])
      .map((r) => r.subscriber_id)
      .filter((id) => !liveIds.has(id));
    if (orphans.length > 0) {
      offenders.push({
        table,
        orphanCount: orphans.length,
        sampleIds: Array.from(new Set(orphans)).slice(0, 5),
      });
    }
  }

  // Explicit per-table probes — each `from(...)` literal documents the
  // child-table contract and keeps grep-based audits straightforward.
  const transactionsRes = await supabaseAdmin.from('transactions').select('subscriber_id');
  if (transactionsRes.error) {
    throw new Error(`assertNoSubscriberOrphans: transactions scan: ${transactionsRes.error.message}`);
  }
  await probe('transactions', transactionsRes.data as { subscriber_id: string }[] | null);

  const nomineesRes = await supabaseAdmin.from('nominees').select('subscriber_id');
  if (nomineesRes.error) {
    throw new Error(`assertNoSubscriberOrphans: nominees scan: ${nomineesRes.error.message}`);
  }
  await probe('nominees', nomineesRes.data as { subscriber_id: string }[] | null);

  const balancesRes = await supabaseAdmin.from('subscriber_balances').select('subscriber_id');
  if (balancesRes.error) {
    throw new Error(`assertNoSubscriberOrphans: subscriber_balances scan: ${balancesRes.error.message}`);
  }
  await probe('subscriber_balances', balancesRes.data as { subscriber_id: string }[] | null);

  const schedulesRes = await supabaseAdmin.from('contribution_schedules').select('subscriber_id');
  if (schedulesRes.error) {
    throw new Error(`assertNoSubscriberOrphans: contribution_schedules scan: ${schedulesRes.error.message}`);
  }
  await probe('contribution_schedules', schedulesRes.data as { subscriber_id: string }[] | null);

  const insuranceRes = await supabaseAdmin.from('insurance_policies').select('subscriber_id');
  if (insuranceRes.error) {
    throw new Error(`assertNoSubscriberOrphans: insurance_policies scan: ${insuranceRes.error.message}`);
  }
  await probe('insurance_policies', insuranceRes.data as { subscriber_id: string }[] | null);

  const insProductsRes = await supabaseAdmin
    .from('subscriber_insurance_products')
    .select('subscriber_id');
  if (insProductsRes.error) {
    throw new Error(`assertNoSubscriberOrphans: subscriber_insurance_products scan: ${insProductsRes.error.message}`);
  }
  await probe('subscriber_insurance_products', insProductsRes.data as { subscriber_id: string }[] | null);

  const claimsRes = await supabaseAdmin.from('claims').select('subscriber_id');
  if (claimsRes.error) {
    throw new Error(`assertNoSubscriberOrphans: claims scan: ${claimsRes.error.message}`);
  }
  await probe('claims', claimsRes.data as { subscriber_id: string }[] | null);

  const withdrawalsRes = await supabaseAdmin.from('withdrawals').select('subscriber_id');
  if (withdrawalsRes.error) {
    throw new Error(`assertNoSubscriberOrphans: withdrawals scan: ${withdrawalsRes.error.message}`);
  }
  await probe('withdrawals', withdrawalsRes.data as { subscriber_id: string }[] | null);

  const commissionsRes = await supabaseAdmin.from('commissions').select('subscriber_id');
  if (commissionsRes.error) {
    throw new Error(`assertNoSubscriberOrphans: commissions scan: ${commissionsRes.error.message}`);
  }
  await probe('commissions', commissionsRes.data as { subscriber_id: string }[] | null);

  if (offenders.length > 0) {
    const summary = offenders
      .map(
        (o) =>
          `${o.table} (${o.orphanCount} orphan rows; sample subscriber_id=${o.sampleIds.join(', ')})`,
      )
      .join('; ');
    throw new Error(
      `assertNoSubscriberOrphans: found orphan rows in ${offenders.length} table(s): ${summary}`,
    );
  }
}

/**
 * Returns a function that restores a commission row's `status` (and the
 * settlement stamp columns `paid_date` / `paid_amount` / `txn_ref`) to the
 * values captured here.
 *
 * Post-0029 the commission lifecycle is the two-state `due → paid` model
 * (the run/dispute/hold/confirm columns were dropped by migration 0029), so a
 * snapshot only has to capture those four columns. Internal helper for the
 * settlement-flow fixtures below.
 */
type CommissionRestoreSnapshot = {
  status: string;
  paid_date: string | null;
  paid_amount: number | null;
  txn_ref: string | null;
};

async function snapshotCommission(commissionId: string): Promise<CommissionRestoreSnapshot> {
  const { data, error } = await supabaseAdmin
    .from('commissions')
    .select('status,paid_date,paid_amount,txn_ref')
    .eq('id', commissionId)
    .maybeSingle();
  if (error) throw new Error(`snapshotCommission(${commissionId}): ${error.message}`);
  if (!data) throw new Error(`snapshotCommission(${commissionId}): row not found`);
  return data as CommissionRestoreSnapshot;
}

async function restoreCommission(
  commissionId: string,
  snapshot: CommissionRestoreSnapshot,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('commissions')
    .update(snapshot)
    .eq('id', commissionId);
  if (error) {
    throw new Error(`restoreCommission(${commissionId}): ${error.message}`);
  }
}

/**
 * Handle returned by `seedDueCommissionForFixture`. `cleanup()` restores the
 * row(s) to their pre-seed state — call it from `afterAll`/`afterEach` so
 * reruns are idempotent.
 */
export type CommissionFixtureHandle = {
  /** IDs of the commission rows the fixture touched. */
  commissionIds: string[];
  /** Restores each touched row's pre-seed status / settlement-stamp fields. */
  cleanup: () => Promise<void>;
};

/**
 * Ensure at least `minCount` `due` commissions exist for the given agent, so a
 * settlement-flow spec has dues to settle regardless of the seed window or a
 * prior run that already paid them off. Strategy:
 *
 *  1. If the agent already has >= `minCount` rows with `status='due'`, return a
 *     no-op handle (nothing disturbed).
 *  2. Otherwise pick the most-recently-paid rows and flip them back to `due`
 *     (clearing `paid_date`/`paid_amount`/`txn_ref`), snapshotting each so
 *     `cleanup()` restores the exact prior state.
 *  3. If the agent has fewer than `minCount` commissions in total, throw — the
 *     spec author should `npm run seed` rather than have the fixture invent
 *     unrelated rows that would violate the UNIQUE(agent_id, subscriber_id)
 *     constraint from migration 0017.
 *
 * Used by the settlement-flow spec to guarantee a settleable `due` slice. The
 * dispute/run fixtures this replaced were retired with the 0029 simplification
 * (no `released`/`disputed` states survive the two-state collapse).
 */
export async function seedDueCommissionForFixture(
  agentId: string,
  minCount = 1,
): Promise<CommissionFixtureHandle> {
  // Step 1: short-circuit if enough due rows already exist.
  const { count: dueCount, error: countErr } = await supabaseAdmin
    .from('commissions')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('status', 'due');
  if (countErr) {
    throw new Error(`seedDueCommissionForFixture: count ${agentId}: ${countErr.message}`);
  }
  if ((dueCount ?? 0) >= minCount) {
    return { commissionIds: [], cleanup: async () => {} };
  }

  // Step 2: flip the shortfall from paid → due, newest-paid first.
  const need = minCount - (dueCount ?? 0);
  const { data: candidates, error: candErr } = await supabaseAdmin
    .from('commissions')
    .select('id')
    .eq('agent_id', agentId)
    .eq('status', 'paid')
    .order('paid_date', { ascending: false, nullsFirst: false })
    .limit(need);
  if (candErr) {
    throw new Error(`seedDueCommissionForFixture: candidates ${agentId}: ${candErr.message}`);
  }
  if (!candidates || candidates.length < need) {
    throw new Error(
      `seedDueCommissionForFixture: agent ${agentId} has too few commissions to reach ` +
        `${minCount} due rows — re-run \`npm run seed\` before invoking this fixture`,
    );
  }

  const snapshots: { id: string; snap: CommissionRestoreSnapshot }[] = [];
  for (const c of candidates) {
    const id = (c as { id: string }).id;
    const snap = await snapshotCommission(id);
    const { error: updErr } = await supabaseAdmin
      .from('commissions')
      .update({ status: 'due', paid_date: null, paid_amount: null, txn_ref: null })
      .eq('id', id);
    if (updErr) {
      throw new Error(`seedDueCommissionForFixture: flip ${id}: ${updErr.message}`);
    }
    snapshots.push({ id, snap });
  }

  return {
    commissionIds: snapshots.map((s) => s.id),
    cleanup: async () => {
      for (const { id, snap } of snapshots) {
        await restoreCommission(id, snap);
      }
    },
  };
}
