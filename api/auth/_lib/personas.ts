// Shared persona resolution for the auth API routes (B8, B9, D18).
//
// `verify-otp.ts` and `verify-password.ts` both need to translate a phone +
// app role into a stable, role-scoped entity ID (`subscriberId`, `agentId`,
// `branchId`, `distributorId`) so the JWT claim and response DTO they mint
// are byte-identical. Before this module they each held verbatim copies of
// `ROLE_DEFAULTS`, `resolveSubscriber`, and `resolveDemoPersona` — drift
// between the two would silently break the OTP-vs-password parity the
// frontend depends on (`AuthContext.login` consumes either payload).
//
// Demo fallback intent (CLAUDE.md §8): every demo login succeeds. When the
// phone isn't recognised we return seeded, stable fallback IDs rather than
// failing the request, so a sales rep using any phone still lands on a
// working dashboard.
//
// Lifted verbatim from the two routes; only the console.error tag was
// genericised (`[auth/personas]`) since both call-sites share this module.
// Logged DB errors are non-fatal — the route layer surfaces a 4xx code.
//
// SECURITY: takes a SupabaseClient (typed `any` because the schema isn't
// generated for the admin client). Callers must supply the service-role
// client from `api/_lib/supabase-admin.ts`. Never wire this to an anon
// client — the queries below are RLS-blind by design.
import type { JwtRole } from '../../_lib/jwt.js';

// Demo-stable fallback entity IDs when the phone isn't recognised. Matches
// the promise in CLAUDE.md §8 ("every demo login succeeds"). For subscribers
// the fallback is the first seeded row (`s-0001` / Brian Okello); kept here
// rather than queried at runtime so a re-seed drift surfaces loudly instead
// of silently rotating the demo identity mid-session.
export const ROLE_DEFAULTS: Record<JwtRole, string> = {
  subscriber: 's-0001',
  agent: 'a-001',
  branch: 'b-kam-015',
  distributor: 'd-001',
  employer: 'emp-001',
  admin: 'admin-001',
};

export type ResolvedIdentity = {
  entityId: string;
  name?: string;
};

// Supabase admin client. Typed loosely to avoid pulling a generated schema
// into the auth helper layer — the service-role client bypasses RLS and we
// only call narrow, well-typed query builders below.
type SupabaseAdminLike = {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (cols: string) => any;
  };
};

/**
 * Resolve a phone to the newest matching `subscribers` row. Returns `null`
 * when no row is found or the lookup errored — the caller falls back to
 * `ROLE_DEFAULTS.subscriber`.
 *
 * ORDER BY created_at DESC: the partial unique index on `subscribers(phone)`
 * is `WHERE NOT is_demo_signup`, so signup-created rows are NOT unique by
 * phone. A user re-running the demo accumulates multiple rows for the same
 * phone (each with their own contribution schedule). Without an ORDER BY,
 * Postgres returns an arbitrary one — usually the oldest — and the JWT
 * lands on a stale row whose schedule the user no longer recognises (the
 * "defaulting to 10K monthly" symptom). Newest-wins matches the demo
 * expectation that the most recent signup is the "live" account.
 */
export async function resolveSubscriber(
  supabaseAdmin: SupabaseAdminLike,
  phone: string,
): Promise<ResolvedIdentity | null> {
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('id, name')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[auth/personas] subscriber lookup failed', error);
    return null;
  }
  if (!data) return null;
  return {
    entityId: data.id as string,
    name: (data.name as string) ?? undefined,
  };
}

/**
 * Resolve a phone + non-subscriber role via `demo_personas`. Always returns
 * an identity — when no row matches we fall back to `ROLE_DEFAULTS[role]`
 * so the demo login always succeeds (CLAUDE.md §8).
 */
export async function resolveDemoPersona(
  supabaseAdmin: SupabaseAdminLike,
  phone: string,
  role: Exclude<JwtRole, 'subscriber'>,
): Promise<ResolvedIdentity> {
  const { data, error } = await supabaseAdmin
    .from('demo_personas')
    .select('entity_id, label')
    .eq('phone', phone)
    .eq('role', role)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[auth/personas] demo_personas lookup failed', error);
  }
  if (data) {
    return {
      entityId: data.entity_id as string,
      name: (data.label as string) ?? undefined,
    };
  }
  // No row → demo-stable fallback.
  return { entityId: ROLE_DEFAULTS[role] };
}
