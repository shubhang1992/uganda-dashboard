// @vitest-environment node
//
// Unit tests for api/_lib/jwt.ts — HS256 sign/verify for custom UP tokens.
//
// Runs under the `node` environment (overriding the repo-wide jsdom default in
// vite.config.js). `jwt.ts` derives its key via `new TextEncoder().encode(...)`
// and signs with `jose`, which strictly checks `instanceof Uint8Array`. Under
// jsdom the global TextEncoder yields a Uint8Array from a different realm that
// fails that check, so this server-side module must be exercised under node —
// the same runtime it ships on (Express on Render).
//
// Covers the sign→verify round-trip, the minted claim shape (app_role / the
// role-scoped id claims / iat / exp), the 24h default expiry, and two
// rejection paths: a tampered token body and verification with the WRONG
// secret.
//
// Env-setup note: `jwt.ts` reads `SUPABASE_JWT_SECRET` lazily AND caches the
// derived key at module scope (`cachedKey`) on first use. So we must set the
// secret BEFORE importing the module, and once cached the module signs/verifies
// with that one secret for the whole file. To exercise the wrong-secret path we
// therefore mint a competing token with `jose` directly using a DIFFERENT
// secret and assert `verifyJwt` rejects it — rather than trying to mutate the
// cached key (which a second call would ignore).

import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';

// The HS256 secret must be present before the module under test derives and
// caches its key. Set it on the live process env, then import.
const TEST_SECRET = 'test-jwt-secret-for-vitest-do-not-use-in-prod';
process.env.SUPABASE_JWT_SECRET = TEST_SECRET;

// eslint-disable-next-line import/first
import { signJwt, verifyJwt, type JwtClaims } from './jwt';

const SECONDS_PER_DAY = 60 * 60 * 24;

// A representative subscriber payload — exercises one of the role-scoped id
// claims (subscriberId) alongside the always-present sub/app_role/phone.
const baseInput = {
  sub: 's-0001',
  role: 'authenticated' as const,
  app_role: 'subscriber' as const,
  phone: '+256777247884',
  subscriberId: 's-0001',
};

describe('signJwt / verifyJwt round-trip', () => {
  it('verifies a token it just signed and returns the same core claims', async () => {
    const token = await signJwt(baseInput);
    expect(typeof token).toBe('string');
    // Compact JWS = three base64url segments.
    expect(token.split('.')).toHaveLength(3);

    const claims = await verifyJwt(token);
    expect(claims.sub).toBe('s-0001');
    expect(claims.app_role).toBe('subscriber');
    expect(claims.phone).toBe('+256777247884');
    expect(claims.subscriberId).toBe('s-0001');
  });
});

describe('minted claim shape', () => {
  let claims: JwtClaims;

  beforeAll(async () => {
    const token = await signJwt(baseInput);
    claims = await verifyJwt(token);
  });

  it('stamps the fixed iss/aud/role defaults', () => {
    expect(claims.iss).toBe('upensions');
    expect(claims.aud).toBe('authenticated');
    // `role` is the Postgres role for PostgREST SET ROLE — always literal
    // 'authenticated', NOT the application role (that lives in app_role).
    expect(claims.role).toBe('authenticated');
  });

  it('carries the application role in app_role (not in role)', () => {
    expect(claims.app_role).toBe('subscriber');
  });

  it('carries the role-scoped id claim and omits the others', () => {
    expect(claims.subscriberId).toBe('s-0001');
    expect(claims.agentId).toBeUndefined();
    expect(claims.branchId).toBeUndefined();
    expect(claims.distributorId).toBeUndefined();
    expect(claims.employerId).toBeUndefined();
  });

  it('includes numeric iat and exp', () => {
    expect(typeof claims.iat).toBe('number');
    expect(typeof claims.exp).toBe('number');
    expect(Number.isFinite(claims.iat)).toBe(true);
    expect(Number.isFinite(claims.exp)).toBe(true);
  });

  it('emits the role-scoped id for non-subscriber roles (agent path)', async () => {
    const token = await signJwt({
      sub: 'a-001',
      role: 'authenticated',
      app_role: 'agent',
      phone: '+256777000001',
      agentId: 'a-001',
    });
    const agentClaims = await verifyJwt(token);
    expect(agentClaims.app_role).toBe('agent');
    expect(agentClaims.agentId).toBe('a-001');
    expect(agentClaims.subscriberId).toBeUndefined();
  });
});

describe('24h default expiry', () => {
  it('sets exp ~= iat + 24h when the caller does not supply exp', async () => {
    const token = await signJwt(baseInput);
    const { iat, exp } = await verifyJwt(token);
    expect(exp - iat).toBe(SECONDS_PER_DAY);
  });

  it('anchors iat to the current time (within a small skew)', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await signJwt(baseInput);
    const { iat } = await verifyJwt(token);
    // Allow a few seconds of slack for clock drift / slow test runs.
    expect(Math.abs(iat - nowSec)).toBeLessThanOrEqual(5);
  });
});

describe('rejection paths', () => {
  it('rejects a token whose body (payload segment) has been tampered with', async () => {
    const token = await signJwt(baseInput);
    const [header, payload, signature] = token.split('.');

    // Flip the payload to a forged claim set while keeping the original
    // signature — the HMAC no longer matches, so verify must throw.
    const forgedPayload = Buffer.from(
      JSON.stringify({
        iss: 'upensions',
        sub: 's-9999',
        role: 'authenticated',
        app_role: 'distributor',
        phone: '+256777247884',
        distributorId: 'd-001',
        aud: 'authenticated',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + SECONDS_PER_DAY,
      }),
    ).toString('base64url');

    const tampered = `${header}.${forgedPayload}.${signature}`;
    await expect(verifyJwt(tampered)).rejects.toThrow();
  });

  it('rejects a token signed with the WRONG secret', async () => {
    // Mint a structurally valid token with the right alg/iss/aud but a
    // DIFFERENT signing secret. verifyJwt (which uses the cached TEST_SECRET
    // key) must reject the signature.
    const wrongSecret = new TextEncoder().encode('a-totally-different-secret');
    const nowSec = Math.floor(Date.now() / 1000);
    const foreignToken = await new SignJWT({
      iss: 'upensions',
      sub: 's-0001',
      role: 'authenticated',
      app_role: 'subscriber',
      phone: '+256777247884',
      subscriberId: 's-0001',
      aud: 'authenticated',
      iat: nowSec,
      exp: nowSec + SECONDS_PER_DAY,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(wrongSecret);

    await expect(verifyJwt(foreignToken)).rejects.toThrow();
  });
});
