// Express server entry — bootstraps the Render-hosted backend.
//
// Registration order is LOAD-BEARING (G70). Each block below is numbered so
// reviewers can confirm the invariant against the audit's middleware-order
// spec at a glance. Reordering blocks will silently break:
//   - Sentry capture (must initialise before any module that may throw)
//   - rate-limit IP detection (needs trust-proxy first)
//   - access logging (must wrap routes, not be wrapped by them)
//   - healthcheck reachability (must be reachable BEFORE route mounts so a
//     misconfigured deploy can still report status via /healthz)
//
// Do NOT add the 15th /api/auth/logout route (G51 — logout is intentionally
// client-only; the demo's 24h HS256 token has no refresh + no revocation).

// ─── 0. Sentry side-effect init (must precede any express() / handler import)
import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

// ─── 1. Env preflight (B1) — fail loudly before app.listen
import { assertServerEnv } from './env.js';
assertServerEnv();

// ─── 2. Imports
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { corsOptions } from './cors.js';
import { toExpress } from './adapter.js';

// 14 handler imports — every handler exports a Vercel-shaped default. NodeNext
// requires the `.js` extension on relative imports even when the source is
// `.ts` (B2 pattern).
import sendOtp from '../api/auth/send-otp.js';
import verifyOtp from '../api/auth/verify-otp.js';
import verifyPassword from '../api/auth/verify-password.js';
import changePassword from '../api/auth/change-password.js';
import kycOtpSend from '../api/kyc/otp-send.js';
import kycOtpVerify from '../api/kyc/otp-verify.js';
import idOcr from '../api/kyc/id-ocr.js';
import idQuality from '../api/kyc/id-quality.js';
import faceMatch from '../api/kyc/face-match.js';
import amlScreen from '../api/kyc/aml-screen.js';
import niraVerify from '../api/kyc/nira-verify.js';
import agentReferral from '../api/kyc/agent-referral.js';
import contact from '../api/contact.js';
import chat from '../api/chat.js';

const app = express();

// ─── 3. Trust proxy (G1) — required for express-rate-limit to read req.ip
// correctly behind Render's edge proxy. Render forwards via X-Forwarded-For;
// without trust-proxy, every request appears to come from 127.0.0.1 and the
// rate limiter would either treat the whole world as one client or get
// confused into 502s.
app.set('trust proxy', 1);

// ─── 4. Sentry request handler — MUST be before other middleware so any
// error in helmet/cors/json-parsing is captured. Guarded so an unset DSN
// (local dev, PR previews) doesn't crash with "Sentry not initialised."
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
}

// ─── 5. Security + parsing middleware (G17, G3, G2, G1)
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '200kb' })); // G2 — 25× smaller than the plan's draft 5mb; no handler needs more
app.use(compression());

// ─── 6. Access log with pinned format (G17, G68). Render captures stdout so
// `morgan` writing to process.stdout lands in the platform log stream with
// no extra wiring. Format choice: human-readable, includes :response-time
// (cold-start regressions become visible in the access log without
// chasing Render's metrics page).
app.use(
  morgan(':method :url :status :response-time ms - :res[content-length]')
);

// ─── 7. /healthz — registered BEFORE any route mounts (G16, G70). Must
// remain I/O-free so a misconfigured Supabase deploy can still surface as
// `service up, env wrong` instead of being mistaken for a network outage.
// Render's healthcheck has a 5s timeout; a Supabase round-trip here would
// blow that on a cold start and trip an unnecessary redeploy.
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

// ─── 8. Rate limiters (G18) — applied per-route below, NOT globally. Four
// unauthenticated side-effect routes are the only ones that need protection;
// limiting the whole API would hurt legitimate signup flows where a single
// session fires 4-5 sequential KYC calls in <10s.
// Returns the same `{ code: 'rate_limited' }` shape `verify-otp` already
// produces (api/auth/verify-otp.ts:20), so the frontend's existing
// error-vocab handling needs no changes.
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'rate_limited' },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'rate_limited' },
});

// ─── 9. 14 route mounts (B5) — `app.all` is REQUIRED. Every handler
// performs its own method check + emits `{ code: 'method_not_allowed' }`
// with `Allow: POST` for non-POST traffic. `app.post` would silently
// route non-POSTs to Express's default 404 HTML page, breaking the
// documented 405 JSON envelope the e2e suite asserts against.
app.all('/api/auth/send-otp', toExpress(sendOtp));
app.all('/api/auth/verify-otp', authLimiter, toExpress(verifyOtp)); // G18 — write + JWT mint
app.all('/api/auth/verify-password', authLimiter, toExpress(verifyPassword)); // G18 — bcrypt CPU + credential-stuffing vector
app.all('/api/auth/change-password', toExpress(changePassword));
app.all('/api/kyc/otp-send', toExpress(kycOtpSend));
app.all('/api/kyc/otp-verify', toExpress(kycOtpVerify));
app.all('/api/kyc/id-ocr', toExpress(idOcr));
app.all('/api/kyc/id-quality', toExpress(idQuality));
app.all('/api/kyc/face-match', toExpress(faceMatch));
app.all('/api/kyc/aml-screen', toExpress(amlScreen));
app.all('/api/kyc/nira-verify', toExpress(niraVerify));
app.all('/api/kyc/agent-referral', writeLimiter, toExpress(agentReferral)); // G18 — DB insert (spam to agent_referrals)
app.all('/api/contact', writeLimiter, toExpress(contact)); // G18 — DB insert (spam to contact_submissions)
app.all('/api/chat', toExpress(chat));

// ─── 10. Sentry error handler — MUST come after routes, before custom error
// handlers. Captures any error that bubbled through `next(err)` from the
// adapter.
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// ─── 11. Final 404 — catches anything that didn't match a route mount.
app.use((_req, res) => {
  res.status(404).json({ code: 'not_found' });
});

// ─── 12. Final error handler — last line of defense. Logs to stdout (Render
// captures it) and emits the same `{ code: 'unexpected_error' }` shape the
// frontend already maps. Guarded against double-send (Sentry's handler may
// have already responded).
app.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err);
    if (!res.headersSent) {
      res.status(500).json({ code: 'unexpected_error' });
    }
  }
);

// ─── 13. Boot
const PORT = Number(process.env.PORT ?? 3001);
const server = app.listen(PORT, () => {
  // Boot log per G5 — operators grep `[boot] env ok` to confirm a deploy
  // got past the preflight check. Listing the var names (not values) makes
  // the line useful without leaking secrets.
  console.log(
    `[boot] env ok: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET; listening on :${PORT}`
  );
});

// ─── 14. Graceful shutdown (G16, G45) — 25s grace covers worst-case in-flight
// handler: id-ocr's ~2.2s simulated latency plus an awaited Supabase insert
// in agent-referral. SIGINT is for Ctrl-C parity in local dev; SIGTERM is
// what Render sends on deploy / autoscale events.
const shutdown = (signal: string) => {
  console.log(`[shutdown] received ${signal}, closing server`);
  server.close(() => process.exit(0));
  // .unref() so the timer doesn't keep the event loop alive when
  // server.close() has already finished cleanly.
  setTimeout(() => process.exit(1), 25_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── 15. Crash recovery (G64) — log via Sentry then exit non-zero so Render
// restarts cleanly. Without these, a bug in a handler can leave the process
// in a half-dead state where /healthz still returns 200 but every other
// route 500s — Render won't restart and ops see ghost traffic.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
  process.exit(1);
});
