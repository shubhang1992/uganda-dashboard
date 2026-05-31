-- =============================================================================
-- Universal Pensions Uganda — 0029: Commission flow simplification
-- =============================================================================
-- Phase 1 of the commission-flow simplification. Collapses the maker-checker
-- run/dispute/hold state machine down to two states: `due → paid`.
--
-- What this migration retires (in dependency-safe order):
--   1. Every run / dispute / hold / confirm SECURITY DEFINER RPC from
--      0004 / 0014 / 0021 (re-emitted byte-identically across those files;
--      the canonical app_role signatures live in 0021 / 0014).
--   2. The `commissions_before_update` dispute-snapshot trigger AND its
--      function (both authored in 0002).
--   3. The `settlement_run_branch_reviews` + `settlement_runs` tables (CASCADE)
--      and the `settlement_run_state` / `settlement_run_branch_review_state`
--      enums (from 0001).
--   4. The `commission_status` enum is collapsed from 7 states to 2
--      ('due','paid'). Existing rows are remapped: released/confirmed → paid,
--      everything else → due.
--   5. Now-unused dispute/hold/confirm columns on `commissions`, plus the
--      `run_id` FK column and its index. A `paid_amount` column is added.
--   6. The three read RPCs (get_commission_summary,
--      get_entity_commission_summary, get_agent_commission_detail) are
--      re-emitted with the in_run/held/disputed/released/confirmed buckets
--      removed — paid = status='paid', due = status='due'. The app_role /
--      claim-reading logic is preserved exactly.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * SECURITY DEFINER RPCs read auth.jwt() ->> 'app_role' (NEVER 'role').
--   * search_path pinned per the 0010+ convention.
--   * Writes flow through SECURITY DEFINER RPCs only (0030 / 0031).
--   * Forward-only; a best-effort .down.sql ships alongside (the enum collapse
--     is inherently irreversible — see the down file).
--
-- NOTE: the commissions/settlement realtime publication membership was already
-- removed in 0025 / 0028, so no ALTER PUBLICATION is needed before DROP TABLE.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (1) Drop the run / dispute / hold / confirm RPCs.
-- -----------------------------------------------------------------------------
-- Signatures match the canonical app_role re-emissions in 0021 (the 13 state-
-- machine functions) and 0014 (agent_dispute_line). DROP FUNCTION matches by
-- argument types only, so the exact arg lists below are load-bearing.

DROP FUNCTION IF EXISTS public.open_run();
DROP FUNCTION IF EXISTS public.cancel_run(text);
DROP FUNCTION IF EXISTS public.release_run(text);
DROP FUNCTION IF EXISTS public.release_branch(text, text);
DROP FUNCTION IF EXISTS public.branch_approve_all(text);
DROP FUNCTION IF EXISTS public.mark_branch_reviewed(text);
DROP FUNCTION IF EXISTS public.branch_approve_line(text);
DROP FUNCTION IF EXISTS public.branch_hold_line(text, text);
DROP FUNCTION IF EXISTS public.branch_dispute_line(text, text);
DROP FUNCTION IF EXISTS public.agent_dispute_line(text, text);
DROP FUNCTION IF EXISTS public.approve_dispute(text, text);
DROP FUNCTION IF EXISTS public.reject_dispute(text, text);
DROP FUNCTION IF EXISTS public.withdraw_dispute(text);
DROP FUNCTION IF EXISTS public.agent_confirm_commission(text);

-- Run-only read RPC (0002 / 0010 — reads settlement_runs +
-- settlement_run_branch_reviews, both dropped below).
DROP FUNCTION IF EXISTS public.get_run_branch_breakdown(text);


-- -----------------------------------------------------------------------------
-- (2) Drop the dispute-snapshot trigger and its function (both from 0002).
-- -----------------------------------------------------------------------------
-- The trigger captured OLD.status into previous_status on entry to 'disputed';
-- with disputes retired there is nothing to snapshot. Drop the trigger first,
-- then the function it referenced.

