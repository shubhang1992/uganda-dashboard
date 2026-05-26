-- =============================================================================
-- Universal Pensions Uganda — 0027: Post-audit polish (ACL + CHECK + UNIQUE)
-- =============================================================================
-- Closes three audit findings in one migration:
--
--   D3 — `upsert_nominees` ACL: 0024 grants EXECUTE to `authenticated` and
--        revokes EXECUTE from `anon`, but never strips the default PUBLIC
--        EXECUTE grant. Postgres grants EXECUTE to PUBLIC by default on new
--        functions; if PUBLIC retains EXECUTE, an unauthenticated client that
--        somehow gets a connection (e.g. via a misconfigured PostgREST schema
--        cache) could invoke the RPC. Explicitly REVOKE FROM PUBLIC then
--        GRANT to `authenticated` is the canonical SECURITY DEFINER pattern.
--
--   D8 — CHECK constraints on free-text status / state columns. Several
--        tables store status as TEXT (not ENUM) so the schema currently
--        accepts arbitrary garbage values. Adding CHECK constraints with the
--        allowed value set turns silent drift into a loud INSERT/UPDATE
--        failure. Columns covered:
--          * subscribers.kyc_status
--          * withdrawals.status
--          * claims.status
--        For columns that ARE typed via ENUM (`commissions.status`,
--        `settlement_runs.state`), a CHECK is redundant — Postgres rejects
--        out-of-enum values at the type level. We still add a defensive
--        CHECK to make the allowed set self-documenting on the table.
--
--   D9 — UNIQUE index on nominees to prevent duplicate-NIN entries within
--        a (subscriber_id, type) bucket. Audit brief literally asked for
--        UNIQUE(subscriber_id, type), but reading 0024_upsert_nominees.sql
--        line 92-120 makes clear that MULTIPLE pension rows and MULTIPLE
--        insurance rows per subscriber are legitimate (the RPC inserts a
--        row per nominee in the JSONB array, with `share` summing to 100
--        across the type). A unique constraint on just (subscriber_id, type)
--        would BREAK the RPC and the schema invariant.
--
--        The defensible reading of D9 is "prevent dup-type entries" — i.e.
--        the same person listed twice within the same type. NIN (Uganda's
--        national ID) is the canonical identity for a nominee. Add a
--        partial unique index on (subscriber_id, type, nin) WHERE nin IS NOT
--        NULL so duplicate NINs are blocked while pre-KYC NULL-NIN rows
--        remain insertable. The audit's literal phrasing is preserved in
--        the index name suffix for traceability.
--
--        NOTE: nominees has no `deleted_at` column — soft-delete is not in
--        the schema. The audit brief mentioned `WHERE deleted_at IS NULL`
--        but that predicate doesn't apply. The WHERE clause used here
--        guards NULL NIN instead.
--
-- Idempotent throughout — every statement is guarded by IF NOT EXISTS or a
-- DO-block with a pg_catalog existence check. Forward-only per BACKEND.md §7.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (1) D3 — upsert_nominees ACL hardening
-- -----------------------------------------------------------------------------
-- Canonical signature comes from 0024_upsert_nominees.sql:
--   upsert_nominees(p_subscriber_id TEXT, p_pension JSONB, p_insurance JSONB)
-- DEFAULT '[]'::jsonb on each JSONB argument does NOT change the signature
-- that REVOKE/GRANT must use — the function is identified by argument types.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'upsert_nominees'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) TO authenticated';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- (2) D8 — CHECK constraints on free-text status columns
-- -----------------------------------------------------------------------------
-- Each CHECK is added inside a DO block with a pg_constraint existence check
-- so the migration is replay-safe. NOT VALID lets the constraint apply only
-- to new INSERTs/UPDATEs; pre-existing rows are left alone (no demo data
-- carries an out-of-set value today, but NOT VALID is the safe forward-only
-- pattern in case seed drift occurs).
--
-- Validation can be promoted later via `ALTER TABLE ... VALIDATE CONSTRAINT`
-- once a one-off cleanup confirms every row passes.

