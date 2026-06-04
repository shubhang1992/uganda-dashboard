-- =============================================================================
-- Universal Pensions Uganda — 0040 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0040_post_restore_cleanup.sql. NOT part of the forward-only chain; for
-- manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0040_post_restore_cleanup.down.sql
--
-- Restores the pre-0040 state with ONE deliberate exception:
--   * recreates the six dropped indexes (idempotent, IF NOT EXISTS), with their
--     original column lists from 0001 / 0013 / 0020;
--   * recreates the two dropped agent_referrals columns (tracking_id /
--     session_id) with their original TEXT types from 0001;
--   * does NOT recreate commissions_status_chk — that stale CHECK is the bug
--     0040 removed (it blocks status='paid'); restoring it would re-break
--     settlements, so it is intentionally left off.
--
-- Idempotent (IF NOT EXISTS / DROP COLUMN guards) and ordered so a re-run
-- converges.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Recreate the two dropped agent_referrals columns (original TEXT types, 0001)
-- -----------------------------------------------------------------------------
ALTER TABLE public.agent_referrals
  ADD COLUMN IF NOT EXISTS tracking_id TEXT,   -- KYC pipeline correlation
  ADD COLUMN IF NOT EXISTS session_id  TEXT;   -- onboardingSessionId

-- -----------------------------------------------------------------------------
-- Recreate the six dropped indexes (original definitions)
-- -----------------------------------------------------------------------------
-- transactions(subscriber_id) — 0020
CREATE INDEX IF NOT EXISTS idx_transactions_subscriber_id
  ON public.transactions (subscriber_id);

-- demo_personas(phone, role) — 0001 (JWT mint lookup)
CREATE INDEX IF NOT EXISTS demo_personas_phone_role_idx
  ON public.demo_personas (phone, role);

-- commissions(agent_id) — 0013
CREATE INDEX IF NOT EXISTS commissions_agent_id_idx
  ON public.commissions (agent_id);

-- subscribers(registered_date) — 0020
CREATE INDEX IF NOT EXISTS idx_subscribers_registered
  ON public.subscribers (registered_date);

-- subscribers(gender) — 0020
CREATE INDEX IF NOT EXISTS idx_subscribers_gender
  ON public.subscribers (gender);

-- subscribers(kyc_status) — 0020
CREATE INDEX IF NOT EXISTS idx_subscribers_kyc
  ON public.subscribers (kyc_status);

-- =============================================================================
-- End of 0040_post_restore_cleanup.down.sql
-- =============================================================================
