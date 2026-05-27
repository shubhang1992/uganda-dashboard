// Supabase singleton client + token helpers.
//
// Token lifecycle:
//   - `setToken(token)` after a successful `verifyOtp` (called by AuthContext.login).
//   - `getToken()` reads localStorage; returned to anything that needs to inspect it.
//   - `clearToken()` on logout (called by AuthContext.logout).
//   - The `accessToken` callback below is invoked by supabase-js on every
//     request; it re-reads localStorage so the freshest JWT is sent and
//     PostgREST's `auth.jwt()` reflects the current session inside RLS.
//
// Why `accessToken`, not `global.headers`: supabase-js coerces `global.headers`
// through `new Headers(...)` which silently drops a function — the user JWT
// never reached PostgREST and RLS denied every subscriber/agent/branch read,
// surfacing as "No account found" on the dashboard. `accessToken` is the
// supported third-party-JWT hook (see @supabase/supabase-js SupabaseClient,
// `getAccessToken()` → `Authorization: Bearer …`). When the callback returns
// null/empty, supabase-js falls back to the anon key — same behaviour as the
// pre-login state.
//
// 401 handling: supabase-js does NOT expose a generic per-response hook. Service
// callers that fall back to `apiFetch` (services/api.js) get 401 detection via
// `onAuthExpired` listeners there. For supabase-js calls, downstream services
// (agents 9-12) should inspect each `.from()` / `.rpc()` error and forward
// PGRST301 / 401-equivalent errors to the same `onAuthExpired` channel.

import { createClient } from '@supabase/supabase-js';

const TOKEN_KEY = 'upensions_token';

/** localStorage can throw in private-browsing modes; treat as missing. */
function safeRead(key) {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeWrite(key, value) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    /* ignore — token lives in memory only this session */
  }
}
function safeRemove(key) {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getToken() {
  return safeRead(TOKEN_KEY);
}
export function setToken(token) {
  if (!token) {
    safeRemove(TOKEN_KEY);
    return;
  }
  safeWrite(TOKEN_KEY, token);
}
export function clearToken() {
  safeRemove(TOKEN_KEY);
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const IS_DEV = import.meta.env.DEV === true;

// In dev with the rollback flag flipped off (or with no `.env.local` at all),
// we still want a valid client construction so imports don't blow up — the
// services that gate on `VITE_USE_SUPABASE=false` will short-circuit before
// any network call. In any non-dev build (production, preview, vercel dev with
// NODE_ENV=production) a missing URL/anon key is a hard failure: the previous
// silent fallback to `localhost:54321` / `'public-anon-key'` shipped broken
// builds to prod with no signal until the first failed request.
function resolveUrl() {
  if (SUPABASE_URL) return SUPABASE_URL;
  if (!IS_DEV) {
    throw new Error('VITE_SUPABASE_URL is not set. Add it to .env.local — see .env.local.example.');
  }
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL is unset — falling back to http://localhost:54321 (dev only). Add it to .env.local — see .env.local.example.',
  );
  return 'http://localhost:54321';
}

function resolveAnonKey() {
  if (SUPABASE_ANON_KEY) return SUPABASE_ANON_KEY;
  if (!IS_DEV) {
    throw new Error('VITE_SUPABASE_ANON_KEY is not set. Add it to .env.local — see .env.local.example.');
  }
  console.warn(
    '[supabaseClient] VITE_SUPABASE_ANON_KEY is unset — falling back to a placeholder (dev only). Add it to .env.local — see .env.local.example.',
  );
  return 'public-anon-key';
}

const url = resolveUrl();
const anon = resolveAnonKey();

export const supabase = createClient(url, anon, {
  // Third-party JWT hook: supabase-js calls this on every PostgREST/Realtime
  // request to mint the `Authorization: Bearer …` header. Returning null
  // (no session) makes supabase-js fall back to the anon key, which is the
  // correct behaviour for public reads. Setting this option disables the
  // built-in supabase.auth client — that's fine, we don't use it.
  accessToken: async () => safeRead(TOKEN_KEY),
});

export default supabase;
