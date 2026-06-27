// Middleware: attach `req.user: JwtClaims | null` without rejecting.
//
// Used by `/api/chat` so role-aware responses fall out naturally for signed-in
// users while still serving anonymous prospects on the landing page.
//
// ⚠️ SECURITY — THIS MIDDLEWARE FAILS OPEN. ⚠️
// A missing, malformed, expired, or forged token does NOT reject the request:
// `req.user` is simply left `null` and the handler runs anonymously (see the
// swallowed catch below). This is intentional ONLY for routes that are safe to
// serve to anonymous callers and merely *enhance* the response when a valid
// session happens to be present.
//
// NEVER use `withOptionalAuth` to:
//   - return per-user / per-tenant data (it cannot prove who the caller is), or
//   - gate an authorization-protected action.
// A handler that reads `req.user.subscriberId` (etc.) behind this middleware
// will crash on anonymous calls and — worse — trusts whatever claims an
// unverified-but-present token carries. For anything that must be authenticated
// or authorized, verify the token explicitly (extractBearer + verifyJwt, with a
// 401 on a bad/absent token) the way change-password.ts does.

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
