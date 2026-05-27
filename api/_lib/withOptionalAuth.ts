// Middleware: attach `req.user: JwtClaims | null` without rejecting.
//
// Used by `/api/chat` so role-aware responses fall out naturally for signed-in
// users while still serving anonymous prospects on the landing page.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt, type JwtClaims } from './jwt.js';
import { extractBearer } from './bearer.js';

export type MaybeAuthedRequest = VercelRequest & { user: JwtClaims | null };

export type MaybeAuthedHandler = (
  req: MaybeAuthedRequest,
  res: VercelResponse
) => void | Promise<void>;

export type VercelHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | Promise<void>;

export function withOptionalAuth(handler: MaybeAuthedHandler): VercelHandler {
  return async (req, res) => {
    const maybeReq = req as MaybeAuthedRequest;
    maybeReq.user = null;
    const token = extractBearer(req);
    if (token) {
      try {
        maybeReq.user = await verifyJwt(token);
      } catch {
        // Swallow — treat invalid tokens as anonymous rather than rejecting.
        maybeReq.user = null;
      }
    }
    await handler(maybeReq, res);
  };
}

export default withOptionalAuth;
