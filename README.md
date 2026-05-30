# Universal Pensions Uganda

A digital pension platform making long-term retirement savings simple, accessible, and meaningful for every Ugandan. Licensed and regulated by the Uganda Retirement Benefits Regulatory Authority (URBRA).

**Live:** [uganda-dashboard.vercel.app](https://uganda-dashboard.vercel.app)

> This repo is a **demo / sales-presentation tool** that sales reps walk prospects through — it is NOT a production fintech. Mocked OTP, mocked KYC, hardcoded unit price, and a 24-hour fixed JWT are intentional demo scope (see [`claude.md §10a`](./claude.md)).

## Overview

The codebase covers four surfaces:

1. **Public landing page** (`/`) — scrollytelling marketing site that demos 40 years of compounded savings via scroll-linked animation.
2. **Signup / KYC flow** (`/signup/*`) — 9-step subscriber onboarding (phone OTP, NIRA ID OCR, NIRA verify, face match, AML screen, agent fallback).
3. **Role dashboards** (`/dashboard/...`) — Current role-build state: see [`claude.md §1`](./claude.md) (subscriber / agent / branch / distributor live; employer and admin deferred).
4. **Express backend on Render** (`server/index.ts` mounts `api/*.ts`) — 14 routes covering auth, KYC mocks, contact, chat. Singapore region, Node 22, free tier. Database is Supabase (Postgres + RLS + custom HS256 JWT via `jose`).

## Tech stack

| Tool | Version |
| --- | --- |
| React | 19 |
| Vite | 6.3 |
| Express | 5 |
| Node | 22 |
| Supabase | Postgres + RLS + PostgREST |
| Playwright | 1.60 |
| Vitest | 4 |
| Framer Motion | 12 |
| TanStack Query | 5 |
| Leaflet | 1.9 |
| Recharts | 3 |

Frontend uses JSX (no TypeScript). Backend uses TypeScript via NodeNext. Styling is CSS Modules (no Tailwind, no component library) with design tokens in `src/index.css`. React Router 7 handles top-level navigation; TanStack Virtual 3 backs long lists; `jose` signs/verifies the custom HS256 JWT; ESLint 9 flat config gates lint.

## Quick start

```sh
# 1. Install (legacy-peer-deps is set in .npmrc)
npm install --legacy-peer-deps

# 2. Copy the env template and fill in the keys
cp .env.local.example .env.local
# Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#           SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET,
#           SUPABASE_DB_URL (for the seed script — do NOT run `vercel env pull`,
#           it overwrites this file. See BACKEND.md §2).
```

First-time setup: `cp .env.local.example .env.local` and fill in the Supabase keys.

Then pick one of three dev-server flows:

```sh
# Option A — Vite only (frontend at :5173); pair with `npm run dev:api` in a second terminal
npm run dev

# Option B — Express only (backend at :3001); pair with `npm run dev` in a second terminal
npm run dev:api

# Option C — both servers in one terminal (recommended)
npm run dev:all
```

> **Local dev = two terminals** (`npm run dev` + `npm run dev:api`) or one terminal via `npm run dev:all`. **Production = Vercel (frontend) + Render (backend).** See [`docs/render-operational.md`](./docs/render-operational.md) for the Render runbook.

## npm scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on http://localhost:5173 (frontend only) |
| `npm run dev:api` | Express backend on http://localhost:3001 (`tsx watch server/index.ts`) |
| `npm run dev:all` | Both servers in one terminal via `concurrently` |
| `npm run build` | Production Vite build |
| `npm run build:api` | `tsc -p server/tsconfig.json` — used by Render's build command and CI |
| `npm run start` | Run the compiled backend (`node dist-server/server/index.js`) |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | ESLint flat-config (0 errors expected) |
| `npm test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report (`@vitest/coverage-v8` is bundled in devDependencies) |
| `npm run test:e2e` | Playwright full E2E suite |
| `npm run test:e2e:smoke` | Smoke specs only (`e2e/specs/smoke`) |
| `npm run test:e2e:flows` | Flow specs only (`e2e/specs/flows`) |
| `npm run test:e2e:headed` | Headed Playwright run |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run seed` | Seed Supabase via `scripts/seed-supabase.mjs` (~30K subscribers, 314 branches, 2K agents) |

Playwright additionally:

```sh
# One-off, fast iteration
npx playwright test path/to/spec.ts --project chromium
```

## Database

Schema lives in `supabase/migrations/*.sql` (28 numbered migrations as of 2026-05-26). State-machine writes flow through `SECURITY DEFINER` RPCs invoked with `supabase.rpc(name, args)`; direct table writes are blocked by RLS. RLS policies read `auth.jwt() ->> 'app_role'` (NOT `'role'`, which is the Postgres `authenticated` role — see [`claude.md §5`](./claude.md) anti-pattern 7).

Apply migrations with the Supabase CLI:

```sh
supabase db push    # forward apply
supabase db reset   # local-only, drops + reapplies all migrations
```

Seed demo data with `npm run seed`. Phone numbers use the synthetic `+25671XXXXXXX` range; login at the sign-in modal with any 6-digit OTP.

## Documentation map

| File | When to read |
| --- | --- |
| [`claude.md`](./claude.md) | Team orientation, hard rules, demo scope. Start here. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System patterns, layered architecture, auth flow. |
| [`FRONTEND.md`](./FRONTEND.md) | React side: services, hooks, contexts, design tokens. |
| [`BACKEND.md`](./BACKEND.md) | Express + Supabase: routes, RLS, RPCs, JWT. |
| [`docs/api-contracts.md`](./docs/api-contracts.md) | HTTP shapes + RPC catalogue. |
| [`docs/data-model.md`](./docs/data-model.md) | Entity model + aggregation rules. |
| [`docs/role-permissions.md`](./docs/role-permissions.md) | Role × capability matrix. |
| [`docs/SPEC.md`](./docs/SPEC.md) | Product spec, personas, workflows. |
| [`docs/TESTING.md`](./docs/TESTING.md) | Vitest + Playwright + CI pipeline (NEW). |
| [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) | 28-migration index grouped by concern (NEW). |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Vercel/Render/GHA config + env-var sync matrix (NEW). |
| [`docs/render-operational.md`](./docs/render-operational.md) | Render operational runbook (manual deploys, recovery, log retention). |
| [`docs/archive/`](./docs/archive/) | Historical audits and superseded docs. |

## Deployment

- **Frontend (Vercel):** Auto-deploys on push to `main` via the Vercel GitHub App. `uganda-dashboard.vercel.app`. **Do not push to `main` without explicit approval** ([`claude.md`](./claude.md) guardrail).
- **Backend (Render):** Manual deploys only (`autoDeployTrigger: off`). `uganda-dashboard-api.onrender.com`. Singapore region. See [`docs/render-operational.md`](./docs/render-operational.md) for the operational runbook.
- **CI (GitHub Actions):** `.github/workflows/test.yml` runs lint + Vitest + `build:api` (tsc gate) + Playwright. Keepalive cron at `.github/workflows/keepalive.yml`. Detail: [`docs/TESTING.md`](./docs/TESTING.md) and [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

_README is for external readers landing on GitHub. For team orientation, hard rules, and demo scope, see [`claude.md`](./claude.md)._
