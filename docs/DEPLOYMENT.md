# Deployment — Configuration & IaC Reference

This document is the single source of truth for **what** the deploy topology looks like and **where** every config and env var lives. It deliberately does **not** cover operational procedures (manual deploy steps, recovery scripts, alert config, log retention) — those live in [`render-operational.md`](./render-operational.md).

> **Scope split**
> - `docs/DEPLOYMENT.md` (this file) — config files, env-var matrix, infrastructure-as-code layer.
> - [`docs/render-operational.md`](./render-operational.md) — manual deploy procedure, rollback, recovery runbooks, alerting, free-tier budgets.

---

## 1. Topology

Three independent surfaces are stitched together by env vars and a pair of cron-driven keepalive jobs. The frontend is a static React bundle on Vercel's CDN; the backend is a stateless Express service on Render in the Singapore region (chosen to minimise the Render → Supabase Tokyo hop); both call Supabase Postgres directly with different keys (anon-key from the browser, service-role from the server). Two redundant cron pingers (GitHub Actions + cron-job.org) keep the free-tier Render service warm.

```
                                                       +----------------------+
   Browser  ───── HTTPS ─────►  Vercel CDN  ───►  uganda-dashboard.vercel.app
     │                          (static React bundle    └── built from dist/
     │                           via Vercel Edge)
     │
     │  XHR / fetch (VITE_API_BASE_URL)
     ▼
   +------------------------------------------+
   |  Render — uganda-dashboard-api           |
   |  Express 5 · Node 22 · Singapore region  |
   |  Free tier (sleeps after 15 min idle)    |
   +-------------------+----------------------+
                       │  service_role key
                       ▼
   +------------------------------------------+
   |  Supabase Postgres                       |
   |  zengmiugieqjqzaccbqe.supabase.co        |
   |  Region: Tokyo / ap-northeast-1          |
   +------------------------------------------+
                       ▲
                       │  anon key (RLS-scoped)
                       │
   Browser  ───── HTTPS (direct realtime channels) ───┘

   Keepalive (so cold-starts don't hit demo prospects):

   GitHub Actions cron  ── every 14 min ──►  Render /healthz  (.github/workflows/keepalive.yml)
   cron-job.org         ── every 5 min  ──►  Render /healthz  (backup; emails team on failure)
```

---

## 2. Vercel side

The frontend is a vanilla Vite build. Vercel's framework preset runs `vite build` to produce `dist/` and serves the bundle from its global CDN.

### `vercel.json`

```json
{
  "framework": "vite",
  "rewrites": [{"source": "/(.*)", "destination": "/index.html"}]
}
```

That's the whole file. Two things to know:

- **Framework preset.** `"framework": "vite"` picks up the standard build pipeline. No custom `buildCommand` or `outputDirectory` — defaults apply (`vite build` → `dist/`).
- **SPA catch-all rewrite.** The Vite preset does **not** inject an SPA rewrite by default. Without this entry, deep links like `/dashboard/agent/abc` would 404 on direct navigation because the path doesn't map to a file in `dist/`. The rewrite hands every request to `/index.html` so React Router can take over client-side.

### `.vercelignore`

```
api/
server/
dist-server/
**/*.test.ts
e2e/
playwright.config.ts
```

This file is load-bearing. Without it, Vercel's auto-detection scans the repo and treats top-level `api/*.ts` files as serverless functions — which, on the Hobby plan, would silently hit the 12-function cap and break deploys. The ignore list excludes the Express backend (`api/`, `server/`, `dist-server/`), Playwright assets, and unit tests so Vercel sees a pure static-site build.

### Deploy trigger

Auto-deploy is via the **Vercel GitHub App** integration (project → Git → connect). Every push to `main` triggers a production build; every push to a non-main branch creates a preview deployment. There is no GitHub Actions workflow involved in the frontend deploy — the GHA workflow (`test.yml`) only gates PRs, it does not deploy.

### Env-var scopes

Vercel exposes three env-var scopes: **Production**, **Preview**, **Development**. The build embeds `VITE_*` values at compile time, so divergence between scopes is real (a preview build can point at a different backend URL than production). For this project we set every `VITE_*` var in **all three scopes** so previews behave identically to production unless we deliberately split them.

---

## 3. Render side

The backend is described entirely by `render.yaml` — Render reads it on service creation as a Blueprint and re-applies it on each manual deploy. Several lines carry irreversible or correctness-critical invariants.

### `render.yaml` highlights

