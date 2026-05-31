-- =============================================================================
-- Universal Pensions Uganda — 0032 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0032_fix_settlement_apply.sql. NOT part of the forward-only chain; for
-- manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0032_fix_settlement_apply.down.sql
--
-- Restores the 0031 single-arg apply_settlement(jsonb) (whole-batch paid_amount,
-- all-due over-clear, no idempotency), drops the two-arg version, the
-- settlement_uploads ledger, and the client_nonce column.
--
-- NOTE: rolling back re-introduces BL-1/BL-2/BL-8/BL-13/BL-18. Only do this if
-- 0032 itself is the cause of a regression. Already-recorded FIFO-allocated
-- per-line paid_amount values are NOT reverted (data, not schema). Drop order
-- here is 0032-then-(0031 stays); 0030/0031 still roll back as a pair,
-- 0031-then-0030 (BACKEND.md §11).
-- =============================================================================

DROP FUNCTION IF EXISTS public.apply_settlement(jsonb, text);

ALTER TABLE public.settlement_batches DROP COLUMN IF EXISTS client_nonce;
DROP TABLE IF EXISTS public.settlement_uploads;

-- Re-create the original 0031 apply_settlement(jsonb) verbatim (whole-batch
-- paid_amount stamped on every due line; no FIFO, rounding, or idempotency).
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

    SELECT branch_id INTO v_branch_id FROM public.agents WHERE id = v_agent_id;

    UPDATE public.commissions
       SET status      = 'paid',
           paid_date   = v_payment_date,
           txn_ref     = v_payment_ref,
           paid_amount = v_amount_paid
     WHERE agent_id = v_agent_id
       AND status = 'due';

    v_batch_id := 'sb-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.settlement_batches (
      id, agent_id, branch_id, pending_total, paid_amount,
      txn_ref, paid_date, line_count
    ) VALUES (
      v_batch_id, v_agent_id, v_branch_id, v_pending_total, v_amount_paid,
      v_payment_ref, v_payment_date, v_line_count
    );

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

-- =============================================================================
-- End of 0032_fix_settlement_apply.down.sql
-- =============================================================================
