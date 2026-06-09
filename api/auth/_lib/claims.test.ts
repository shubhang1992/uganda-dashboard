// Unit tests for api/auth/_lib/claims.ts (D18).
//
// `buildJwtClaims` / `buildAuthResponseUser` / `buildAuthResponseDto` are pure
// helpers shared by verify-otp.ts + verify-password.ts so both mint
// byte-identical JWT claims + response bodies. A bug here mints malformed JWTs
// for ALL six roles — and the role-scoped `*Id` claim is exactly what RLS reads
// (`auth.jwt() ->> 'agentId'` etc.), so a cross-role leak (e.g. an `agentId` on
// a subscriber token) silently breaks tenant scoping.
//
// These tests pin: (1) `role` is ALWAYS the Postgres role 'authenticated' (NOT
// the app role — CLAUDE.md anti-pattern #7); (2) `app_role` carries the real
// role; (3) each role gets exactly ONE role-scoped id claim and no other role's
// id leaks in; (4) the admin role's `adminId` claim is present (never asserted
// anywhere before — audit §7b.4); (5) the response DTO mirrors the claim shape
// and only includes `name` when supplied.

import { describe, it, expect } from 'vitest';
import {
  buildJwtClaims,
  buildAuthResponseUser,
  buildAuthResponseDto,
} from './claims';
import type { JwtRole } from '../../_lib/jwt.js';

// [role, idClaimKey] for every app role — the canonical claim each role mints.
const ROLE_CLAIM: ReadonlyArray<readonly [JwtRole, string]> = [
  ['subscriber', 'subscriberId'],
  ['agent', 'agentId'],
  ['branch', 'branchId'],
  ['distributor', 'distributorId'],
  ['employer', 'employerId'],
  ['admin', 'adminId'],
];

// Every id-claim key that exists across all roles — used to prove no OTHER
// role's id leaks onto a given role's payload.
const ALL_ID_KEYS = ROLE_CLAIM.map(([, key]) => key);

describe('buildJwtClaims', () => {
  it.each(ROLE_CLAIM)(
    '%s → role:"authenticated", app_role:%s id-claim, sub=entityId',
    (role, claimKey) => {
      const claims = buildJwtClaims({ role, phone: '+256777000000', entityId: 'ent-1' });
      // The Postgres SET ROLE value — NEVER the app role.
      expect(claims.role).toBe('authenticated');
      expect(claims.app_role).toBe(role);
      expect(claims.sub).toBe('ent-1');
      expect(claims.phone).toBe('+256777000000');
      // Exactly this role's id claim is set to the entity id.
      expect((claims as Record<string, unknown>)[claimKey]).toBe('ent-1');
    },
  );

  it.each(ROLE_CLAIM)(
    'no OTHER role id claim leaks onto a %s token', (role, claimKey) => {
      const claims = buildJwtClaims({ role, phone: '+256777000000', entityId: 'ent-1' }) as Record<string, unknown>;
      for (const otherKey of ALL_ID_KEYS) {
        if (otherKey === claimKey) continue;
        expect(claims[otherKey], `${role} leaked ${otherKey}`).toBeUndefined();
      }
    },
  );

  it('mints the adminId claim for the admin role (regression: never asserted before)', () => {
    const claims = buildJwtClaims({ role: 'admin', phone: '+256700000031', entityId: 'admin-001' });
    expect(claims.app_role).toBe('admin');
    expect((claims as Record<string, unknown>).adminId).toBe('admin-001');
    expect((claims as Record<string, unknown>).subscriberId).toBeUndefined();
  });
});

describe('buildAuthResponseUser', () => {
  it.each(ROLE_CLAIM)(
    '%s user payload carries role + the %s id claim and hasPassword', (role, claimKey) => {
      const user = buildAuthResponseUser({
        role, phone: '+256777000000', entityId: 'ent-9', hasPassword: true,
      }) as Record<string, unknown>;
      expect(user.role).toBe(role);
      expect(user.phone).toBe('+256777000000');
      expect(user.hasPassword).toBe(true);
      expect(user[claimKey]).toBe('ent-9');
      // No other role's id key leaks in.
      for (const otherKey of ALL_ID_KEYS) {
        if (otherKey === claimKey) continue;
        expect(user[otherKey]).toBeUndefined();
      }
    },
  );

  it('omits `name` when not supplied and includes it when supplied', () => {
    const without = buildAuthResponseUser({ role: 'agent', phone: '+256700000000', entityId: 'a-1', hasPassword: false });
    expect('name' in without).toBe(false);
    const withName = buildAuthResponseUser({ role: 'agent', phone: '+256700000000', entityId: 'a-1', hasPassword: false, name: 'Alice' });
    expect(withName.name).toBe('Alice');
  });

  it('reflects hasPassword: false faithfully', () => {
    const user = buildAuthResponseUser({ role: 'subscriber', phone: '+256700000000', entityId: 's-1', hasPassword: false });
    expect(user.hasPassword).toBe(false);
  });
});

describe('buildAuthResponseDto', () => {
  it('bundles the signed token with a user payload that matches the claim shape', () => {
    const dto = buildAuthResponseDto({
      token: 'signed-token', role: 'distributor', phone: '+256700000001',
      entityId: 'd-001', hasPassword: true, name: 'Net Op',
    });
    expect(dto.token).toBe('signed-token');
    expect(dto.user).toMatchObject({
      role: 'distributor',
      phone: '+256700000001',
      distributorId: 'd-001',
      hasPassword: true,
      name: 'Net Op',
    });
    // The DTO must NOT carry the token field inside `user`.
    expect((dto.user as Record<string, unknown>).token).toBeUndefined();
  });

  it('admin DTO carries adminId (full-chain parity with the JWT claims)', () => {
    const dto = buildAuthResponseDto({
      token: 't', role: 'admin', phone: '+256700000031', entityId: 'admin-001', hasPassword: false,
    });
    expect((dto.user as Record<string, unknown>).adminId).toBe('admin-001');
  });
});
