// Singleton Supabase admin client for server-side use only.
//
// Built with the SERVICE_ROLE key — bypasses RLS entirely. NEVER expose this
// client to the browser. Importers do:  `import supabaseAdmin from './supabase-admin'`.
//
// `auth.persistSession: false` because serverless functions are stateless;
// there is no per-invocation user session to keep around.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error('VITE_SUPABASE_URL is not set');
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  cached = createClient(url, serviceKey, {
    auth: {
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
