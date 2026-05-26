// Demo scope: no rate limiting, no HIBP check.
//
// POST /api/auth/change-password
//
// Authenticated endpoint that lets a signed-in user set or change their
// password. Body: `{ currentPassword?: string, newPassword: string }`.
//
// Two flows:
//   1. Initial set — the user's row has `password_hash IS NULL`. Skip the
//      currentPassword check (there's nothing to verify against) and just
//      stamp the new hash.
//   2. Change — the user's row already has a hash. Require `currentPassword`
//      in the body and bcrypt-verify before updating.
//
// Error vocabulary:
//   - unauthorized               — missing / invalid / expired JWT
//   - current_password_required  — row has hash but body omitted currentPassword
//   - current_password_invalid   — supplied currentPassword failed verify
//   - password_required /
//     password_too_short /
//     password_too_long /
//     password_too_weak          — newPassword failed shape validation
//   - user_not_found             — JWT claims point at a (phone, role) pair
//                                  with no `users` row. Shouldn't normally
//                                  happen — verify-otp upserts on every
//                                  login — but guard so a stale token after
//                                  a manual DB scrub returns a clean 404.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import supabaseAdmin from '../_lib/supabase-admin.js';
import { verifyJwt, type JwtClaims } from '../_lib/jwt.js';
import { extractBearer } from '../_lib/bearer.js';
import {
  hashPassword,
  validatePasswordShape,
  verifyPassword,
} from './_lib/password.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ code: 'unauthorized' });
    return;
  }

  let claims: JwtClaims;
  try {
    claims = await verifyJwt(token);
  } catch {
    res.status(401).json({ code: 'unauthorized' });
    return;
  }

  const body = (req.body ?? {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const { currentPassword, newPassword } = body;

  // Shape-check `newPassword` BEFORE touching the DB so a malformed request
  // fails fast and a forgetful caller (no body at all) gets the same
  // password_required code the helper would surface for an empty string.
  const newShapeError = validatePasswordShape(newPassword);
  if (newShapeError) {
    res.status(400).json({ code: newShapeError });
    return;
  }
  // Narrow for downstream call sites — validatePasswordShape returning null
  // guarantees this is a non-empty string within the byte limit.
  const newPasswordStr = newPassword as string;

  const phone = claims.phone;
  const appRole = claims.app_role;

  try {
    const { data: userRow, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('password_hash')
      .eq('phone', phone)
      .eq('role', appRole)
      .maybeSingle();
    if (lookupError) {
      console.error('[change-password] users lookup failed', lookupError);
      res.status(500).json({ code: 'unexpected_error' });
      return;
    }
    if (!userRow) {
      res.status(404).json({ code: 'user_not_found' });
      return;
    }
    const existingHash = (userRow.password_hash as string | null | undefined) ?? null;

    if (existingHash) {
      // Change flow — require + verify currentPassword.
      if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        res.status(400).json({ code: 'current_password_required' });
        return;
      }
      const ok = await verifyPassword(currentPassword, existingHash);
      if (!ok) {
        res.status(401).json({ code: 'current_password_invalid' });
        return;
      }
    }
    // else: initial-set flow — no currentPassword needed.

    const newHash = await hashPassword(newPasswordStr);
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ password_hash: newHash })
      .eq('phone', phone)
      .eq('role', appRole);
    if (updateError) {
      console.error('[change-password] users update failed', updateError);
      res.status(500).json({ code: 'unexpected_error' });
      return;
    }

    res.status(200).json({ ok: true, hasPassword: true });
  } catch (err) {
    console.error('[change-password] unexpected error', err);
    res.status(500).json({ code: 'unexpected_error' });
  }
}
