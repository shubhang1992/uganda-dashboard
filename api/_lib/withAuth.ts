// Middleware: require a valid Bearer JWT on a Vercel route.
//
// On success, the wrapped handler receives `req.user: JwtClaims`. On missing
// or invalid token the wrapper short-circuits with 401 `{ error: 'unauthorized' }`.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt, type JwtClaims } from './jwt.js';
import { extractBearer } from './bearer.js';

export type AuthedRequest = VercelRequest & { user: JwtClaims };

export type AuthedHandler = (
  req: AuthedRequest,
  res: VercelResponse
) => void | Promise<void>;

export type VercelHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | Promise<void>;

export function withAuth(handler: AuthedHandler): VercelHandler {
  return async (req, res) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    let claims: JwtClaims;
    try {
      claims = await verifyJwt(token);
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const authedReq = req as AuthedRequest;
    authedReq.user = claims;
    await handler(authedReq, res);
  };
}

export default withAuth;
