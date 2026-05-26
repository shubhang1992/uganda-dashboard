// Playwright E2E config.
//
// Layout:
//   • testDir → e2e/specs/{smoke,flows,regression}
//   • webServer → npm run dev:api (vercel dev serves frontend + /api/* together)
//   • globalSetup → mints localStorage state for all 4 roles (one JSON per role)
//   • per-spec `test.use({ storageState: 'e2e/.auth/{role}.json' })` chooses identity
//
// Auth strategy: tests bypass the SignInModal entirely. global-setup signs HS256
// JWTs directly (same algo + secret as api/_lib/jwt.ts) and writes them to a
// Playwright storageState file. Specs reuse those files via `test.use(...)` so
// every test starts already-logged-in. This shaves ~2-3s per test and isolates
// real login UI testing into a dedicated spec.

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env.local so SUPABASE_JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY are
// available to globalSetup + Node-side fixtures.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PORT = Number(process.env.VERCEL_DEV_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e/specs',
  // Demo-app data fetches against Supabase can take several seconds on cold
  // start (Vite chunk compile + first PostgREST roundtrip). Generous defaults
  // keep first-touch tests reliable; warm runs are still fast.
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    // Desktop Chromium — the canonical project. Runs every spec.
    //
    // launchOptions.args: LivenessStep.jsx in signup uses
    // `navigator.mediaDevices.getUserMedia` to start a real webcam stream
    // (commit 9e585b7 swapped the placeholder Blob path for a real camera).
    // Headless Chromium has no camera by default, so without these flags
    // the "Take selfie" button stays disabled and the signup-to-contribute
    // spec (and any other flow that walks through LivenessStep) gets stuck.
    //
    //   --use-fake-ui-for-media-stream — auto-accept the getUserMedia prompt
    //   --use-fake-device-for-media-stream — provide a synthetic video device
    //
    // The combination unblocks LivenessStep without granting any real media
    // access. Mirrored to the webkit + mobile projects below.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
    // Desktop WebKit (Safari) — same coverage as Chromium so we catch
    // engine-specific regressions (e.g. Safari iframe / Blob download quirks).
    // Skipped from the run if the WebKit browser isn't installed locally; the
    // GitHub Actions job runs `npx playwright install --with-deps` which
    // provisions both engines.
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    // Mobile Chromium (iPhone SE viewport, Chromium engine) — limited to
    // specs that work without the desktop sidebar. Branch + distributor
    // dashboards expose a MobileDrawer instead of the sidebar buttons our
    // smoke spec targets, so those smoke specs are desktop-only by design.
    // The dedicated `regression/branch-mobile-drawer.spec.ts` opts in via
    // filename match. We override the iPhone-SE device's default browser
    // (WebKit) with Chromium so this project runs even when WebKit isn't
    // installed locally.
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone SE'],
        defaultBrowserType: 'chromium',
        viewport: { width: 375, height: 667 },
        // iPhone SE's device descriptor sets a Safari UA; flip it to the
        // Chromium-on-Android-equivalent so feature-detection paths that
        // branch on UA stay in the Chromium branch.
        userAgent:
          'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
      testMatch: [
        '**/smoke/landing.spec.ts',
        '**/smoke/subscriber-dashboard.spec.ts',
        '**/smoke/agent-dashboard.spec.ts',
        '**/smoke/_health.spec.ts',
        '**/regression/branch-mobile-drawer.spec.ts',
        '**/flows/distributor-exports-csv.spec.ts',
      ],
    },
    // Mobile WebKit (iPhone 12 viewport, WebKit engine) — Safari/iOS
    // coverage for the mobile-only specs. iPhone 12 device descriptor
    // already defaults to WebKit; we just pin the viewport explicitly.
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 12'], viewport: { width: 390, height: 844 } },
      testMatch: [
        '**/smoke/landing.spec.ts',
        '**/smoke/subscriber-dashboard.spec.ts',
        '**/smoke/agent-dashboard.spec.ts',
        '**/smoke/_health.spec.ts',
        '**/regression/branch-mobile-drawer.spec.ts',
        '**/flows/distributor-exports-csv.spec.ts',
      ],
    },
  ],

  webServer: {
    command: 'npm run dev:api',
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
