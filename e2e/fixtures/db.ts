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

/** Returns true if at least one row matches `where`. */
export async function rowExists(table: string, where: Record<string, unknown>): Promise<boolean> {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(where)) {
    query = query.eq(k, v as never);
  }
  const { count, error } = await query;
  if (error) throw new Error(`rowExists ${table}: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Returns the count of rows matching `where`. */
export async function countWhere(table: string, where: Record<string, unknown>): Promise<number> {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(where)) {
    query = query.eq(k, v as never);
  }
  const { count, error } = await query;
  if (error) throw new Error(`countWhere ${table}: ${error.message}`);
  return count ?? 0;
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
 * Deletes any subscriber rows matching `phone`, cleaning up child tables first
 * so FK constraints don't bite if cascades aren't in place. Use in afterEach
 * for signup flow specs that create real DB rows.
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
  // Delete child rows first to respect FK constraints. Tables confirmed via
  // information_schema query — subscriber_insurance is NOT a separate table
  // (insurance flag is stored on subscribers).
  const children = [
    'transactions',
    'nominees',
    'subscriber_balances',
    'contribution_schedules',
  ];
  for (const table of children) {
    await supabaseAdmin.from(table).delete().in('subscriber_id', ids);
  }
  const { error: delErr } = await supabaseAdmin.from('subscribers').delete().in('id', ids);
  if (delErr) throw new Error(`cleanup: subscriber delete: ${delErr.message}`);
  return ids.length;
}