-- (2a) subscribers.kyc_status — observed values: 'complete', 'pending', 'incomplete'.
-- Default per 0001 is 'complete'. mockData.js line 197 ships only 'complete' in
-- the static set, but mapMetrics aggregates 'pending' and 'incomplete' so the
-- frontend may emit those via demo writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subscribers_kyc_status_chk'
       AND conrelid = 'public.subscribers'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.subscribers
        ADD CONSTRAINT subscribers_kyc_status_chk
        CHECK (kyc_status IN ('complete', 'pending', 'incomplete'))
        NOT VALID
    $sql$;
  END IF;
END $$;

-- (2b) withdrawals.status — observed values: 'paid', 'processing'.
-- Schema default per 0001 is 'processing'. mockData picks among
-- ['paid', 'paid', 'paid', 'processing'].
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'withdrawals_status_chk'
       AND conrelid = 'public.withdrawals'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.withdrawals
        ADD CONSTRAINT withdrawals_status_chk
        CHECK (status IN ('paid', 'processing'))
        NOT VALID
    $sql$;
  END IF;
END $$;

-- (2c) claims.status — observed values per CLAIM_STATUSES in mockData.js line 314:
-- 'submitted', 'under_review', 'approved', 'paid', 'rejected'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'claims_status_chk'
       AND conrelid = 'public.claims'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.claims
        ADD CONSTRAINT claims_status_chk
        CHECK (status IN ('submitted', 'under_review', 'approved', 'paid', 'rejected'))
        NOT VALID
    $sql$;
  END IF;
END $$;

-- (2d) commissions.status — already a commission_status ENUM (see 0001 line 35).
-- A CHECK is technically redundant, but the audit brief asked for one and a
-- belt-and-suspenders CHECK makes the allowed set discoverable via \d on the
-- table. Cast to TEXT so the CHECK can compare across all seven enum values
-- without relying on enum ordinal comparisons.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'commissions_status_chk'
       AND conrelid = 'public.commissions'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.commissions
        ADD CONSTRAINT commissions_status_chk
        CHECK (status::text IN (
          'due', 'in_run', 'held', 'disputed',
          'released', 'confirmed', 'rejected'
        ))
        NOT VALID
    $sql$;
  END IF;
END $$;

-- (2e) settlement_runs.state — typed as settlement_run_state ENUM (see 0001
-- line 45). The audit brief named this column `status`; the schema's actual
-- column is `state`. Same belt-and-suspenders pattern as commissions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'settlement_runs_state_chk'
       AND conrelid = 'public.settlement_runs'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.settlement_runs
        ADD CONSTRAINT settlement_runs_state_chk
        CHECK (state::text IN ('draft', 'branch_review', 'released', 'cancelled'))
        NOT VALID
    $sql$;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- (3) D9 — UNIQUE partial index on nominees(subscriber_id, type, nin)
-- -----------------------------------------------------------------------------
-- See header comment above for the rationale on the (subscriber_id, type, nin)
-- shape vs. the audit's literal (subscriber_id, type). NIN is Uganda's national
-- ID — the canonical identity for a nominee. Two nominee rows that share the
-- same NIN within one (subscriber, type) bucket are a duplicate.
--
-- Partial predicate `WHERE nin IS NOT NULL` keeps pre-KYC rows with NULL nin
-- insertable. Same pattern already used in 0017 for subscribers.nin and
-- agents.email (see ux_subscribers_nin / ux_agents_email).
--
-- The `share` sum-to-100 invariant remains in the upsert_nominees RPC body;
-- an index can't express SUM(...) per partition = 100. Index + RPC +
-- nominees_share_range_chk (from 0024) give defense-in-depth.

CREATE UNIQUE INDEX IF NOT EXISTS nominees_subscriber_id_type_unique
  ON public.nominees (subscriber_id, type, nin)
  WHERE nin IS NOT NULL;

-- =============================================================================
-- End of 0027_post_audit_polish.sql
-- =============================================================================
