# Testing

End-to-end reference for the test pyramid in this repo: Vitest unit/integration, Playwright E2E across a dual-server topology, the CI matrix, and the demo-only force-overrides that let sales reps and tests exercise KYC failure paths.

For deploy-time env-var sync (which secret lives in which scope) see [`DEPLOYMENT.md`](./DEPLOYMENT.md). For the operational runbook (alerts, recovery, manual deploys) see [`render-operational.md`](./render-operational.md).

---

## 1. Test pyramid

Three layers, all run from the repo root:

- **Vitest** — ~700 unit + integration tests across `src/**` (React components, hooks, services, utilities) and `api/**` (Express route handlers, JWT helpers, KYC mocks). Default environment is `jsdom`; node-only tests opt out per file. Config is embedded in `vite.config.js`.
- **Playwright** — ~50 specs under `e2e/**`, split into `e2e/specs/smoke/` (per-role dashboard route walks), `e2e/specs/flows/` (full user journeys with DB verification via Supabase service-role), and `e2e/specs/regression/` for targeted bugfix specs (e.g. the mobile-drawer regression). Config in `playwright.config.ts`.
- **KYC mock force-overrides** — `localStorage.upensions_<stage>_force` keys that make the KYC client mocks (and the Express KYC routes via the `X-QA-Force` header) return deterministic failure outcomes. Used both by sales reps demoing failure paths and by E2E negative tests.

---

## 2. Running tests locally

| Script | What it does | When to run |
| --- | --- | --- |
| `npm test` | Vitest one-shot (CI mode). | Before opening a PR; matches CI. |
| `npm run test:watch` | Vitest in watch mode. | During TDD; reruns on save. |
| `npm run test:coverage` | Vitest with V8 coverage reporter. | When auditing coverage gaps. |
| `npm run test:e2e` | Full Playwright suite, all projects. | Pre-merge sanity; ~3 min. |
| `npm run test:e2e:smoke` | Smoke specs only (`e2e/specs/smoke/`). | Fastest E2E feedback; ~45-60 s. |
| `npm run test:e2e:flows` | Flow specs only (`e2e/specs/flows/`). | When you touched a write path. |
| `npm run test:e2e:headed` | Same as `:e2e` but the browser window is visible. | Debugging a failure visually. |
| `npm run test:e2e:ui` | Playwright UI mode (timeline + DOM inspector). | Step-debugging a flaky spec. |

Unit tests run against the local source tree; E2E tests boot a real dev stack (next section).

The coverage reporter writes to `coverage/` (gitignored). The Playwright HTML report writes to `playwright-report/`; traces and screenshots from a failing run land in `test-results/`. Both are gitignored and are also the directories CI uploads as artefacts.

---

## 3. Playwright dual-server topology

Playwright doesn't hit a deployed environment — it boots both servers locally before any spec runs:

- **Vite** on `http://localhost:5173` (the React bundle under test; `baseURL` for every navigation).
- **Express** on `http://localhost:3001` (the API the bundle calls).
- Both come up via `npm run dev:all`, which uses `concurrently` to run `vite` and `tsx watch server/index.ts` in parallel.

The relevant block from `playwright.config.ts:5-12, 132-140`:

```ts
const VITE_PORT = 5173;
const API_PORT = 3001;
const BASE_URL = `http://localhost:${VITE_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}/api`;

