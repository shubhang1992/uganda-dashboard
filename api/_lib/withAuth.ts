// Middleware: require a valid Bearer JWT on a Vercel route.
//
// On success, the wrapped handler receives `req.user: JwtClaims`. On missing
// or invalid token the wrapper short-circuits with 401 `{ error: 'unauthorized' }`.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt, type JwtClaims } from './jwt.js';

export type AuthedRequest = VercelRequest & { user: JwtClaims };

export type AuthedHandler = (
  req: AuthedRequest,
  res: VercelResponse
) => void | Promise<void>;

export type VercelHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | Promise<void>;

function extractBearer(req: VercelRequest): string | null {
  // Node lowercases header keys; `authorization` is the canonical access.
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

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
