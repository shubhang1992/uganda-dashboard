// E2E auth fixtures — mint HS256 JWTs and dump Playwright storageState files.
//
// We bypass the SignInModal in tests by writing the same two localStorage keys
// that AuthContext + supabaseClient use after a successful login:
//   • upensions_token → raw JWT string (services/supabaseClient.js:28 TOKEN_KEY)
//   • upensions_auth  → JSON.stringify(user) (contexts/AuthContext.jsx:32 AUTH_KEY)
//
// JWT shape matches api/_lib/jwt.ts exactly (HS256, iss=upensions, aud=authenticated,
// role='authenticated', plus app_role + role-scoped *Id claim). Secret is read
// from SUPABASE_JWT_SECRET (.env.local), same as the live API.
//
// Demo personas come from scripts/seed-supabase.mjs lines 838-844.

import { SignJWT } from 'jose';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type Role = 'subscriber' | 'agent' | 'branch' | 'distributor';

type Persona = {
  entityId: string;
  phone: string;
  name: string;
};

// One stable persona per role. These match the fallback IDs in
// api/auth/verify-otp.ts ROLE_DEFAULTS so a JWT minted here resolves to the
// same dashboard a sales rep would see by logging in with the demo phone.
const PERSONAS: Record<Role, Persona> = {
  subscriber: {
    entityId: 's-0001',
    phone: '+256711000001',
    name: 'Brian Okello',
  },
  agent: {
    entityId: 'a-001',
    phone: '+256700000001',
    name: 'Default agent (Kampala)',
  },
  branch: {
    entityId: 'b-kam-015',
    phone: '+256700000011',
    name: 'Default branch (Kampala Central)',
  },
  distributor: {
    entityId: 'd-001',
    phone: '+256700000021',
    name: 'Default distributor',
  },
};

const ROLE_ID_FIELD: Record<Role, string> = {
  subscriber: 'subscriberId',
  agent: 'agentId',
  branch: 'branchId',
  distributor: 'distributorId',
};

const ROLES: Role[] = ['subscriber', 'agent', 'branch', 'distributor'];

const TWENTY_FOUR_HOURS = 60 * 60 * 24;

function getSecretBytes(): Uint8Array {
  const raw = process.env.SUPABASE_JWT_SECRET;
  if (!raw) {
    throw new Error(
      'SUPABASE_JWT_SECRET is required to mint test JWTs. Check .env.local — ' +
      'the same secret api/_lib/jwt.ts uses must be available to Playwright.'
    );
  }
  return new TextEncoder().encode(raw);
}

async function mintJwt(role: Role, persona: Persona): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    sub: persona.entityId,
    role: 'authenticated',
    app_role: role,
    phone: persona.phone,
    [ROLE_ID_FIELD[role]]: persona.entityId,
  };
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('upensions')
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + TWENTY_FOUR_HOURS)
    .sign(getSecretBytes());
}

function buildUserObject(role: Role, persona: Persona) {
  return {
    role,
    phone: persona.phone,
    name: persona.name,
    [ROLE_ID_FIELD[role]]: persona.entityId,
  };
}

function authDir(): string {
  return path.resolve(process.cwd(), 'e2e/.auth');
}

export function storageStatePathFor(role: Role): string {
  return path.join(authDir(), `${role}.json`);
}

/**
 * Mint a Playwright storageState file for `role` and write it to
 * e2e/.auth/{role}.json. Caller is responsible for ensuring the directory
 * exists (global-setup does this once up front).
 */
export async function mintStorageStateFor(role: Role, baseUrl = 'http://localhost:3000'): Promise<string> {
  const persona = PERSONAS[role];
  const token = await mintJwt(role, persona);
  const userObj = buildUserObject(role, persona);

  const storageState = {
    cookies: [] as unknown[],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          { name: 'upensions_token', value: token },
          { name: 'upensions_auth', value: JSON.stringify(userObj) },
        ],
      },
    ],
  };

  const dest = storageStatePathFor(role);
  await writeFile(dest, JSON.stringify(storageState, null, 2));
  return dest;
}

export async function mintAllStorageStates(baseUrl = 'http://localhost:3000') {
  await mkdir(authDir(), { recursive: true });
  for (const role of ROLES) {
    await mintStorageStateFor(role, baseUrl);
  }
}

export const PERSONA_FOR = PERSONAS;
