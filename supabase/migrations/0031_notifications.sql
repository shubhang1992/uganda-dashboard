-- =============================================================================
-- Universal Pensions Uganda — 0031: notifications + settlement RPCs
-- =============================================================================
-- Phase 1 of the commission-flow simplification. Adds:
--   * a `notifications` feed table (agent / branch recipients), SELECT-only RLS.
--   * apply_settlement(p_rows jsonb) — distributor-only SECURITY DEFINER RPC
--     that stamps an agent's `due` commissions as `paid`, records a
--     settlement_batches row (0030), and emits notifications.
--   * mark_notifications_read(p_ids text[]) — owner-scoped read-receipt RPC.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * SECURITY DEFINER RPCs read auth.jwt() ->> 'app_role' (NEVER 'role').
--     Branch/agent scoping reads 'branchId' / 'agentId'.
--   * search_path pinned per the 0010+ convention.
--   * SELECT-only RLS on notifications; all writes flow through the two RPCs.
--   * ID generation uses gen_random_uuid() (pg_catalog built-in; pgcrypto is
--     already installed in the `extensions` schema per 0012, but
--     gen_random_uuid() needs neither). Pattern mirrors the deterministic
--     text-PK convention elsewhere in the schema (prefix + opaque suffix):
--     'sb-' || … for batches, 'ntf-' || … for notifications.
--   * Forward-only; reversible via 0031_notifications.down.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id             TEXT PRIMARY KEY,
  recipient_role TEXT NOT NULL,           -- 'agent' | 'branch'
  recipient_id   TEXT NOT NULL,
  type           TEXT NOT NULL,           -- 'commission_settled'
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  amount         NUMERIC,
  ref_id         TEXT,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications (recipient_role, recipient_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE  ROW LEVEL SECURITY;

-- SELECT policies: agent reads its own feed; branch reads its own feed;
-- distributor may read all (oversight).
DROP POLICY IF EXISTS notifications_select_agent ON public.notifications;
CREATE POLICY notifications_select_agent ON public.notifications
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND recipient_role = 'agent'
    AND recipient_id = (SELECT auth.jwt()) ->> 'agentId'
  );

DROP POLICY IF EXISTS notifications_select_branch ON public.notifications;
CREATE POLICY notifications_select_branch ON public.notifications
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND recipient_role = 'branch'
    AND recipient_id = (SELECT auth.jwt()) ->> 'branchId'
  );

DROP POLICY IF EXISTS notifications_select_distributor ON public.notifications;
CREATE POLICY notifications_select_distributor ON public.notifications
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');

-- No direct INSERT/UPDATE/DELETE policies — writes go through the RPCs below.

GRANT SELECT ON public.notifications TO authenticated;


