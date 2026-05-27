// Playwright global setup — runs once before all specs.
//
// Job: mint storageState files for all 4 roles so any spec can opt into a
// pre-authenticated session via `test.use({ storageState: '...' })`.
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