| Setting | Value | Why it matters |
|---|---|---|
| `runtime` | `node` | Native Node runtime (not Docker). |
| `region` | `singapore` | **IRREVERSIBLE after service creation.** Picked to minimise the hop to Supabase in Tokyo (`ap-northeast-1`) while keeping Uganda → Render latency reasonable. Moving regions requires creating a new service and re-pointing DNS. |
| `branch` | `main` (post-cutover) | Render tracks one branch per service. The file in-tree still references the pre-cutover cleanup branch; swap to `main` in the Render dashboard once stable. |
| `autoDeployTrigger` | `off` | **No auto-deploy on push.** Mirrors the [`CLAUDE.md §1`](../CLAUDE.md) guardrail: "do not push to main without explicit approval." Deploys must be triggered manually via the Render dashboard or by hitting the Deploy Hook URL. |
| `healthCheckPath` | `/healthz` | Render polls this; a non-200 fails the deploy or marks the instance unhealthy. The Express server registers `/healthz` before Helmet/CORS so the response stays minimal. |
| `buildCommand` | `npm ci --include=dev && npm run build:api && npm prune --omit=dev` | The `--include=dev` flag is required because Render sets `NODE_ENV=production` during build. `npm ci` would otherwise skip the `@types/*`, `tsx`, `@vercel/node`, and `@sentry/react` devDeps that `build:api` (TypeScript compile) and any transitive imports need. After build, `npm prune --omit=dev` strips the devDeps back out so the runtime container ships only production deps. |
| `startCommand` | `node dist-server/server/index.js` | Compiled output of `tsc -p server/tsconfig.json`. |
| `plan` | `free` | See free-tier limits below. |

### Free-tier limits (cap on this service)

- **750 instance-hours/month** across all free services on the account (a single always-on service uses ~720 hr/mo, so we run very close to the cap).
- **Sleeps after 15 min of inactivity.** Cold-start is ~30-60 s — hence the keepalive crons in §7.
- **No Slack/Discord webhooks for alerts** (paid feature). Email-only alerting via cron-job.org for failure notification (see [`render-operational.md`](./render-operational.md) § Failure Alerting).
- **~7-day log retention.** Older logs are lost; structured logging + Sentry compensate.

### Secrets posture

