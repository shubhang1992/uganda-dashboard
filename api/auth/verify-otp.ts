// POST /api/auth/verify-otp
//
// Validates `{ phone, otp, role, password? }`, resolves the role-scoped entity
// ID, upserts a `users(phone, role)` row (optionally stamping a bcrypt
// `password_hash` when the caller supplied one), and returns a signed JWT +
// the user payload that `AuthContext.login` consumes on the frontend.
//
// Error vocabulary preserved from src/services/auth.js `AuthError`:
//   - invalid_otp           — bad request shape (4xx). Unknown phones fall
//                             back to ROLE_DEFAULTS so the demo OTP step
//                             always succeeds.
//   - password_required /
//     password_too_short /
//     password_too_long /
//     password_too_weak     — shape errors surfaced from
//                             `validatePasswordShape` when an optional
//                             `password` is supplied. The OTP itself is
//                             still validated first; password is only
//                             checked once the rest of the request is sane.
//   - rate_limited          — out of scope for the demo
//   - locked                — out of scope for the demo

import type { VercelRequest, VercelResponse } from '@vercel/node';
import supabaseAdmin from '../_lib/supabase-admin.js';
import { signJwt, type JwtRole } from '../_lib/jwt.js';
import { toCanonicalUGPhone } from '../_lib/phone.js';
import {
  hashPassword,
  validatePasswordShape,
} from './_lib/password.js';

const OTP_REGEX = /^\d{6}$/;
const VALID_ROLES = new Set<JwtRole>([
  'subscriber',
  'agent',
  'branch',
  'distributor',
]);

// Demo-stable fallback entity IDs when the phone isn't recognised. Matches the
// promise in CLAUDE.md §8 ("every demo login succeeds"). For subscribers the
// fallback is the first seeded row (`s-0001` / Brian Okello); kept here rather
// than queried at runtime so a re-seed drift surfaces loudly instead of
// silently rotating the demo identity mid-session.
const ROLE_DEFAULTS: Record<JwtRole, string> = {
  subscriber: 's-0001',
  agent: 'a-001',
  branch: 'b-kam-015',
  distributor: 'd-001',
};

type ResponseUser = {
  role: JwtRole;
  phone: string;
  hasPassword: boolean;
  name?: string;
  subscriberId?: string;
  agentId?: string;
  branchId?: string;
  distributorId?: string;
};

type ResolvedIdentity = {
  entityId: string;
  name?: string;
};

async function resolveSubscriber(phone: string): Promise<ResolvedIdentity | null> {
  // ORDER BY created_at DESC: the partial unique index on `subscribers(phone)`
  // is `WHERE NOT is_demo_signup`, so signup-created rows are NOT unique by
  // phone. A user re-running the demo accumulates multiple rows for the same
  // phone (each with their own contribution schedule). Without an ORDER BY,
  // Postgres returns an arbitrary one — usually the oldest — and the JWT
  // lands on a stale row whose schedule the user no longer recognises (the
  // "defaulting to 10K monthly" symptom). Newest-wins matches the demo
  // expectation that the most recent signup is the "live" account.
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('id, name')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Unexpected DB error — surface as invalid_otp for now (the demo has no
    // separate `server_error` code in AuthError). Logged server-side for ops.
    console.error('[verify-otp] subscriber lookup failed', error);
    return null;
  }
  if (!data) return null;
  return { entityId: data.id as string, name: (data.name as string) ?? undefined };
}

