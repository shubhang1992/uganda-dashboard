// Shared helper: extract a Bearer token from a Vercel request.
//
// Returns the trimmed token string when the `Authorization` header is present
// and well-formed (`Bearer <token>`), or `null` otherwise. Centralised here so
// `withAuth`, `withOptionalAuth`, and any route doing inline JWT verification
// agree on the exact parsing rules.

import type { VercelRequest } from '@vercel/node';

export function extractBearer(req: VercelRequest): string | null {
  // Node lowercases header keys; `authorization` is the canonical access.
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export default extractBearer;
