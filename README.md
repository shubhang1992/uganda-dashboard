# Universal Pensions Uganda

A digital pension platform making long-term retirement savings simple, accessible, and meaningful for every Ugandan. Licensed and regulated by the Uganda Retirement Benefits Regulatory Authority (URBRA).

**Live:** [uganda-dashboard.vercel.app](https://uganda-dashboard.vercel.app)

> This repo is a **demo / sales-presentation tool** that sales reps walk prospects through — it is NOT a production fintech. Mocked OTP, mocked KYC, hardcoded unit price, and a 24-hour fixed JWT are intentional demo scope (see `CLAUDE.md §10a`).

## Overview

The codebase covers four surfaces:

1. **Public landing page** (`/`) — scrollytelling marketing site that demos 40 years of compounded savings via scroll-linked animation.
2. **Signup / KYC flow** (`/signup/*`) — 9-step subscriber onboarding (phone OTP, NIRA ID OCR, NIRA verify, face match, AML screen, agent fallback).
3. **Role dashboards** (`/dashboard/...`) — currently live for Subscriber, Agent, Branch, Distributor. Employer + Admin roles are deferred.
4. **Vercel serverless backend** (`api/*.ts`) — 14 routes covering auth, KYC mocks, contact, chat. Database is Supabase (Postgres + RLS + custom HS256 JWT via `jose`).

## Tech stack

- **React 19** (JSX, no TypeScript on the frontend)
- **Vite 6.3.5** dev server + production builder
- **React Router 7** for top-level navigation
- **TanStack Query 5** for server state; **TanStack Virtual 3** for long lists
- **Framer Motion 12** for scroll-linked + entrance animation
- **CSS Modules** (no Tailwind, no component library) — design tokens in `src/index.css`
- **Leaflet 1.9** + **Recharts 3** for the distributor map and charts
- **Vercel serverless** TypeScript handlers in `api/` (Node 22)
- **Supabase** (Postgres + RLS + PostgREST). 28 migrations under `supabase/migrations/`.
- **jose** for custom HS256 JWT signing/verification
- **Playwright 1.60** for E2E (browser-driven full-app suite under `e2e/`)
- **Vitest 4** for unit tests
- **ESLint 9** flat config

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

# 3. Frontend-only dev (uses mock data if VITE_USE_SUPABASE=false)
npm run dev

# 4. Frontend + /api routes locally (vercel dev — requires Vercel CLI)
npm run dev:api
```

## npm scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on http://localhost:5173 (frontend only) |
| `npm run dev:api` | `vercel dev` — frontend + `api/*` routes |
| `npm run build` | Production Vite build |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | ESLint flat-config (0 errors expected) |
| `npm test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report (install `@vitest/coverage-v8` first — not in `package.json` by default) |
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

Schema lives in `supabase/migrations/*.sql` (28 numbered migrations as of 2026-05-26). State-machine writes flow through `SECURITY DEFINER` RPCs invoked with `supabase.rpc(name, args)`; direct table writes are blocked by RLS. RLS policies read `auth.jwt() ->> 'app_role'` (NOT `'role'`, which is the Postgres `authenticated` role — see CLAUDE.md §5 anti-pattern 7).

Apply migrations with the Supabase CLI:

```sh
supabase db push    # forward apply
supabase db reset   # local-only, drops + reapplies all migrations
```

Seed demo data with `npm run seed`. Phone numbers use the synthetic `+25671XXXXXXX` range; login at the sign-in modal with any 6-digit OTP.

## Documentation map

- **`CLAUDE.md`** — slim entry index. Hard rules, anti-patterns, demo scope, brand colours.
- **`FRONTEND.md`** — services, hooks, contexts, dashboard variants, signup flow, design tokens.
- **`BACKEND.md`** — env vars, API route inventory, auth flow, schema, RPCs, RLS, commission state machine, seeding.
- **`ARCHITECTURE.md`** — layered patterns, role boundaries, auth model, realtime + write patterns.
- **`docs/api-contracts.md`** — HTTP request/response shapes for the 14 API routes + RPC catalogue.
- **`docs/data-model.md`** — field-level entity model + aggregation rules.
- **`docs/role-permissions.md`** — role × capability matrix.
- **`docs/SPEC.md`** — product spec, personas, workflows.
- **`docs/archive/`** — historical/superseded docs.

## Deployment

Auto-deploy to Vercel on push to `main`. Do not push without explicit approval — production preview shares the same Supabase project as local dev. Environment variables are managed in the Vercel dashboard (do NOT run `vercel env pull` — it overwrites `.env.local` and wipes `SUPABASE_DB_URL`).
