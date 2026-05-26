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

const VALID_ROLES = new Set<JwtRole>([
  'subscriber',
  'agent',
  'branch',
  'distributor',
]);

// Mirrors `verify-otp.ts` — same demo-stable fallbacks so a sales rep
// who set a password on the seeded `s-0001` row keeps landing on the same
// dashboard regardless of phone-input form.
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
  // Newest-wins. See `verify-otp.ts` for the rationale — the partial unique
  // index `WHERE NOT is_demo_signup` means signup-created rows aren't unique
  // by phone, so we always pick the most recently created one.
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('id, name')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[verify-password] subscriber lookup failed', error);
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
    console.error('[verify-password] demo_personas lookup failed', error);
  }
  if (data) {
    return {
      entityId: data.entity_id as string,
      name: (data.label as string) ?? undefined,
    };
  }
  return { entityId: ROLE_DEFAULTS[role] };
}

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

    // Resolve the role-scoped entity ID exactly like verify-otp does.
    let entityId: string;
    let name: string | undefined;
    if (typedRole === 'subscriber') {
      const resolved = await resolveSubscriber(canonicalPhone);
      if (resolved) {
        entityId = resolved.entityId;
        name = resolved.name;
      } else {
        entityId = ROLE_DEFAULTS.subscriber;
      }
    } else {
      const resolved = await resolveDemoPersona(canonicalPhone, typedRole);
      entityId = resolved.entityId;
      name = resolved.name;
    }

    await touchLastLogin(canonicalPhone, typedRole);

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
      hasPassword: true,
      ...(name ? { name } : {}),
      ...(typedRole === 'subscriber' ? { subscriberId: entityId } : {}),
      ...(typedRole === 'agent' ? { agentId: entityId } : {}),
      ...(typedRole === 'branch' ? { branchId: entityId } : {}),
      ...(typedRole === 'distributor' ? { distributorId: entityId } : {}),
    };

    res.status(200).json({ token, user });
  } catch (err) {
    console.error('[verify-password] unexpected error', err);
    // Match verify-otp's behaviour: unknown failures surface as a generic
    // 500 rather than leaking error vocabulary the UI can branch on.
    res.status(500).json({ code: 'invalid_request' });
  }
}
