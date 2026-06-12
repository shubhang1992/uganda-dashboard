// Shared deactivation gate for the auth routes (H1).
//
// An admin can deactivate a distributor / branch / agent / employer entity
// (migration 0060 sets the entity table's `status` column to 'inactive'). A
// deactivated entity must NOT be able to authenticate via EITHER auth route —
// `verify-otp` (OTP path) and `verify-password` (password path) both call
// `isEntityDeactivated` after resolving the role-scoped entity ID and, when it
// returns true, respond 403 with `ACCOUNT_DEACTIVATED_RESPONSE`.
//
// Subscribers and admin are intentionally NEVER gated: subscribers are
// self-onboarded (no admin-driven deactivation), and the `admins` table has no
// status concept. Both are absent from STATUS_TABLE, so the lookup short-
// circuits to `false` for those roles (no DB round-trip).
//
// The lookup is NON-FATAL: on any Supabase error OR a missing row it returns
// `false` so login proceeds. The demo's `demo_personas` fallback IDs
// (a-001 / b-kam-015 / d-001 / emp-001) may not correspond to a real entity
// row, and a missing-row lookup must never block a demo login.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JwtRole } from '../../_lib/jwt.js';

// role → entity table. Subscriber + admin are deliberately absent (never gated).
const STATUS_TABLE: Partial<Record<JwtRole, string>> = {
  agent: 'agents',
  branch: 'branches',
  distributor: 'distributors',
  employer: 'employers',
};

/**
 * Returns `true` only when the role maps to an entity table AND that entity's
 * row exists AND its `status` column is exactly `'inactive'`. Every other case
 * — unmapped role (subscriber/admin), lookup error, missing row, or any
 * non-'inactive' status — returns `false` so authentication proceeds.
 */
export async function isEntityDeactivated(
  supabase: SupabaseClient,
  role: JwtRole,
  entityId: string,
): Promise<boolean> {
  const table = STATUS_TABLE[role];
  if (!table) return false;

  const { data, error } = await supabase
    .from(table)
    .select('status')
    .eq('id', entityId)
    .maybeSingle();

  // Non-fatal: a lookup error or a missing demo-fallback row must never block
  // login. Only an existing row with status === 'inactive' gates the account.
  if (error || !data) return false;
  return (data as { status?: unknown }).status === 'inactive';
}

/**
 * 403 body returned when `isEntityDeactivated` is true. Byte-identical to the
 * message both auth routes previously inlined, and mapped to the same
 * customer-facing string in `src/services/auth.js:messageForCode`.
 */
export const ACCOUNT_DEACTIVATED_RESPONSE = {
  code: 'account_deactivated',
  message:
    'This account has been deactivated. Please contact support to reactivate it.',
} as const;
