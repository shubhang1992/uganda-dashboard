// Demo scope: no rate limiting, no HIBP check, no email-reset flow.
//
// POST /api/auth/verify-password
//
// Password sign-in companion to `verify-otp`. Accepts `{ phone, role, password }`,
// looks up the `users(phone, role)` row, bcrypt-compares the supplied password
// against `password_hash`, and — on success — resolves the same role-scoped
// entity ID and mints the same JWT shape that `verify-otp` does. The frontend
// treats both responses interchangeably (`AuthContext.login` consumes either
// `{ token, user }` payload).
//
// Error vocabulary (4xx codes mirror the AuthError vocabulary on the
// frontend; UI maps both `password_not_set` cases to a single "use OTP
// instead" fallback so users with no hash never see a "wrong password" toast):
//   - invalid_request    — missing/wrong-type field
//   - password_not_set   — phone+role has no row OR row has NULL password_hash
//   - invalid_password   — row found with hash, but bcrypt compare failed

import type { VercelRequest, VercelResponse } from '@vercel/node';
import supabaseAdmin from '../_lib/supabase-admin.js';
import { signJwt, type JwtRole } from '../_lib/jwt.js';
import { toCanonicalUGPhone } from '../_lib/phone.js';
import { verifyPassword } from './_lib/password.js';
import {
  ROLE_DEFAULTS,
  resolveDemoPersona,
  resolveSubscriber,
} from './_lib/personas.js';
import { buildAuthResponseDto, buildJwtClaims } from './_lib/claims.js';

const VALID_ROLES = new Set<JwtRole>([
  'subscriber',
  'agent',
  'branch',
  'distributor',
]);

async function touchLastLogin(phone: string, role: JwtRole): Promise<void> {
  // Best-effort `last_login_at` bump. Failure is non-fatal — the user is
  // already authenticated and we don't want a stray UPDATE error to mask
  // a successful sign-in.
  const { error } = await supabaseAdmin
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('phone', phone)
    .eq('role', role);
  if (error) {
    console.error('[verify-password] last_login_at update failed', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body ?? {}) as {
    phone?: unknown;
    role?: unknown;
    password?: unknown;
  };
  const { phone, role, password } = body;

  if (typeof phone !== 'string' || phone.length === 0) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }
  if (typeof role !== 'string' || !VALID_ROLES.has(role as JwtRole)) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }
  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }

  const typedRole = role as JwtRole;
  const canonicalPhone = toCanonicalUGPhone(phone) || phone;

  try {
    // Look up the `users` row to fetch the stored hash. Newest-wins not
    // required here because `users` has UNIQUE(phone, role) — at most one
    // row per pair, unlike `subscribers`.
    const { data: userRow, error: userLookupError } = await supabaseAdmin
      .from('users')
      .select('password_hash')
      .eq('phone', canonicalPhone)
      .eq('role', typedRole)
      .maybeSingle();
    if (userLookupError) {
      console.error('[verify-password] users lookup failed', userLookupError);
      // Treat as no-row — UI shows the OTP fallback. Avoids leaking DB
      // state via a generic 500.
      res.status(401).json({ code: 'password_not_set' });
      return;
    }
    const storedHash = (userRow?.password_hash as string | null | undefined) ?? null;
    if (!userRow || !storedHash) {
      res.status(401).json({ code: 'password_not_set' });
      return;
    }

    const ok = await verifyPassword(password, storedHash);
    if (!ok) {
      res.status(401).json({ code: 'invalid_password' });
      return;
    }

    // Resolve the role-scoped entity ID exactly like verify-otp does — the
    // two routes share `_lib/personas.ts` so the resolution is identical.
    let entityId: string;
    let name: string | undefined;
    if (typedRole === 'subscriber') {
      const resolved = await resolveSubscriber(supabaseAdmin, canonicalPhone);
      if (resolved) {
        entityId = resolved.entityId;
        name = resolved.name;
      } else {
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

    await touchLastLogin(canonicalPhone, typedRole);

    // JWT claims + response DTO are built via the shared helpers so this
    // route and `verify-otp.ts` mint byte-identical payloads. `hasPassword`
    // is always `true` here — we just verified a non-null hash.
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
        hasPassword: true,
        name,
      })
    );
  } catch (err) {
    console.error('[verify-password] unexpected error', err);
    // Match verify-otp's behaviour: unknown failures surface as a generic
    // 500 rather than leaking error vocabulary the UI can branch on.
    res.status(500).json({ code: 'invalid_request' });
  }
}
