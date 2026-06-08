// JWT claim + response DTO assembly for the auth API routes (D18).
//
// `verify-otp.ts` and `verify-password.ts` MUST mint byte-identical JWT
// claims and response bodies — the frontend (`AuthContext.login`) consumes
// either payload interchangeably, and any drift would silently break the
// OTP-vs-password parity. Before this module they each held verbatim
// copies of the same object literals, which the audit flagged as D18.
//
// Both helpers are pure (no DB calls, no env reads) and synchronous, so
// they're safe to call inline before `signJwt` or `res.json`.
//
// `role` claim is the **Postgres** role PostgREST uses for `SET ROLE`
// (always `"authenticated"`). The **application** role lives in `app_role`,
// which RLS policies read via `auth.jwt() ->> 'app_role'`. The role-scoped
// `subscriberId` / `agentId` / `branchId` / `distributorId` claim is set so
// RLS policies can read e.g. `auth.jwt() ->> 'agentId'`. See CLAUDE.md §5
// (Anti-pattern #7) for the role-vs-app_role footgun.

import type { JwtRole, JwtSignInput } from '../../_lib/jwt.js';

/**
 * Shape of the user object returned to the frontend on a successful login.
 * Mirrors the previous local `ResponseUser` type from both routes.
 */
export type AuthResponseUser = {
  role: JwtRole;
  phone: string;
  hasPassword: boolean;
  name?: string;
  subscriberId?: string;
  agentId?: string;
  branchId?: string;
  distributorId?: string;
  employerId?: string;
  adminId?: string;
};

/**
 * Full response body returned to the client on success: a signed token plus
 * the user payload AuthContext.login consumes.
 */
export type AuthResponse = {
  token: string;
  user: AuthResponseUser;
};

/**
 * Build the JWT claims payload passed to `signJwt`. The role-specific `*Id`
 * claim is set so RLS policies can read e.g. `auth.jwt() ->> 'agentId'`.
 * `role` is always 'authenticated' — see file header.
 */
export function buildJwtClaims(args: {
  role: JwtRole;
  phone: string;
  entityId: string;
}): JwtSignInput {
  const { role, phone, entityId } = args;
  return {
    sub: entityId,
    role: 'authenticated',
    app_role: role,
    phone,
    ...(role === 'subscriber' ? { subscriberId: entityId } : {}),
    ...(role === 'agent' ? { agentId: entityId } : {}),
    ...(role === 'branch' ? { branchId: entityId } : {}),
    ...(role === 'distributor' ? { distributorId: entityId } : {}),
    ...(role === 'employer' ? { employerId: entityId } : {}),
    ...(role === 'admin' ? { adminId: entityId } : {}),
  };
}

/**
 * Build the user payload returned in the response body. `hasPassword` is
 * caller-supplied because the two routes derive it differently:
 *   - verify-otp.ts:      reflects whatever the upsert ended up storing
 *   - verify-password.ts: always `true` (a successful compare proves it).
 */
export function buildAuthResponseUser(args: {
  role: JwtRole;
  phone: string;
  entityId: string;
  hasPassword: boolean;
  name?: string;
}): AuthResponseUser {
  const { role, phone, entityId, hasPassword, name } = args;
  const user: AuthResponseUser = {
    role,
    phone,
    hasPassword,
    ...(name ? { name } : {}),
    ...(role === 'subscriber' ? { subscriberId: entityId } : {}),
    ...(role === 'agent' ? { agentId: entityId } : {}),
    ...(role === 'branch' ? { branchId: entityId } : {}),
    ...(role === 'distributor' ? { distributorId: entityId } : {}),
    ...(role === 'employer' ? { employerId: entityId } : {}),
    ...(role === 'admin' ? { adminId: entityId } : {}),
  };
  return user;
}

/**
 * Convenience wrapper: bundle a signed token + the user payload into the
 * response shape AuthContext.login expects. Both routes call this just
 * before `res.status(200).json(...)`.
 */
export function buildAuthResponseDto(args: {
  token: string;
  role: JwtRole;
  phone: string;
  entityId: string;
  hasPassword: boolean;
  name?: string;
}): AuthResponse {
  const { token, ...userArgs } = args;
  return {
    token,
    user: buildAuthResponseUser(userArgs),
  };
}
