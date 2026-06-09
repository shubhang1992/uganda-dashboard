-- =============================================================================
-- DOWN — 0043_subscriber_employer_link.sql
-- =============================================================================
-- Reverses the additive link/source schema and the employer SELECT policies.
--
-- §1b.6 hardening: this .down re-emits trg_transactions_contribution WITH
-- SECURITY DEFINER + a pinned search_path (the HARDENED 0043 definition), NOT
-- the un-hardened 0042 body. The DEFINER/pin is the 0006 baseline that predates
-- this migration's *additive* schema; rolling 0043 back must not silently
-- re-open the security regression (a subscriber-role direct contribution would
-- otherwise fail RLS on subscriber_balances, or run with a caller-controlled
-- search_path). Body is byte-faithful to the 0043 up re-emit.
-- =============================================================================

-- 5) Restore trg_transactions_contribution to its HARDENED 0043 definition
--    (DEFINER + pinned search_path retained — see header).
CREATE OR REPLACE FUNCTION public.trg_transactions_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit_price       NUMERIC := 1000;
  v_retirement_share NUMERIC;
  v_emergency_share  NUMERIC;
  v_agent_id         TEXT;
  v_branch_id        TEXT;
  v_subscriber_name  TEXT;
  v_commission_rate  NUMERIC;
  v_new_commission_id TEXT;
BEGIN
  IF NEW.split_retirement IS NOT NULL AND NEW.split_emergency IS NOT NULL THEN
    v_retirement_share := NEW.split_retirement;
    v_emergency_share  := NEW.split_emergency;
  ELSE
    v_retirement_share := ROUND(NEW.amount * 0.80);
    v_emergency_share  := NEW.amount - v_retirement_share;
  END IF;

  INSERT INTO public.subscriber_balances (
    subscriber_id, retirement_balance, emergency_balance, total_balance, units, updated_at
  ) VALUES (
    NEW.subscriber_id, v_retirement_share, v_emergency_share,
    NEW.amount, NEW.amount / v_unit_price, now()
  )
  ON CONFLICT (subscriber_id) DO UPDATE SET
    retirement_balance = public.subscriber_balances.retirement_balance + EXCLUDED.retirement_balance,
    emergency_balance  = public.subscriber_balances.emergency_balance  + EXCLUDED.emergency_balance,
    total_balance      = public.subscriber_balances.total_balance      + EXCLUDED.total_balance,
    units              = public.subscriber_balances.units              + EXCLUDED.units,
    updated_at         = now();

  SELECT s.agent_id, s.name, a.branch_id
    INTO v_agent_id, v_subscriber_name, v_branch_id
    FROM public.subscribers s
    LEFT JOIN public.agents a ON a.id = s.agent_id
   WHERE s.id = NEW.subscriber_id;

  IF v_agent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.commissions
       WHERE subscriber_id = NEW.subscriber_id AND agent_id = v_agent_id
    ) THEN
      SELECT rate INTO v_commission_rate FROM public.commission_config WHERE id = 'default';
      IF v_commission_rate IS NOT NULL THEN
        v_new_commission_id := 'c-' || lpad(nextval('public.commission_id_seq')::text, 8, '0');
        INSERT INTO public.commissions (
          id, agent_id, branch_id, subscriber_id, subscriber_name,
          amount, status, first_contribution_date, due_date
        ) VALUES (
          v_new_commission_id, v_agent_id, v_branch_id, NEW.subscriber_id, v_subscriber_name,
          v_commission_rate, 'due', NEW.date::date, NEW.date::date
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_after_insert_contribution ON public.transactions;
CREATE TRIGGER transactions_after_insert_contribution
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'contribution')
  EXECUTE FUNCTION public.trg_transactions_contribution();

-- 4) Drop employer SELECT policies.
DROP POLICY IF EXISTS subscribers_select_employer            ON public.subscribers;
DROP POLICY IF EXISTS subscriber_balances_select_employer    ON public.subscriber_balances;
DROP POLICY IF EXISTS transactions_select_employer           ON public.transactions;
DROP POLICY IF EXISTS contribution_schedules_select_employer ON public.contribution_schedules;
DROP POLICY IF EXISTS insurance_policies_select_employer     ON public.insurance_policies;
DROP POLICY IF EXISTS nominees_select_employer               ON public.nominees;

-- 3) + 2) Drop transactions columns (CHECK + FK drop with the columns).
DROP INDEX IF EXISTS public.transactions_contribution_run_id_idx;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS contribution_run_id;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS source;

-- 1) Drop subscribers.employer_id.
DROP INDEX IF EXISTS public.subscribers_employer_id_idx;
ALTER TABLE public.subscribers DROP COLUMN IF EXISTS employer_id;

-- =============================================================================
-- End of 0043_subscriber_employer_link.down.sql
-- =============================================================================
