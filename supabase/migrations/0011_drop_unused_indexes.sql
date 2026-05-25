-- =============================================================================
-- Universal Pensions Uganda — 0011: drop unused indexes
-- =============================================================================
-- Supabase performance lint 0005 (unused_index) flagged three indexes with
-- zero recorded scans in pg_stat_user_indexes. Each is paying maintenance
-- cost on every INSERT/UPDATE without serving a single read.
--
--   * commissions_agent_id_status_idx — superseded once we hit-test the
--     commissions table by run_id / state rather than (agent_id, status).
--   * settlement_run_branch_reviews_branch_id_idx — branch reviews are
--     accessed by (run_id, branch_id) composite; the branch_id-only index
--     never wins a plan.
--   * users_phone_idx — public.users currently has 0 rows. Pending the
--     decision on whether the table itself stays.
--
-- Forward-only, idempotent.
-- =============================================================================

DROP INDEX IF EXISTS commissions_agent_id_status_idx;
DROP INDEX IF EXISTS settlement_run_branch_reviews_branch_id_idx;
DROP INDEX IF EXISTS users_phone_idx;