webServer: {
  command: 'npm run dev:all',
  url: BASE_URL,
  timeout: 120_000,
  reuseExistingServer: !process.env.CI,
  env: { VITE_API_BASE_URL: API_BASE_URL },
  ...
}
```

Why these ports: `:5173` is Vite's default; `:3001` is a dedicated backend port we picked to avoid collisions and keep the frontend/API split obvious. `reuseExistingServer: !process.env.CI` means a dev session you already have running locally is reused — no port-stomping.

Browser projects (`playwright.config.ts:52-130`):

- **`chromium`** — desktop Chromium, the canonical project; runs every spec. Launched with `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` so `LivenessStep`'s real `getUserMedia` call resolves against a synthetic camera (headless Chromium has none).
- **`webkit`** — desktop Safari engine; runs the same specs as chromium to catch engine-specific regressions (iframe quirks, Blob downloads). Only installed in CI.
- **`mobile-chromium`** — iPhone SE viewport with Chromium engine and Pixel UA. Limited to a hand-picked spec list (landing, subscriber/agent dashboards, health, branch mobile-drawer, distributor CSV export) — the desktop sidebar specs don't apply on mobile.
- **`mobile-webkit`** — iPhone 12 viewport with WebKit; same opt-in spec list as `mobile-chromium`.

Auth strategy: tests bypass the SignInModal entirely. `e2e/global-setup.ts` mints HS256 JWTs directly (same algorithm and secret as `api/_lib/jwt.ts`) and writes one `storageState` JSON per role to `e2e/.auth/`. Specs opt into a role via `test.use({ storageState: 'e2e/.auth/{role}.json' })` so every test starts already logged in, which saves ~2-3 s per test and isolates real login UI testing to a dedicated spec.

---

## 4. CI pipeline

Source of truth: [`.github/workflows/test.yml`](../.github/workflows/test.yml).

Two jobs run on every PR to `main` and every push to `main`:

1. **`lint-and-unit`** — `npm ci --legacy-peer-deps` → `npm run lint` → `npm test`. Fast feedback (~30 s).
2. **`e2e`** (gated on the first) — installs deps, then:
   - **`npm run build:api`** — `tsc -p server/tsconfig.json`. This is the type-check gate that catches NodeNext import-drift (missing `.js` extensions, `@vercel/node` type breakage) at PR review time rather than at Render deploy time. ~15 s of cheap insurance.
   - `npx playwright install --with-deps chromium webkit` — both engines, cached by `package-lock.json` hash.
   - **PR runs:** `chromium` + `mobile-chromium` projects only, running `smoke` + `flows` specs (`--workers=1`). Fast enough for the PR feedback loop.
   - **`main`-push runs:** the full matrix — every project (`chromium`, `webkit`, `mobile-chromium`, `mobile-webkit`) × every spec set (`smoke` + `flows` + `regression` + any `db/` specs). This is what guarantees schema state after a merge.

Both jobs upload artefacts: the HTML report (always, even on cancel) and traces/screenshots (on failure), retention 14 days. The `concurrency` block at workflow level cancels in-flight runs on the same ref so a follow-up push pre-empts the previous one — useful for force-pushed PR updates.

Flow specs write to the shared Supabase project (`zengmiugieqjqzaccbqe`) and clean up in `afterEach`. `--workers=1` is enforced in CI so concurrent runs in the same job don't race on the same rows.

---

## 5. CI secrets

The workflow needs four GitHub Actions secrets (Settings → Secrets and variables → Actions):

| Secret | Why CI needs it |
| --- | --- |
| `VITE_SUPABASE_URL` | Frontend reads it from the Vite dev server at build/boot. |
| `VITE_SUPABASE_ANON_KEY` | Frontend's public client key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by `e2e/fixtures/db.ts` for service-role DB verification + cleanup after flow specs. |
| `SUPABASE_JWT_SECRET` | `e2e/global-setup.ts` signs HS256 test JWTs with this — same secret the API verifies against. |

**`VITE_API_BASE_URL` is intentionally NOT a CI secret.** It's hardcoded in the workflow to `http://localhost:3001/api` because CI runs the dual-server topology locally (`npm run dev:all` started by Playwright's `webServer`), not against the production Render service. Pointing CI at the deployed API would mean E2E mutations land on shared infrastructure — bad. Pointing local Vite at the live Render URL would also defeat the purpose of testing local API changes.

For the full env-var sync matrix (which key lives in Vercel vs Render vs GHA), see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 6. KYC force-overrides

The KYC stages are mocked (intentional demo scope; see [`CLAUDE.md §10a`](../CLAUDE.md)). Each stage reads a `localStorage.upensions_<stage>_force` key in development and short-circuits to a deterministic failure outcome when set. The Express side honours the same overrides via the `X-QA-Force` request header.

