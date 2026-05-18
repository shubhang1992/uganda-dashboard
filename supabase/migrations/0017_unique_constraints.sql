-- =============================================================================
-- Universal Pensions Uganda — 0017: UNIQUE constraints (post-cleanup)
-- =============================================================================
-- Three unique constraints flagged by the audit-remediation §6.A brief:
--
--   1. agents.email — duplicates leak when the seed regenerates names with a
--      bounded first-name × last-name pool. Real onboarding paths (verify-otp,
--      future agent-admin endpoints) need a single agent per business email.
--
--   2. subscribers.nin — Uganda National ID is the canonical KYC identity.
--      A duplicate-NIN row in the demo is a data-integrity defect, not a
--      legitimate state. Backend-side dedupe lets us hand the dashboard a
--      true "one subscriber per NIN" invariant.
--
--   3. commissions(agent_id, subscriber_id) — the first-contribution
--      commission trigger guards via `NOT EXISTS (SELECT 1 FROM commissions
--      WHERE subscriber_id = NEW.subscriber_id)` but the read-then-write is
--      not atomic; a fast double-click during onboarding could insert twice
--      (BACKEND.md §14b: "First-contribution commission lacks UNIQUE").
--      A unique index closes the race.
--
-- IMPORTANT: this migration must NOT be applied until cleanup-data-defects.sql
-- has run. CREATE UNIQUE INDEX will fail loudly on existing duplicates, which
-- is the safe failure mode — refuse to lock in a constraint we know is
-- already violated.
--
-- Idempotent via `IF NOT EXISTS`. Forward-only per BACKEND.md §15.
-- =============================================================================

-- (1) agents.email — partial index so NULL emails (legitimate when an agent
--     has no business inbox yet) don't collide. `WHERE email IS NOT NULL`
--     is also Postgres's preferred way to ignore NULLs in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS ux_agents_email
  ON public.agents (email)
  WHERE email IS NOT NULL;

-- (2) subscribers.nin — partial index. NIN is populated only after KYC; the
--     pre-KYC subscriber rows seeded with NULL must remain insertable.
CREATE UNIQUE INDEX IF NOT EXISTS ux_subscribers_nin
  ON public.subscribers (nin)
  WHERE nin IS NOT NULL;

-- (3) commissions(agent_id, subscriber_id) — full index (no WHERE clause)
--     because the first-contribution invariant is "at most one commission
--     per (agent, subscriber) pair", regardless of status. agent_id is
--     NOT NULL in every commission row, so no partial WHERE is needed.
CREATE UNIQUE INDEX IF NOT EXISTS ux_commissions_agent_subscriber
  ON public.commissions (agent_id, subscriber_id);

-- =============================================================================
-- End of 0017_unique_constraints.sql
-- =============================================================================
