// HS256 JWT signing + verification for Universal Pensions custom tokens.
//
// The secret comes from `SUPABASE_JWT_SECRET` and is treated as raw UTF-8 —
// PostgREST / GoTrue both verify with the secret bytes as UTF-8, so signing
// with anything else (e.g. base64-decoded bytes) yields a signature PostgREST
// rejects with `PGRST301 "None of the keys was able to decode the JWT"`.
//
// The JWT `role` claim is the **Postgres role** PostgREST issues `SET ROLE`
// against — always the literal `"authenticated"`. The application-level role
// (subscriber / agent / branch / distributor) lives in `app_role`, which the
// RLS policies read via `auth.jwt() ->> 'app_role'`.
//
// `aud: 'authenticated'` is REQUIRED for Supabase PostgREST to accept the
// token against RLS policies that reference `auth.jwt()`.

import { SignJWT, jwtVerify } from 'jose';

// Env preflight has moved to `server/env.ts:assertServerEnv()` (B1). Under
// the long-lived Express process a top-level `throw` here would crash the
// whole shared backend (including /healthz) and push Render into a redeploy
// loop. We rely on `assertServerEnv()` running once at server boot before
// any handler can import this module. The deferred check in `getSecretKey()`
// below is a defensive secondary guard.

export type JwtRole = 'subscriber' | 'agent' | 'branch' | 'distributor' | 'employer' | 'admin';

export type JwtClaims = {
  iss: 'upensions';
  sub: string;
  role: 'authenticated';
  app_role: JwtRole;
  phone: string;
  subscriberId?: string;
  agentId?: string;
  branchId?: string;
  distributorId?: string;
  employerId?: string;
  adminId?: string;
  aud: 'authenticated';
  exp: number;
  iat: number;
};

// Optional input shape for `signJwt` — the helper fills iat/exp/iss/aud itself.
export type JwtSignInput = Omit<JwtClaims, 'iss' | 'aud' | 'exp' | 'iat'> & {
  iss?: 'upensions';
  aud?: 'authenticated';
  exp?: number;
  iat?: number;
};

const ALG = 'HS256';
const ISSUER: JwtClaims['iss'] = 'upensions';
const AUDIENCE: JwtClaims['aud'] = 'authenticated';
// Default expiry: 24h. Keeps a full demo day friction-free. On 401 the
// frontend's `onAuthExpired` listener logs the user out gracefully.
const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24;

let cachedKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const raw = process.env.SUPABASE_JWT_SECRET;
  if (!raw) {
    throw new Error(
      'SUPABASE_JWT_SECRET is not set. Expected server/env.ts:assertServerEnv() to have caught this at boot.'
    );
  }
  // Supabase / GoTrue / PostgREST verify HS256 signatures with the secret
  // bytes interpreted as raw UTF-8. Signing with base64-decoded bytes would
  // mint tokens that PostgREST rejects (PGRST301).
  cachedKey = new TextEncoder().encode(raw);
  return cachedKey;
}

/**
 * Sign a JwtClaims payload with HS256. Defaults iss/aud and a 24h exp if the
 * caller didn't supply them. Returns a compact JWS string.
 */
export async function signJwt(claims: JwtSignInput): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const iat = claims.iat ?? nowSec;
  const exp = claims.exp ?? iat + DEFAULT_EXPIRY_SECONDS;

  const fullClaims: JwtClaims = {
    iss: claims.iss ?? ISSUER,
    sub: claims.sub,
    role: 'authenticated',
    app_role: claims.app_role,
    phone: claims.phone,
    aud: claims.aud ?? AUDIENCE,
    iat,
    exp,
  };
  if (claims.subscriberId) fullClaims.subscriberId = claims.subscriberId;
  if (claims.agentId) fullClaims.agentId = claims.agentId;
  if (claims.branchId) fullClaims.branchId = claims.branchId;
  if (claims.distributorId) fullClaims.distributorId = claims.distributorId;
  if (claims.employerId) fullClaims.employerId = claims.employerId;
  if (claims.adminId) fullClaims.adminId = claims.adminId;

  // jose treats `iat`/`exp` as reserved — we set them explicitly via the
  // builder so the value lands at the top level (not in protected header).
  return await new SignJWT({ ...fullClaims })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .sign(getSecretKey());
}

/**
 * Verify a compact JWS produced by `signJwt`. Validates signature, audience,
 * issuer, and expiry. Throws on any failure — callers should map the error
 * to a 401 response.
 */
export async function verifyJwt(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    algorithms: [ALG],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  // jose returns a JWTPayload — narrow to JwtClaims. We trust the payload
  // shape because we signed it ourselves with these exact fields.
  return payload as unknown as JwtClaims;
}
