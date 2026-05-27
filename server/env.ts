// Server-side environment preflight.
//
// Replaces the two top-level `throw`s in `api/_lib/supabase-admin.ts` and
// `api/_lib/jwt.ts` (B1). Those throws would crash the entire Express
// process on module load if a single env var was missing — including
// `/healthz`, which would push Render into a redeploy loop with no
// recoverable signal. Centralising the check here, after Sentry.init but
// before `app.listen`, lets boot failures surface as a single readable
// error in Render's log stream listing ALL missing keys at once (G5).
//
// `SUPABASE_URL` is the new server-side name (G19). During the Vercel
// → Render cutover we still accept `VITE_SUPABASE_URL` as a fallback —
// once every deploy has the renamed var, the fallback can drop in a
// follow-up commit.

const REQUIRED_KEYS = [
  // Listed first so an aggregated error message reads naturally.
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
] as const;

export function assertServerEnv(): void {
  const missing: string[] = [];

  // G19 — fall back to `VITE_SUPABASE_URL` during the cutover. Once Render +
  // every deploy carries `SUPABASE_URL`, drop the fallback in a follow-up.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    missing.push('SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!process.env.SUPABASE_JWT_SECRET) {
    missing.push('SUPABASE_JWT_SECRET');
  }

  if (missing.length > 0) {
    // Single throw listing every missing key — operators fix all of them in
    // one redeploy instead of chasing them one at a time.
    throw new Error(
      `[env] missing required server env vars: ${missing.join(', ')}. ` +
        `Required: ${REQUIRED_KEYS.join(', ')}.`
    );
  }
}
