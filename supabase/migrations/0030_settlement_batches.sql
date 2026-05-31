-- =============================================================================
-- Universal Pensions Uganda — 0030: settlement_batches
-- =============================================================================
-- Phase 1 of the commission-flow simplification. With the run/dispute/hold
-- state machine retired (0029), a "settlement" is now a single distributor
-- action: pay a chunk of an agent's `due` commissions and stamp them `paid`.
-- Each such action records one settlement_batches row (the write happens in
-- the apply_settlement RPC, 0031).
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * SELECT-only RLS; writes flow through the apply_settlement RPC (0031).
--   * RLS reads (SELECT auth.jwt()) ->> 'app_role' / 'branchId' / 'agentId'
--     — never 'role', never auth.uid() (NULL for custom HS256 JWTs).
--   * Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
--   * Forward-only; reversible via 0030_settlement_batches.down.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.settlement_batches (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES public.agents(id),
  branch_id     TEXT REFERENCES public.branches(id),
  pending_total NUMERIC NOT NULL,
  paid_amount   NUMERIC NOT NULL,
  txn_ref       TEXT,
  paid_date     DATE,
  line_count    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_batches_branch_id_idx
  ON public.settlement_batches (branch_id);
CREATE INDEX IF NOT EXISTS settlement_batches_agent_id_idx
  ON public.settlement_batches (agent_id);
CREATE INDEX IF NOT EXISTS settlement_batches_created_at_idx
  ON public.settlement_batches (created_at DESC);

ALTER TABLE public.settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_batches FORCE  ROW LEVEL SECURITY;

-- SELECT policies (mirror the commissions SELECT stance from 0008):
--   distributor reads all; branch reads its own branch slice; agent reads its
--   own batches.
DROP POLICY IF EXISTS settlement_batches_select_distributor ON public.settlement_batches;
CREATE POLICY settlement_batches_select_distributor ON public.settlement_batches
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS settlement_batches_select_branch ON public.settlement_batches;
CREATE POLICY settlement_batches_select_branch ON public.settlement_batches
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND branch_id = (SELECT auth.jwt()) ->> 'branchId'
  );

DROP POLICY IF EXISTS settlement_batches_select_agent ON public.settlement_batches;
CREATE POLICY settlement_batches_select_agent ON public.settlement_batches
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND agent_id = (SELECT auth.jwt()) ->> 'agentId'
  );

-- No INSERT/UPDATE/DELETE policies — writes go through apply_settlement (0031).

-- Table privileges: Supabase's default schema grants already give SELECT on
-- public.* to authenticated; re-assert explicitly for self-documentation.
GRANT SELECT ON public.settlement_batches TO authenticated;

-- =============================================================================
-- End of 0030_settlement_batches.sql
-- =============================================================================
