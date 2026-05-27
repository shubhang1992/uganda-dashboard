// Singleton Supabase admin client for server-side use only.
//
// Built with the SERVICE_ROLE key — bypasses RLS entirely. NEVER expose this
// client to the browser. Importers do:  `import supabaseAdmin from './supabase-admin'`.
//
// `auth.persistSession: false` is REQUIRED under the long-lived Express
// process (G66). Under Vercel each invocation was a fresh process with no
// session state to persist; on Render the same client instance handles every
// request for hours, and persistSession would attempt to write to the
// (non-existent) browser localStorage — at best a noop, at worst a memory
// leak on shared CPU. Same applies to autoRefreshToken / detectSessionInUrl.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Env preflight has moved to `server/env.ts:assertServerEnv()` (B1). Under
// the long-lived Express process a top-level `throw` here would crash the
// whole shared backend (including /healthz) and push Render into a redeploy
// loop. We rely on `assertServerEnv()` running once at server boot before
// any handler can import this module. The deferred checks below are
// defensive secondary guards: they only fire if a caller somehow imports
// this client without the boot path running first (e.g. a future script).

let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  // G19 — accept `SUPABASE_URL` (new server-side name) with a fallback to
  // `VITE_SUPABASE_URL` for backwards compatibility during the cutover.
  // Once every deploy carries `SUPABASE_URL`, drop the fallback.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      'SUPABASE_URL (or VITE_SUPABASE_URL) is not set. Expected server/env.ts:assertServerEnv() to have caught this at boot.'
    );
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Expected server/env.ts:assertServerEnv() to have caught this at boot.'
    );
  }
  cached = createClient(url, serviceKey, {
    auth: {
      // persistSession:false is required under long-lived process (G66) —
      // see header comment.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

// Default export is a Proxy that defers client creation until first use.
// This keeps top-level imports cheap and avoids throwing at module-load time
// if env vars are missing in a non-runtime context (e.g. type-checking).
const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default supabaseAdmin;
