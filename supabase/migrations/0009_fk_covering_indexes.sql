-- =============================================================================
-- Universal Pensions Uganda — 0009: covering indexes for unindexed FKs
-- =============================================================================
-- Supabase performance lint 0002 (unindexed_foreign_keys) flagged nine FKs
-- whose referencing column had no covering index. On joins / cascade-checks,
-- Postgres falls back to seq scans against the referencing table. The
-- subscriber-id and agent-id FKs in particular sit on hot tables.
--
-- All indexes use CREATE INDEX IF NOT EXISTS so this migration is idempotent.
-- We use plain CREATE (not CONCURRENTLY) since apply_migration wraps in a
-- transaction; build times on this demo DB are seconds.
-- =============================================================================

-- High-impact (large tables, frequent joins)
CREATE INDEX IF NOT EXISTS commissions_subscriber_id_idx
  ON commissions (subscriber_id);

CREATE INDEX IF NOT EXISTS transactions_agent_id_idx
  ON transactions (agent_id);

CREATE INDEX IF NOT EXISTS withdrawals_subscriber_id_idx
  ON withdrawals (subscriber_id);

CREATE INDEX IF NOT EXISTS nominees_subscriber_id_idx
  ON nominees (subscriber_id);

CREATE INDEX IF NOT EXISTS claims_subscriber_id_idx
  ON claims (subscriber_id);

-- Reference / hierarchy lookups
CREATE INDEX IF NOT EXISTS agents_branch_id_idx
  ON agents (branch_id);

CREATE INDEX IF NOT EXISTS branches_district_id_idx
  ON branches (district_id);

CREATE INDEX IF NOT EXISTS districts_region_id_idx
  ON districts (region_id);

CREATE INDEX IF NOT EXISTS subscribers_district_id_idx
  ON subscribers (district_id);