DROP TRIGGER IF EXISTS commissions_before_update ON public.commissions;
DROP FUNCTION IF EXISTS public.trg_commissions_before_update();


-- -----------------------------------------------------------------------------
-- (3) Drop the settlement tables (CASCADE) + their enums.
-- -----------------------------------------------------------------------------
-- settlement_run_branch_reviews FKs settlement_runs; drop the child first.
-- CASCADE also clears the SELECT policies (0003/0007/0008) on these tables and
-- the commissions.run_id FK is dropped explicitly in step (4) below — but
-- CASCADE on settlement_runs would handle it too. We drop run_id explicitly
-- regardless so the column is gone even if a prior partial replay left the FK.

DROP TABLE IF EXISTS public.settlement_run_branch_reviews CASCADE;
DROP TABLE IF EXISTS public.settlement_runs CASCADE;

DROP TYPE IF EXISTS public.settlement_run_branch_review_state;
DROP TYPE IF EXISTS public.settlement_run_state;


-- -----------------------------------------------------------------------------
-- (4) Collapse the commission_status enum to ('due','paid').
-- -----------------------------------------------------------------------------
-- PostgreSQL cannot add/remove enum labels transactionally in a way that lets
-- us shrink the type in place, so we: drop the run_id FK column + its index,
-- swap the column to text (remapping values), drop & recreate the enum with two
-- labels, then swap the column back.

-- Remove the FK to the now-dropped settlement_runs table and its index.
ALTER TABLE public.commissions DROP COLUMN IF EXISTS run_id;
DROP INDEX IF EXISTS public.commissions_run_id_idx;

-- Drop the now-unused dispute/hold/confirm columns BEFORE collapsing the enum.
-- This MUST precede DROP TYPE below: previous_status is itself typed
-- commission_status, so the type cannot be dropped while that column exists.
ALTER TABLE public.commissions
  DROP COLUMN IF EXISTS agent_confirmed,
  DROP COLUMN IF EXISTS previous_status,
  DROP COLUMN IF EXISTS dispute_reason,
  DROP COLUMN IF EXISTS disputed_at,
  DROP COLUMN IF EXISTS disputed_by,
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by,
  DROP COLUMN IF EXISTS outcome_reason,
  DROP COLUMN IF EXISTS hold_reason;

-- Drop the default before changing the column type (default references the old
-- enum and would block the type swap).
ALTER TABLE public.commissions ALTER COLUMN status DROP DEFAULT;

-- Remap to text: released/confirmed → paid; in_run/held/disputed/rejected → due.
ALTER TABLE public.commissions
  ALTER COLUMN status TYPE text
  USING (CASE status::text
            WHEN 'released'  THEN 'paid'
            WHEN 'confirmed' THEN 'paid'
            WHEN 'in_run'    THEN 'due'
            WHEN 'held'      THEN 'due'
            WHEN 'disputed'  THEN 'due'
            WHEN 'rejected'  THEN 'due'
            ELSE status::text
         END);

-- Recreate the enum with the two surviving labels.
DROP TYPE public.commission_status;
CREATE TYPE public.commission_status AS ENUM ('due', 'paid');

-- Swap the column back to the new enum and restore the default.
ALTER TABLE public.commissions
  ALTER COLUMN status TYPE public.commission_status
  USING status::public.commission_status;
ALTER TABLE public.commissions ALTER COLUMN status SET DEFAULT 'due';


-- -----------------------------------------------------------------------------
-- (5) Add paid_amount. (The dispute/hold/confirm columns were dropped in step (4)
-- above, before the enum collapse, because previous_status is enum-typed.)
-- -----------------------------------------------------------------------------
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC;


