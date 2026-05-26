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
import {
  ROLE_DEFAULTS,
  resolveDemoPersona,
  resolveSubscriber,
} from './_lib/personas.js';
import { buildAuthResponseDto, buildJwtClaims } from './_lib/claims.js';

const OTP_REGEX = /^\d{6}$/;
const VALID_ROLES = new Set<JwtRole>([
  'subscriber',
  'agent',
  'branch',
  'distributor',
]);

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
      const resolved = await resolveSubscriber(supabaseAdmin, canonicalPhone);
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
      const resolved = await resolveDemoPersona(
        supabaseAdmin,
        canonicalPhone,
        typedRole
      );
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

    // JWT claims + response DTO are built via the shared helpers so this
    // route and `verify-password.ts` mint byte-identical payloads. See
    // `_lib/claims.ts` for the claim/role rationale.
    const token = await signJwt(
      buildJwtClaims({
        role: typedRole,
        phone: canonicalPhone,
        entityId,
      })
    );

    res.status(200).json(
      buildAuthResponseDto({
        token,
        role: typedRole,
        phone: canonicalPhone,
        entityId,
        hasPassword,
        name,
      })
    );
  } catch (err) {
    console.error('[verify-otp] unexpected error', err);
    res.status(500).json({ error: 'invalid_otp' });
  }
}