-- -----------------------------------------------------------------------------
-- apply_settlement(p_rows jsonb) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Distributor-only. p_rows is a JSON array of objects, one per agent:
--   { "agentId": text, "amountPaid": numeric, "paymentRef": text,
--     "paymentDate": text (YYYY-MM-DD) }
--
-- For each element:
--   * Find the agent's `due` commissions. If none, append
--     {agentId, reason:'no_due'} to the skipped array and continue.
--   * Otherwise compute pending_total = SUM(amount) and line_count, stamp those
--     commissions paid (status='paid', paid_date, txn_ref, paid_amount), record
--     one settlement_batches row, and emit a notification to the agent plus —
--     if the agent has a branch — one to the branch.
--
-- Returns:
--   { agentsSettled, linesSettled, totalPaid, skipped: [ {agentId, reason} ] }
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_settlement(p_rows jsonb)
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
BEGIN
  IF v_role IS DISTINCT FROM 'distributor' THEN
    RAISE EXCEPTION 'role % cannot apply a settlement', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_agent_id     := v_row ->> 'agentId';
    v_amount_paid  := (v_row ->> 'amountPaid')::numeric;
    v_payment_ref  := v_row ->> 'paymentRef';
    v_payment_date := COALESCE((v_row ->> 'paymentDate')::date, current_date);

    IF v_agent_id IS NULL OR v_agent_id = '' THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('agentId', v_agent_id, 'reason', 'missing_agent_id')
      );
      CONTINUE;
    END IF;

    -- Compute the due slice for this agent.
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

    -- Resolve the agent's branch (denormalised onto each commission, but read
    -- from the agents table so a NULL-branch agent is handled consistently).
    SELECT branch_id INTO v_branch_id FROM public.agents WHERE id = v_agent_id;

    -- Stamp the due lines paid.
    UPDATE public.commissions
       SET status      = 'paid',
           paid_date   = v_payment_date,
           txn_ref     = v_payment_ref,
           paid_amount = v_amount_paid
     WHERE agent_id = v_agent_id
       AND status = 'due';

    -- Record the batch.
    v_batch_id := 'sb-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.settlement_batches (
      id, agent_id, branch_id, pending_total, paid_amount,
      txn_ref, paid_date, line_count
    ) VALUES (
      v_batch_id, v_agent_id, v_branch_id, v_pending_total, v_amount_paid,
      v_payment_ref, v_payment_date, v_line_count
    );

    -- Notify the agent.
    INSERT INTO public.notifications (
      id, recipient_role, recipient_id, type, title, body, amount, ref_id
    ) VALUES (
      'ntf-' || replace(gen_random_uuid()::text, '-', ''),
      'agent',
      v_agent_id,
      'commission_settled',
      'Commission settled',
      'UGX ' || v_amount_paid || ' paid for ' || v_line_count || ' commissions.',
      v_amount_paid,
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
        'UGX ' || v_amount_paid || ' paid for ' || v_line_count || ' commissions.',
        v_amount_paid,
        v_batch_id
      );
    END IF;

    v_agents_settled := v_agents_settled + 1;
    v_lines_settled  := v_lines_settled + v_line_count;
    v_total_paid     := v_total_paid + v_amount_paid;
  END LOOP;

  RETURN jsonb_build_object(
    'agentsSettled', v_agents_settled,
    'linesSettled',  v_lines_settled,
    'totalPaid',     v_total_paid,
    'skipped',       v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_settlement(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_settlement(jsonb) TO authenticated;


-- -----------------------------------------------------------------------------
-- mark_notifications_read(p_ids text[]) RETURNS void
-- -----------------------------------------------------------------------------
-- Marks the caller's own notifications read. SECURITY DEFINER (notifications
-- has no UPDATE policy), so ownership is re-checked inside the function against
-- the caller's app_role + agentId/branchId claims. Distributor is allowed to
-- mark any notification read (oversight, mirrors its broad SELECT policy).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text := (SELECT auth.jwt()) ->> 'app_role';
  v_agent  text := (SELECT auth.jwt()) ->> 'agentId';
  v_branch text := (SELECT auth.jwt()) ->> 'branchId';
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_role = 'distributor' THEN
    UPDATE public.notifications
       SET is_read = TRUE
     WHERE id = ANY(p_ids);
  ELSIF v_role = 'agent' THEN
    IF v_agent IS NULL OR v_agent = '' THEN
      RAISE EXCEPTION 'agentId claim missing from JWT' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.notifications
       SET is_read = TRUE
     WHERE id = ANY(p_ids)
       AND recipient_role = 'agent'
       AND recipient_id = v_agent;
  ELSIF v_role = 'branch' THEN
    IF v_branch IS NULL OR v_branch = '' THEN
      RAISE EXCEPTION 'branchId claim missing from JWT' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.notifications
       SET is_read = TRUE
     WHERE id = ANY(p_ids)
       AND recipient_role = 'branch'
       AND recipient_id = v_branch;
  ELSE
    RAISE EXCEPTION 'role % cannot mark notifications read', v_role
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(text[]) TO authenticated;

-- =============================================================================
-- End of 0031_notifications.sql
-- =============================================================================
