-- =============================================================================
-- Universal Pensions Uganda — 0032: settlement-apply correctness + idempotency
-- =============================================================================
-- Forward-only fix migration for the settlement flow. The live DB already has
-- 0029/0030/0031 applied, so this migration is additive and re-emits
-- apply_settlement via CREATE OR REPLACE. It addresses four defects in the
-- 0031 apply_settlement RPC:
--
--   * BL-2 — per-line `commissions.paid_amount` was stamped with the WHOLE
--     batch total on every settled line. Each settled line now records its OWN
--     amount, so SUM(paid_amount) across an agent's settled lines reconciles
--     with settlement_batches.paid_amount.
--   * BL-1 — partial payments were "shown but not blocked" and over-cleared
--     every due line. INFORM-NOT-BLOCK semantics now apply: the entered amount
--     is allocated FIFO (oldest due line first); lines the amount fully covers
--     flip to `paid`, the rest stay genuinely `due`. The frontend surfaces the
--     mismatch to the agent (banner + "Ask for reason" mailto) — it is NOT a
--     hard block.
--
--     >>> PRODUCT-OWNER DECISION (confirmed 2026-05-31) <<<
--     FIFO inform-not-block is CONFIRMED: settle the oldest due lines fully
--     covered by the paid amount; uncovered lines stay Outstanding; the agent
--     is informed via the partial-settlement banner + a support mailto (no hard
--     block). This is the settled semantics — keep the FIFO loop below as-is.
--     (If this is ever reversed to "any payment clears ALL of an agent's due
--     lines" / all-or-nothing per agent, replace the FIFO loop below with a
--     single UPDATE of every due line (paid_amount = amount) and set
--     v_settled_total := v_pending_total. The matching mock branch lives in
--     src/services/commissions.js (_legacy_mock_applySettlementUpload).)
--
--   * BL-8 — fractional UGX. The incoming amount is round()ed to whole UGX in
--     the RPC (defence-in-depth alongside the FE parseAmount rounding), and the
--     settlement_batches/commissions/notifications amounts are integer UGX.
--   * BL-13 — no idempotency. apply_settlement now accepts a per-upload nonce
--     (p_nonce). A SEQUENTIAL re-submit / reload / second-tab / network-retry
--     replay (one txn after another has committed) with the same nonce returns
--     the original result without re-recording batches or re-emitting
--     notifications, via the new settlement_uploads ledger (PRIMARY KEY on the
--     nonce). NB: the ledger handles the sequential-replay case only — truly
--     CONCURRENT same-nonce txns are made safe by the FOR UPDATE row lock on the
--     due commissions (the second txn blocks, then settles 0 rows on its
--     READ COMMITTED status='due' re-check), NOT by the ledger. See the detailed
--     note above the ON CONFLICT INSERT at the end of the function.
--   * BL-18 — notification bodies use thousands separators (to_char) and
--     correct pluralization ("1 commission" vs "N commissions"), and carry the
--     batch ref_id.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * SECURITY DEFINER RPC reads auth.jwt() ->> 'app_role' (NEVER 'role').
--   * search_path pinned; REVOKE ... FROM PUBLIC; GRANT EXECUTE to authenticated.
--   * Idempotent DDL (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS) so a replay converges.
--   * Forward-only; reversible via 0032_fix_settlement_apply.down.sql.
--   * NOT YET APPLIED TO LIVE — this is a code-only forward migration; applying
--     it is a gated cutover step the user runs after a verified backup.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema: per-upload idempotency ledger (BL-13)
-- -----------------------------------------------------------------------------
-- One row per applied settlement upload, keyed by the client-supplied nonce.
-- Stores the full result JSONB so a replay returns the original answer. Kept
-- separate from settlement_batches because one upload can settle many agents
-- (many batch rows) but is one logical idempotent unit.
CREATE TABLE IF NOT EXISTS public.settlement_uploads (
  nonce       TEXT PRIMARY KEY,
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_uploads FORCE  ROW LEVEL SECURITY;

-- No direct policies — only the SECURITY DEFINER apply_settlement RPC reads or
-- writes this ledger (mirrors the SELECT-only stance of settlement_batches /
-- notifications). No GRANT to authenticated: the table is RPC-internal.

-- Carry the nonce on the batch too, for traceability from a batch back to the
-- upload that recorded it (nullable: legacy 0031 batches have none).
ALTER TABLE public.settlement_batches
  ADD COLUMN IF NOT EXISTS client_nonce TEXT;

-- -----------------------------------------------------------------------------
-- apply_settlement(p_rows jsonb, p_nonce text) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Distributor-only. p_rows is a JSON array of objects, one per agent:
--   { "agentId": text, "amountPaid": numeric, "paymentRef": text,
--     "paymentDate": text (YYYY-MM-DD) }
-- p_nonce is an optional per-upload idempotency key.
--
-- For each element (FIFO partial semantics, INFORM-NOT-BLOCK):
--   * Find the agent's `due` commissions oldest-first. If none → skip 'no_due'.
--   * Walk the lines allocating the (rounded) entered amount: a line flips to
--     `paid` (paid_amount = its OWN amount) only while the remaining budget
--     covers it in full; the first line the budget can't cover stops the walk
--     and that line + the rest stay `due`.
--   * If the amount covers no full line → skip 'amount_too_low'.
--   * Otherwise record one settlement_batches row (paid_amount = the
--     actually-allocated total, line_count = settled-line count) + a
--     notification to the agent and (if any) the branch.
--
-- Returns { agentsSettled, linesSettled, totalPaid, skipped: [{agentId, reason}] }.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_settlement(p_rows jsonb, p_nonce text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role           text := (SELECT auth.jwt()) ->> 'app_role';
  v_row            jsonb;
  v_agent_id       text;
  v_amount_paid    numeric;
  v_payment_ref    text;
  v_payment_date   date;
  v_branch_id      text;
  v_pending_total  numeric;
  v_line_count     integer;
  v_batch_id       text;
  v_skipped        jsonb := '[]'::jsonb;
  v_agents_settled integer := 0;
  v_lines_settled  integer := 0;
  v_total_paid     numeric := 0;
  v_remaining      numeric;
  v_settled_count  integer;
  v_settled_total  numeric;
  v_line           record;
  v_body           text;
  v_prior          jsonb;
  v_result         jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'distributor' THEN
    RAISE EXCEPTION 'role % cannot apply a settlement', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit (BL-13): a replay of the same nonce returns the
  -- prior result without re-recording anything.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.settlement_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_agent_id     := v_row ->> 'agentId';
    -- Round to whole UGX at the boundary (BL-8). UGX is zero-decimal.
    v_amount_paid  := round((v_row ->> 'amountPaid')::numeric);
    v_payment_ref  := v_row ->> 'paymentRef';
    v_payment_date := COALESCE((v_row ->> 'paymentDate')::date, current_date);

    IF v_agent_id IS NULL OR v_agent_id = '' THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('agentId', v_agent_id, 'reason', 'missing_agent_id')
      );
      CONTINUE;
    END IF;

    -- Compute the full due slice for this agent (the pending total the entered
    -- amount is measured against).
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
      INTO v_pending_total, v_line_count
      FROM public.commissions
     WHERE agent_id = v_agent_id
       AND status = 'due';

    IF v_line_count = 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('agentId', v_agent_id, 'reason', 'no_due')
      );
      CONTINUE;
    END IF;

    -- Resolve the agent's branch (read from agents so a NULL-branch agent is
    -- handled consistently).
    SELECT branch_id INTO v_branch_id FROM public.agents WHERE id = v_agent_id;

    -- FIFO allocation (BL-1/BL-2): settle the oldest due lines first, stamping
    -- each settled line with its OWN amount as paid_amount. Stop at the first
    -- line the remaining budget can't cover in full — it (and any later lines)
    -- stay `due`. INFORM-NOT-BLOCK: a partial payment never clears unpaid lines.
    v_remaining     := v_amount_paid;
    v_settled_count := 0;
    v_settled_total := 0;

    FOR v_line IN
      SELECT id, amount
        FROM public.commissions
       WHERE agent_id = v_agent_id
         AND status = 'due'
       ORDER BY due_date ASC NULLS LAST, id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining < v_line.amount;  -- can't cover this line in full
      UPDATE public.commissions
         SET status      = 'paid',
             paid_date   = v_payment_date,
             txn_ref     = v_payment_ref,
             paid_amount = v_line.amount      -- per-line own amount (BL-2)
       WHERE id = v_line.id;
      v_remaining     := v_remaining - v_line.amount;
      v_settled_count := v_settled_count + 1;
      v_settled_total := v_settled_total + v_line.amount;
    END LOOP;

    -- The entered amount covered no full line: nothing settles, surface why.
    IF v_settled_count = 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('agentId', v_agent_id, 'reason', 'amount_too_low')
      );
      CONTINUE;
    END IF;

    -- Record the batch. paid_amount is the actually-allocated total (= sum of
    -- the settled lines' amounts), so it reconciles with SUM(paid_amount).
    v_batch_id := 'sb-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.settlement_batches (
      id, agent_id, branch_id, pending_total, paid_amount,
      txn_ref, paid_date, line_count, client_nonce
    ) VALUES (
      v_batch_id, v_agent_id, v_branch_id, v_pending_total, v_settled_total,
      v_payment_ref, v_payment_date, v_settled_count, NULLIF(p_nonce, '')
    );

    -- Formatted body (BL-18): thousands separators + correct pluralization.
    v_body := 'UGX ' || trim(to_char(v_settled_total, 'FM999,999,999,999'))
           || ' paid for ' || v_settled_count || ' '
           || CASE WHEN v_settled_count = 1 THEN 'commission' ELSE 'commissions' END
           || '.';

    -- Notify the agent.
    INSERT INTO public.notifications (
      id, recipient_role, recipient_id, type, title, body, amount, ref_id
    ) VALUES (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      'agent',
      v_agent_id,
      'commission_settled',
      'Commission settled',
      v_body,
      v_settled_total,
      v_batch_id
    );

    -- Notify the branch, if any.
    IF v_branch_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        id, recipient_role, recipient_id, type, title, body, amount, ref_id
      ) VALUES (
        'ntf-' || replace(gen_random_uuid()::text, '-', ''),
        'branch',
        v_branch_id,
        'commission_settled',
        'Commission settled',
        v_body,
        v_settled_total,
        v_batch_id
      );
    END IF;

    v_agents_settled := v_agents_settled + 1;
    v_lines_settled  := v_lines_settled + v_settled_count;
    v_total_paid     := v_total_paid + v_settled_total;
  END LOOP;

  v_result := jsonb_build_object(
    'agentsSettled', v_agents_settled,
    'linesSettled',  v_lines_settled,
    'totalPaid',     v_total_paid,
    'skipped',       v_skipped
  );

  -- Persist the result against the nonce so a future replay short-circuits.
  --
  -- Two distinct mechanisms protect against a duplicate batch, covering two
  -- distinct timelines — the ledger here is NOT what makes concurrency safe:
  --
  --   * SEQUENTIAL replay (reload / retry / second-tab AFTER the first txn has
  --     committed): the second call's early SELECT on settlement_uploads finds
  --     the stored result and returns it without re-recording anything. This
  --     ledger row is what enables that short-circuit.
  --
  --   * Truly CONCURRENT same-nonce txns (both start before either commits):
  --     BOTH pass the early SELECT (neither sees the other's not-yet-committed
  --     row), so the ledger does NOT serialize them. What prevents a duplicate
  --     batch is the FOR UPDATE row lock on the agent's `due` commissions above:
  --     the second txn blocks on those locked rows until the first commits, then
  --     under READ COMMITTED its `WHERE status='due'` re-check returns 0 rows
  --     (the first txn flipped them to `paid`), so it settles nothing and records
  --     no batch. The ON CONFLICT DO NOTHING below is then only a belt-and-braces
  --     guard so the losing txn's ledger INSERT (if it reached here at all) does
  --     not error on the duplicate nonce — it is NOT the concurrency primitive.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.settlement_uploads (nonce, result)
    VALUES (p_nonce, v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

-- Drop the old single-arg signature so callers can't accidentally invoke a
-- stale, non-idempotent overload (CREATE OR REPLACE only matches identical
-- argument lists; the 0031 (jsonb) function is a distinct overload).
DROP FUNCTION IF EXISTS public.apply_settlement(jsonb);

REVOKE ALL ON FUNCTION public.apply_settlement(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_settlement(jsonb, text) TO authenticated;

-- =============================================================================
-- End of 0032_fix_settlement_apply.sql
-- =============================================================================
