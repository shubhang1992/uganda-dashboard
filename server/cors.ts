// CORS configuration for the Render-hosted Express API.
//
// The single regex below covers the URL patterns Vercel issues to the
// frontend project (N15 — Vercel reserves the `uganda-dashboard*` namespace
// to the owning team, so no attacker can squat a matching subdomain):
//   1. Production alias (bare)     — https://uganda-dashboard.vercel.app
//   2. Production alias (team)     — https://uganda-dashboard-<team>.vercel.app
//   3. Git-branch preview          — https://uganda-dashboard-git-<branch>-<team>.vercel.app
//   4. Deployment-hash preview     — https://uganda-dashboard-<hash>-<team>.vercel.app
//
// The optional `(-[\w-]+)?` group makes the team / branch / hash suffix
// optional so the bare production URL matches too — the audit's original
// `uganda-dashboard-.*` regex required a trailing dash and missed the
// bare production alias.
//
// Calls without an `Origin` header (curl, Render's healthcheck pinger, the
// GHA keepalive cron) hit the callback with `origin === undefined`; we let
// them through (G3) so server-to-server pings don't fail CORS preflight.
//
// `maxAge: 86400` caches preflight for 24h in compliant browsers (B24).
// Chrome caps at 2h regardless; Firefox honours the full day. This is a
// substantial cold-start UX win: every API call beyond the first no longer
// pays a preflight round-trip (~200-400ms cross-origin from Uganda).
//
// `Authorization`, `Content-Type`, and `X-QA-Force` (src/services/kyc.js:248)
// rely on the `cors` package's default behaviour of mirroring whatever the
// browser asked for via `Access-Control-Request-Headers`. If `allowedHeaders`
// is ever set explicitly, list all three of them — silent breakage otherwise.

import type cors from 'cors';

const VERCEL_PREVIEW_RE = /^https:\/\/uganda-dashboard(-[\w-]+)?\.vercel\.app$/;

export const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    // No-Origin requests: curl, Render's healthcheck pinger, server-to-server
    // GHA cron. Always allowed — these can't carry credentials anyway.
    if (!origin) {
      return cb(null, true);
    }
    if (VERCEL_PREVIEW_RE.test(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  maxAge: 86400,
};
