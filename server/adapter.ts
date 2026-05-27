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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Request, Response, RequestHandler } from 'express';

// The 14 handlers actually return `Promise<VercelResponse>` (every one ends in
// `return res.status(...).json(...)`) — strictly broader than `@vercel/node`'s
// exported `VercelApiHandler` (which is `Promise<void>`). Declare a permissive
// signature here so the adapter accepts the real handler shape without forcing
// 14 handler rewrites.
type VercelHandler = (
  req: VercelRequest,
  res: VercelResponse
) => unknown | Promise<unknown>;

export function toExpress(handler: VercelHandler): RequestHandler {
  return async (req: Request, res: Response, next) => {
    try {
      await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    } catch (err) {
      next(err);
    }
  };
}