async function resolveDemoPersona(
  phone: string,
  role: Exclude<JwtRole, 'subscriber'>
): Promise<ResolvedIdentity> {
  const { data, error } = await supabaseAdmin
    .from('demo_personas')
    .select('entity_id, label')
    .eq('phone', phone)
    .eq('role', role)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[verify-otp] demo_personas lookup failed', error);
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

async function upsertUser(
  phone: string,
  role: JwtRole,
  passwordHash: string | null
): Promise<{ hasPassword: boolean }> {
  // `users` table has UNIQUE(phone, role) — one row per (phone, role) pair.
  // `id` is a non-null TEXT PRIMARY KEY with no default, so the INSERT half
  // of the upsert needs us to supply one. Deriving it deterministically from
  // (role, phone) keeps the upsert idempotent across replays: the same JWT
  // claims always identify the same row. The conflict target is still the
  // (phone, role) unique constraint, so an existing row's id is preserved on
  // the UPDATE half.
  //
  // When `passwordHash` is non-null we stamp it as part of the same upsert
  // so the row always reflects the freshly-hashed credential. Passing `null`
  // intentionally omits the column from the patch (rather than nulling out
  // any pre-existing hash) — keeping a previously-set password through
  // password-less re-logins is the desired demo behaviour.
  const patch: Record<string, unknown> = {
    id: `${role}:${phone}`,
    phone,
    role,
    last_login_at: new Date().toISOString(),
  };
  if (passwordHash) patch.password_hash = passwordHash;

  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(patch, { onConflict: 'phone,role' })
    .select('password_hash')
    .maybeSingle();
  if (error) {
    console.error('[verify-otp] users upsert failed', error);
    // Non-fatal for the demo — login still succeeds. Best-effort derive
    // `hasPassword` from whatever we tried to set in this request.
    return { hasPassword: Boolean(passwordHash) };
  }
  const storedHash = (data?.password_hash as string | null | undefined) ?? null;
  return { hasPassword: Boolean(storedHash) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body ?? {}) as {
    phone?: unknown;
    otp?: unknown;
    role?: unknown;
    password?: unknown;
  };
  const { phone, otp, role, password } = body;

  if (typeof phone !== 'string' || phone.length === 0) {
    res.status(400).json({ error: 'invalid_otp' });
    return;
  }
  if (typeof otp !== 'string' || !OTP_REGEX.test(otp)) {
    res.status(400).json({ error: 'invalid_otp' });
    return;
  }
  if (
    typeof role !== 'string' ||
    !VALID_ROLES.has(role as JwtRole)
  ) {
    res.status(400).json({ error: 'invalid_otp' });
    return;
  }
  const typedRole = role as JwtRole;

  // Optional password: only validated when the caller actually supplies one
  // (so the legacy OTP-only happy path stays untouched). Empty string is
  // treated as "not provided" — the SignUpModal can wire a single field that
  // submits `password: ''` when the user opts out of setting one.
  const passwordProvided =
    typeof password === 'string' && password.length > 0;
  if (passwordProvided) {
    const shapeError = validatePasswordShape(password);
    if (shapeError) {
      res.status(400).json({ code: shapeError });
      return;
    }
  }

  // Callers (SignInModal, signup, future surfaces) may pass the 9-digit local
  // form ('777247884'), the human-typed form ('0777 247 884'), or canonical
  // ('+256777247884'). The DB stores canonical (+256-prefixed, no spaces), so
  // any other form fails .eq() — surfaces as a misleading "Invalid code".
  // Normalize once here; an empty result means the input wasn't a valid UG
  // mobile and we treat that the same as a missing subscriber row.
  const canonicalPhone = toCanonicalUGPhone(phone) || phone;

  try {
    let entityId: string;
    let name: string | undefined;

    if (typedRole === 'subscriber') {
      const resolved = await resolveSubscriber(canonicalPhone);
      if (resolved) {
        entityId = resolved.entityId;
        name = resolved.name;
      } else {
        // Per CLAUDE.md §8: every demo login succeeds. Fall back to the
        // seeded `s-0001` row so a sales rep using any phone still lands on
        // a working subscriber dashboard. Same intent as the agent/branch/
        // distributor fallback below.
        entityId = ROLE_DEFAULTS.subscriber;
      }
    } else {
      const resolved = await resolveDemoPersona(canonicalPhone, typedRole);
      entityId = resolved.entityId;
      name = resolved.name;
    }

    // Hash AFTER the role lookup so a malformed phone/role still short-
    // circuits before we pay the ~80ms bcrypt cost.
    const passwordHash = passwordProvided
      ? await hashPassword(password as string)
      : null;

    const { hasPassword } = await upsertUser(
      canonicalPhone,
      typedRole,
      passwordHash
    );

    // Build the JWT claims. `role` is the Postgres role ("authenticated")
    // that PostgREST uses for `SET ROLE`; `app_role` carries our application
    // role and is read by RLS policies via `auth.jwt() ->> 'app_role'`.
    // Role-specific *Id claim is set so RLS policies can read e.g.
    // `auth.jwt() ->> 'agentId'`.
    const claims = {
      sub: entityId,
      role: 'authenticated' as const,
      app_role: typedRole,
      phone: canonicalPhone,
      ...(typedRole === 'subscriber' ? { subscriberId: entityId } : {}),
      ...(typedRole === 'agent' ? { agentId: entityId } : {}),
      ...(typedRole === 'branch' ? { branchId: entityId } : {}),
      ...(typedRole === 'distributor' ? { distributorId: entityId } : {}),
    };
    const token = await signJwt(claims);

    const user: ResponseUser = {
      role: typedRole,
      phone: canonicalPhone,
      hasPassword,
      ...(name ? { name } : {}),
      ...(typedRole === 'subscriber' ? { subscriberId: entityId } : {}),
      ...(typedRole === 'agent' ? { agentId: entityId } : {}),
      ...(typedRole === 'branch' ? { branchId: entityId } : {}),
      ...(typedRole === 'distributor' ? { distributorId: entityId } : {}),
    };

    res.status(200).json({ token, user });
  } catch (err) {
    console.error('[verify-otp] unexpected error', err);
    res.status(500).json({ error: 'invalid_otp' });
  }
}
