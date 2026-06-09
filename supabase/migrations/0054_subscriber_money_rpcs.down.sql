-- =============================================================================
-- Universal Pensions Uganda — 0054 DOWN (manual-only rollback)
-- =============================================================================
-- Reverses 0054_subscriber_money_rpcs.sql. NOT part of the forward-only chain;
-- for manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0054_subscriber_money_rpcs.down.sql
--
-- Drops the two subscriber money RPCs + the money_nonces idempotency ledger.
-- Idempotent: DROP ... IF EXISTS guards make it safe to re-run. After this runs,
-- the subscriber Save / Withdraw flows fall back to their pre-0054 DIRECT
-- `transactions` / `withdrawals` writes (non-idempotent, non-atomic) — only roll
-- back if 0054 itself is the cause of a regression.
--
-- NOTE: dropping money_nonces discards the recorded contribution/withdrawal
-- nonces (data, not schema) — a replay that previously short-circuited would
-- re-run after a rollback. Acceptable for the demo.
-- =============================================================================

-- Drop the RPCs first (full argument lists — DROP FUNCTION needs the signature).
DROP FUNCTION IF EXISTS public.make_contribution(text, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.request_withdrawal(text, numeric, text, text, text, numeric, numeric);

-- Drop the idempotency ledger (no dependents once the RPCs are gone).
DROP TABLE IF EXISTS public.money_nonces;

-- =============================================================================
-- End of 0054_subscriber_money_rpcs.down.sql
-- =============================================================================