Every secret in `envVars` uses `sync: false`, which means the Blueprint declares the env var exists but the value is **set manually in the Render dashboard** and never committed. The list (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SENTRY_DSN`) is enumerated in the matrix below.

---

## 4. Env-var sync matrix

Every env var the system needs, where it lives, and which surfaces consume it. **All Vercel rows must be set in Production, Preview, and Development scopes** unless a row says otherwise.

| Variable | Vercel scope | Render | GHA secrets |
|---|---|---|---|
| `VITE_SUPABASE_URL` | All 3 scopes | — | Yes (for E2E `e2e/fixtures/db.ts`) |
| `VITE_SUPABASE_ANON_KEY` | All 3 scopes | — | Yes |
| `VITE_USE_SUPABASE` | All 3 scopes (`true` in Prod/Preview, optional in Dev) | — | — |
| `VITE_API_BASE_URL` | All 3 scopes (points at Render URL `/api`) | — | — (CI uses `http://localhost:3001/api`) |
| `SUPABASE_URL` | — | Yes (server-side rename of `VITE_SUPABASE_URL`) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | — (NEVER expose to frontend) | Yes | Yes (E2E direct-DB writes) |
| `SUPABASE_JWT_SECRET` | — | Yes (must match Supabase `Dashboard → API → JWT Settings` verbatim) | Yes (E2E mints test JWTs) |
| `SENTRY_DSN` | — (frontend reads `VITE_SENTRY_DSN` if wired later) | Yes | — |
| `NODE_VERSION` (`=22`) | — | Yes (Blueprint envVars block) | — (matrix sets node-version in workflow) |
| `NPM_CONFIG_PRODUCTION` (`=false`) | — | Yes (belt-and-suspenders for `npm ci --include=dev`) | — |
| `PORT` (`=3001`) | — | Yes (Render also auto-injects `PORT` at runtime — explicit value documents intent) | — |

**Notes on individual rows:**

- `VITE_SUPABASE_URL` vs `SUPABASE_URL`. The frontend reads the `VITE_`-prefixed name because Vite only exposes vars with the `VITE_` prefix to client code. The server reads the un-prefixed name. They point at the same Supabase project — just two different env-var keys for the same URL.
- `SUPABASE_JWT_SECRET`. Must be the project's HS256 signing secret copied verbatim. If it drifts, `withOptionalAuth` silently fails open and requests look unauthenticated. Rotation procedure in [`render-operational.md`](./render-operational.md) § JWT secret rotation.
- `VITE_API_BASE_URL`. In local dev: `http://localhost:3001/api`. In Vercel: `https://uganda-dashboard-api.onrender.com/api`. Vite bakes this at build time so per-environment values can legitimately diverge (staging Render vs prod Render).
- Optional frontend overrides documented in `.env.local.example` (`VITE_LEGAL_TERMS_URL`, `VITE_SUPPORT_WHATSAPP_URL`, `VITE_MAP_TILE_URL`, …) are not in the matrix because they have sensible defaults in `src/config/env.js` and only need to be set when overriding.
- `SUPABASE_DB_URL` (in `.env.local.example`) is **local-only** for the seed script. Never set on Vercel or Render.

---

## 5. Local dev

Two terminals or one — pick the workflow that matches your editor habits.

### One-terminal (recommended)

```sh
npm run dev:all
```

Launches Vite (`:5173`) and the Express backend (`:3001`) concurrently via `concurrently -k -n vite,api`. Both processes share the terminal; Ctrl-C kills both cleanly.

### Two-terminal

```sh
# Terminal 1
npm run dev          # Vite on :5173

# Terminal 2
npm run dev:api      # Express on :3001
```

`npm run dev:api` is wired as `dotenv -e .env.local -- tsx watch server/index.ts`, so the Express process reads the **same `.env.local`** that the seed scripts and Playwright fixtures use. No separate env file needed for the backend in dev.

### First-time setup

```sh
cp .env.local.example .env.local   # then fill Supabase URL/anon key/service-role key/JWT secret
npm install                         # legacy-peer-deps=true is set in .npmrc
npm run dev:all
```

The frontend will fall back to mock data if `VITE_USE_SUPABASE=false` (rollback flag) — useful for offline work or when Supabase is down.

---

## 6. CI deploy posture

The repo's CI workflow (`.github/workflows/test.yml`) is a **PR gate**, not a deploy step. It runs lint → vitest → `build:api` (TypeScript compile gate) → Playwright matrix on every PR and on every push to `main`. It does **not** deploy anywhere.

Frontend and backend follow opposite trigger postures:

- **Vercel (frontend).** Auto-deploys on push to `main` via the Vercel GitHub App. The PR gate must be green for the merge, after which Vercel rebuilds the static bundle. No GHA workflow involved.
- **Render (backend).** Manual-only. `autoDeployTrigger: off` in `render.yaml` is deliberate. After merging to `main`, you must trigger Render via the dashboard (Deploy → Deploy latest commit) or the Deploy Hook URL.

The asymmetry is intentional: a static-asset rollback on Vercel is one click; a Render deploy carries a ~30-60s outage window on free-tier and benefits from being a conscious act. See [`render-operational.md`](./render-operational.md) for the full manual deploy and rollback procedures.

---

## 7. Cold-start mitigation

Render free-tier services sleep after 15 min of inactivity. The first request after sleep takes ~30-60 s to wake the Node process and re-establish the Supabase connection — unacceptable for a sales-demo platform where prospects are watching the screen.

Three layered mitigations:

- **`.github/workflows/keepalive.yml`** — GitHub Actions cron at `*/14 * * * *` hits `/healthz`. GHA cron has 5-15 min real-world jitter, so 14 min is the effective floor that keeps the instance under the free-tier ceiling (~750 instance-hr/mo with a slight buffer). Failure of a single ping is non-critical; the workflow logs a non-200 and exits.
- **cron-job.org backup pinger** — runs every 5 min as redundant coverage. Configured to email the team on failure (covers the case where the GHA cron is silently disabled or de-prioritised). Configuration steps in [`render-operational.md`](./render-operational.md) § Failure Alerting.
- **`useWarmup()` hook** (`src/main.jsx`). On app mount the React tree pings `/healthz` and shows a global warmup banner for up to 3 seconds (the banner dismisses on the first 2xx or on the 3 s timeout, whichever comes first). This guarantees that even if both crons are stale and the user is the first request after sleep, they see a clear "waking the server" message rather than a frozen UI.

For alert-routing config, log-retention behaviour, and what to do when keepalive itself fails, see [`render-operational.md`](./render-operational.md).

---

## 8. Rollback

For the full rollback procedure (Vercel revert, Render redeploy-previous, Supabase migration revert protocol), see [`render-operational.md`](./render-operational.md).

This document covers the **config layer only**. Anything procedural — what to click, what to revert, who to notify, how to confirm — lives in the operational runbook.
