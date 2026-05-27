-- =============================================================================
-- Universal Pensions Uganda — 0013: covering indexes for the two FKs unmasked
-- by 0011's unused-index drops
-- =============================================================================
-- Migration 0011 dropped the two indexes flagged by Supabase as unused:
--   * commissions_agent_id_status_idx        (compound on agent_id, status)
--   * settlement_run_branch_reviews_branch_id_idx
--
-- Those drops were correct (zero pg_stat scans), but each was also serving as
-- the only covering index for an FK constraint. After 0011, the advisor
-- re-flagged commissions_agent_id_fkey and settlement_run_branch_reviews_
-- branch_id_fkey as unindexed.
--
-- Single-column indexes are the right replacement here: the RLS predicates
-- (after 0008) do `commissions.agent_id = (SELECT auth.jwt()) ->> 'agentId'`
-- and `branch_id = ... 'branchId'` — single-column equality, exactly what a
-- single-column btree serves best. The dropped compound indexes had a
-- trailing `status` column the demo doesn't filter on.
-- =============================================================================

CREATE INDEX IF NOT EXISTS commissions_agent_id_idx
  ON commissions (agent_id);

CREATE INDEX IF NOT EXISTS settlement_run_branch_reviews_branch_id_idx
  ON settlement_run_branch_reviews (branch_id);