-- -----------------------------------------------------------------------------
-- (6a) Re-emit get_commission_summary — two-bucket version.
-- -----------------------------------------------------------------------------
-- RETURNS jsonb is unchanged, so CREATE OR REPLACE is safe. The disputed /
-- in_run / released / confirmed fields are dropped from the returned object;
-- paid = status='paid', due = status='due'. No claim reading in this RPC
-- (it runs under the caller's RLS context, scoped by p_branch_id).
CREATE OR REPLACE FUNCTION public.get_commission_summary(
  p_branch_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH scoped AS (
    SELECT amount, status
      FROM public.commissions
     WHERE p_branch_id IS NULL OR branch_id = p_branch_id
  )
  SELECT jsonb_build_object(
    'totalCommissions', COALESCE(SUM(amount), 0),
    'totalPaid',        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
    'totalDue',         COALESCE(SUM(amount) FILTER (WHERE status = 'due'),  0),
    'countTotal',       COUNT(*),
    'countPaid',        COUNT(*) FILTER (WHERE status = 'paid'),
    'countDue',         COUNT(*) FILTER (WHERE status = 'due')
  )
    INTO v_result
    FROM scoped;

  RETURN v_result;
END;
$$;


-- -----------------------------------------------------------------------------
-- (6b) Re-emit get_entity_commission_summary — two-bucket version.
-- -----------------------------------------------------------------------------
-- RETURNS jsonb unchanged. Drops totalDisputed / countDisputed. settlementRate
-- now keys off paid / total only. Scoping logic (agent/branch/district/region/
-- country) is preserved exactly; no app_role claim is read here (the RPC runs
-- under the caller's RLS context per 0003 commentary).
CREATE OR REPLACE FUNCTION public.get_entity_commission_summary(
  p_level     TEXT,
  p_entity_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_paid     NUMERIC := 0;
  v_total_due      NUMERIC := 0;
  v_count_paid     INTEGER := 0;
  v_count_due      INTEGER := 0;
  v_count_total    INTEGER := 0;
  v_settlement_rate INTEGER := 0;
BEGIN
  WITH scoped AS (
    SELECT c.amount, c.status
      FROM public.commissions c
     WHERE
       (p_level = 'agent'    AND c.agent_id    = p_entity_id)
    OR (p_level = 'branch'   AND c.branch_id   = p_entity_id)
    OR (p_level = 'district' AND c.branch_id IN (
          SELECT b.id FROM public.branches b WHERE b.district_id = p_entity_id
       ))
    OR (p_level = 'region'   AND c.branch_id IN (
          SELECT b.id FROM public.branches b
            JOIN public.districts d ON d.id = b.district_id
           WHERE d.region_id = p_entity_id
       ))
    OR (p_level = 'country')
  )
  SELECT
    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status = 'due'  THEN amount END), 0),
    COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0),
    COALESCE(COUNT(*) FILTER (WHERE status = 'due'), 0)
    INTO
      v_total_paid, v_total_due,
      v_count_paid, v_count_due
    FROM scoped;

  v_count_total := v_count_paid + v_count_due;
  IF v_count_total > 0 THEN
    v_settlement_rate := ROUND((v_count_paid::numeric / v_count_total) * 100);
  END IF;

  RETURN jsonb_build_object(
    'totalPaid',      v_total_paid,
    'totalDue',       v_total_due,
    'countPaid',      v_count_paid,
    'countDue',       v_count_due,
    'total',          v_total_paid + v_total_due,
    'countTotal',     v_count_total,
    'settlementRate', v_settlement_rate
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- (6c) Re-emit get_agent_commission_detail — two-bucket version.
-- -----------------------------------------------------------------------------
-- RETURNS jsonb unchanged. paidTransactions = status='paid';
-- dueTransactions = status='due'. The runId field is removed from the line
-- objects (run_id column is gone); paid lines now expose paidAmount. Active /
-- dormant subscriber counts no longer have disputed/rejected to exclude, so
-- activeSubscribers = total and dormantSubscribers = 0 (no dormant concept
-- survives the collapse).
CREATE OR REPLACE FUNCTION public.get_agent_commission_detail(
  p_agent_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agent           RECORD;
  v_branch_name     TEXT;
  v_total           NUMERIC := 0;
  v_total_paid      NUMERIC := 0;
  v_total_due       NUMERIC := 0;
  v_total_subs      INTEGER := 0;
  v_active_subs     INTEGER := 0;
  v_dormant_subs    INTEGER := 0;
  v_paid_txns       jsonb;
  v_due_txns        jsonb;
BEGIN
  SELECT a.id, a.name, a.employee_id, a.phone, a.branch_id, a.rating
    INTO v_agent
    FROM public.agents a
   WHERE a.id = p_agent_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT b.name INTO v_branch_name
    FROM public.branches b WHERE b.id = v_agent.branch_id;

  -- Totals + counts.
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'due'), 0),
    COUNT(*),
    COUNT(*),
    0
    INTO v_total, v_total_paid, v_total_due, v_total_subs, v_active_subs, v_dormant_subs
    FROM public.commissions
   WHERE agent_id = p_agent_id;

  -- Paid transactions.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              c.id,
    'transactionDate', c.paid_date,
    'amount',          c.amount,
    'paidAmount',      c.paid_amount,
    'status',          c.status::text,
    'txnRef',          c.txn_ref,
    'subscriberId',    c.subscriber_id,
    'subscriberName',  c.subscriber_name
  ) ORDER BY c.paid_date DESC NULLS LAST), '[]'::jsonb)
    INTO v_paid_txns
    FROM public.commissions c
   WHERE c.agent_id = p_agent_id
     AND c.status = 'paid';

  -- Due transactions.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              c.id,
    'dueDate',         c.due_date,
    'daysToDate',      CASE
                          WHEN c.due_date IS NULL THEN NULL
                          ELSE (c.due_date - CURRENT_DATE)
                       END,
    'amount',          c.amount,
    'status',          c.status::text,
    'branchId',        c.branch_id,
    'branchName',      v_branch_name,
    'subscriberId',    c.subscriber_id,
    'subscriberName',  c.subscriber_name
  ) ORDER BY c.due_date ASC NULLS LAST), '[]'::jsonb)
    INTO v_due_txns
    FROM public.commissions c
   WHERE c.agent_id = p_agent_id
     AND c.status = 'due';

  RETURN jsonb_build_object(
    'agentId',              v_agent.id,
    'agentName',            v_agent.name,
    'employeeId',           COALESCE(v_agent.employee_id, ''),
    'agentPhone',           COALESCE(v_agent.phone, ''),
    'branchId',             v_agent.branch_id,
    'branchName',           COALESCE(v_branch_name, 'Unknown'),
    'rating',               COALESCE(v_agent.rating, 0),
    'totalCommissions',     v_total,
    'totalPaid',            v_total_paid,
    'totalDue',             v_total_due,
    'subscribersOnboarded', v_total_subs,
    'activeSubscribers',    v_active_subs,
    'dormantSubscribers',   v_dormant_subs,
    'paidTransactions',     v_paid_txns,
    'dueTransactions',      v_due_txns
  );
END;
$$;

-- Re-grant EXECUTE (CREATE OR REPLACE preserves grants, but re-asserting keeps
-- a partial-state replay convergent).
GRANT EXECUTE ON FUNCTION public.get_commission_summary(text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_commission_summary(text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_commission_detail(text)           TO authenticated;


-- -----------------------------------------------------------------------------
-- NOTE on the contribution trigger (trg_transactions_contribution, 0002):
-- It inserts commissions with status='due' and does NOT set run_id or any of
-- the dropped columns, so it remains valid after this migration — left
-- untouched.
-- =============================================================================
-- End of 0029_commission_simplify.sql
-- =============================================================================
