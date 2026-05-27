// Vercel-handler → Express-middleware adapter.
//
// All 14 production handlers were authored against Vercel's
// `(req: VercelRequest, res: VercelResponse) => Promise<void>` shape. Under
// Express we want to re-use them verbatim — no rewrites, no per-handler
// shims. The `req`/`res` runtime objects are interchangeable between the
// two stacks for the surface area this codebase uses (`req.method`,
// `req.body`, `req.headers`, `req.user`, `res.status()`, `res.json()`,
// `res.setHeader()` — verified across N1-N4 in the audit), but the
// TypeScript types are nominally distinct. We bridge them with a
// double-cast via `unknown` (G4) — cheaper than maintaining parallel
// handler signatures, and the casts live in one place.
//
// Errors are forwarded to Express's error middleware via `next(err)` so the
// final error handler in `server/index.ts` (G64) handles them centrally and
// can hand them to Sentry. Do NOT swallow with `res.status(500).json(...)`
// here — that would short-circuit observability.

import type { VercelRequest, VercelResponse, VercelApiHandler } from '@vercel/node';
import type { Request, Response, RequestHandler } from 'express';

export function toExpress(handler: VercelApiHandler): RequestHandler {
  return async (req: Request, res: Response, next) => {
    try {
      await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    } catch (err) {
      next(err);
    }
  };
}
