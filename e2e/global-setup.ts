// Playwright global setup — runs once before all specs.
//
// Job: mint storageState files for ALL SIX roles (subscriber, agent, branch,
// distributor, employer, admin) so any spec can opt into a pre-authenticated
// session via `test.use({ storageState: '...' })`.
//
// employer + admin were added per audit §7b.9 / F2-08: `mintAllStorageStates`
// loops the `ROLES` array in fixtures/auth.ts, which now carries all six, so
// e2e/.auth/{employer,admin}.json are minted alongside the original four with
// no change needed here beyond the array. `.gitignore` keeps e2e/.auth/*.json
// out of source control (the secrets are minted fresh each run).
//
// Why before webServer: Playwright runs globalSetup → webServer → tests, in
// that order. We mint JWTs directly via `jose` (using SUPABASE_JWT_SECRET)
// rather than hitting /api/auth/verify-otp, so the dev server doesn't need to
// be up yet.

import type { FullConfig } from '@playwright/test';
import { mintAllStorageStates } from './fixtures/auth';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173';
  await mintAllStorageStates(baseURL);
}