| Stage | localStorage key | Example values |
| --- | --- | --- |
| OTP send/verify | `upensions_otp_force` | `fail`, `invalid_otp`, `rate_limited`, `locked` |
| ID image quality | `upensions_id_quality_force` | `fail-blur`, `fail-corners`, `fail-glare` |
| Face / liveness | `upensions_face_force` | `liveness-fail`, `no-match` |
| AML screening | `upensions_aml_force` | `flagged` |
| NIRA verify | `upensions_nira_force` | `partial`, `no-match` |

Set any of these in DevTools to drive the failure path during a demo or a negative test. Production builds ignore the keys (`IS_DEV` gate in `src/services/kyc.js` and `src/services/auth.js`) — a user with devtools open against the live site cannot bypass any KYC stage.

E2E specs that need to exercise a failure path either set the localStorage key in a `page.addInitScript` block (client-side mock) or send the `X-QA-Force` header directly when calling the API (server-side mock — see `api/kyc/*.ts` for the supported header values per route).

---

## 7. Phase deferrals

The QA harness was originally planned with five phases. Currently live: **Phase 1-3** — 44 smoke specs covering every dashboard route across the four built roles, plus **one flow template** (`subscriber-signup-to-contribute`) demonstrating the full 9-step signup wizard with DB verification.

**Phase 4 (full flow coverage per role)** and **Phase 5 (visual regression + accessibility audit)** are deferred. Reasoning is recorded in the user's project memory (`project_uganda_pensions_qa`): the smoke layer + one canonical flow template are enough to catch the regressions we've actually had, and the additional flow specs would write heavily to the shared Supabase project. The flow template is the pattern to copy when those phases are picked up.

---

## 8. `/qa` skill

`.claude/skills/qa.md` provides an agent-driven smoke runner. Use it when triaging a recent change without invoking the full CI pipeline.

Prerequisites:

- Dev servers running (`npm run dev:all` in another terminal — Playwright will reuse them rather than spawning a duplicate).
- Port `:5173` free for Vite to bind.
- `.env.local` populated (the skill reads the same env vars as `playwright.config.ts`).

Subcommands documented in the skill: `/qa smoke`, `/qa flows`, `/qa all`, `/qa fix`.

---

## 9. Common test pitfalls

- **The `'role'` vs `'app_role'` trap.** Tests that exercise RLS-aware code paths must mint JWTs with an `app_role` claim, not `role`. Reading `auth.jwt() ->> 'role'` from a policy returns Postgres's `'authenticated'` string, not the application role — gating on `'distributor'` / `'agent'` silently passes nothing through. This exact bug produced both the 0018 metrics rollup regression and the 0004 commission RPC silent failures. Full detail in [`BACKEND.md §6`](../BACKEND.md).
- **Realtime tests.** Supabase realtime publication is selectively enabled — ON for `commissions`, `settlement_runs`, `settlement_run_branch_reviews`; OFF for `transactions`, `subscribers`, `subscriber_balances`. Tests that subscribe to a channel on the OFF tables receive zero events and time out waiting.
- **`global` vs `globalThis`.** Vitest test files should reference `globalThis.fetch` / `globalThis.crypto`, not the bare `global`. ESLint's `no-restricted-globals` flags `global` in this repo.
- **Vercel preview SSO.** Preview deploys are auth-gated by Vercel's SSO; CI E2E never hits them. All E2E navigation targets `http://localhost:5173`, not the Vercel preview URL — don't add a spec that expects a deployed preview to be publicly reachable.
- **`MOCK_NOW` and date-relative assertions.** `src/data/mockData.js` exports `MOCK_NOW = new Date(2026, 3, 8)` so "due in N days" demos stay stable; tests that derive expectations from `new Date()` rather than `MOCK_NOW` drift the moment the calendar moves. Always anchor date assertions to `MOCK_NOW` (or freeze with `vi.setSystemTime`).
- **Webcam-gated signup specs.** Any spec that walks through `LivenessStep` needs the fake-camera launch flags from the `chromium` project. If you copy a spec into a new project, mirror the `launchOptions.args` block too, or `LivenessStep`'s "Take selfie" button stays disabled.
