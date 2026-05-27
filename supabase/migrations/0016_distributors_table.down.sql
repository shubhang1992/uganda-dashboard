-- =============================================================================
-- Universal Pensions Uganda — 0016 DOWN (manual-only rollback)
-- =============================================================================
-- This file is NOT part of the forward-only migration chain. It exists so an
-- operator can manually undo 0016_distributors_table.sql in an emergency:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0016_distributors_table.down.sql
--
-- DO NOT add it to the supabase_migrations history table. Re-applying 0016
-- after a manual rollback is safe because 0016 is itself idempotent.
--
-- WARNING: dropping the table also drops the singleton 'd-001' row that the
-- `demo_personas` fallback in api/auth/verify-otp.ts assumes exists for
-- distributor logins. The fallback ID lookup still works (it never queries
-- the table — it's a hard-coded string), but any future RPC that joins
-- `commissions` → `distributors` would fail.
-- =============================================================================

DROP POLICY IF EXISTS distributors_update_self ON public.distributors;
DROP POLICY IF EXISTS distributors_select      ON public.distributors;
DROP TABLE IF EXISTS public.distributors;

-- =============================================================================
-- End of 0016_distributors_table.down.sql
-- =============================================================================
