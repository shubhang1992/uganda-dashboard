-- =============================================================================
-- Universal Pensions Uganda — 0043: subscriber ⇄ employer link + contribution source
-- =============================================================================
-- Unifies the employer roster into the subscriber model. An employer-onboarded
-- "employee" is now a REAL subscriber tagged to the employer (subscribers.
-- employer_id), so they get a subscriber identity + dashboard login. Employer
-- contributions ride the normal `transactions` ledger, distinguished from the
-- subscriber's own money by `transactions.source` ('own' | 'employer') and
-- linked to their run header via `transactions.contribution_run_id`.
--
-- This migration is ADDITIVE (no drops). The new write RPCs land in 0044; the
-- old standalone `employees` machinery is retired in 0045.
--
-- CONVENTIONS (mirroring 0001 / 0003 / 0034):
--   * TEXT FKs; snake_case; forward-only, reversible via the .down.sql.
--   * RLS HARD RULE (CLAUDE.md §5.7): read (SELECT auth.jwt()) ->> 'app_role'
--     (NEVER 'role'). The role-scoped claim is camelCase `employerId`.
--   * Employer SELECT policies mirror the agent policies in 0008, scoped by
--     subscribers.employer_id instead of subscribers.agent_id.
--   * auth.jwt() wrapped in (SELECT ...) for the initplan optimisation (0008).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) subscribers.employer_id — tag a subscriber to an employer (NULL = ordinary
--    subscriber in the agent→distributor tree). ON DELETE SET NULL so removing a
--    demo employer doesn't cascade-delete real subscriber records.
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS employer_id TEXT
    REFERENCES public.employers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS subscribers_employer_id_idx
  ON public.subscribers (employer_id);

COMMENT ON COLUMN public.subscribers.employer_id IS
  'Optional link to the employer that onboarded this subscriber (0043). NULL = '
  'ordinary subscriber. A tagged subscriber is the unified replacement for the '
  'retired employees roster; the employer dashboard reads subscribers WHERE '
  'employer_id = <me>. The subscriber keeps agent_id = NULL (no agent commission).';

-- -----------------------------------------------------------------------------
-- 2) transactions.source — distinguish the subscriber's OWN money from the
--    EMPLOYER-funded portion on the shared ledger. Existing rows backfill to
--    'own' (every pre-0043 contribution was subscriber/agent-authored).
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'own'
    CHECK (source IN ('own', 'employer'));

-- 3) transactions.contribution_run_id — link an employer-run contribution back
--    to its `contribution_runs` header (powers the run-detail view). NULL for
--    ordinary own/agent contributions. ON DELETE SET NULL (keep the ledger row).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS contribution_run_id TEXT
    REFERENCES public.contribution_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_contribution_run_id_idx
  ON public.transactions (contribution_run_id);

COMMENT ON COLUMN public.transactions.source IS
  '''own'' = subscriber/agent-authored contribution; ''employer'' = posted by an '
  'employer contribution run (agent_id NULL, no commission). (0043)';

-- -----------------------------------------------------------------------------
-- 4) Employer SELECT policies on the subscriber domain.
--    Mirror the agent policies (0008) but scope by subscribers.employer_id =
--    (SELECT auth.jwt()) ->> 'employerId'. The employer needs to read their
--    tagged subscribers + balances + transactions (own AND employer, to show
--    the total/own/employer breakdown) + schedules + insurance + nominees.
-- -----------------------------------------------------------------------------

-- subscribers (direct column)
DROP POLICY IF EXISTS subscribers_select_employer ON public.subscribers;
CREATE POLICY subscribers_select_employer ON public.subscribers
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND employer_id = (SELECT auth.jwt()) ->> 'employerId'
  );

-- subscriber_balances (via parent subscriber)
DROP POLICY IF EXISTS subscriber_balances_select_employer ON public.subscriber_balances;
CREATE POLICY subscriber_balances_select_employer ON public.subscriber_balances
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.id = subscriber_balances.subscriber_id
        AND s.employer_id = (SELECT auth.jwt()) ->> 'employerId'
    )
  );

-- transactions (via parent subscriber)
DROP POLICY IF EXISTS transactions_select_employer ON public.transactions;
CREATE POLICY transactions_select_employer ON public.transactions
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.id = transactions.subscriber_id
        AND s.employer_id = (SELECT auth.jwt()) ->> 'employerId'
    )
  );

-- contribution_schedules (via parent subscriber)
DROP POLICY IF EXISTS contribution_schedules_select_employer ON public.contribution_schedules;
CREATE POLICY contribution_schedules_select_employer ON public.contribution_schedules
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.id = contribution_schedules.subscriber_id
        AND s.employer_id = (SELECT auth.jwt()) ->> 'employerId'
    )
  );

-- insurance_policies (via parent subscriber)
DROP POLICY IF EXISTS insurance_policies_select_employer ON public.insurance_policies;
CREATE POLICY insurance_policies_select_employer ON public.insurance_policies
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.id = insurance_policies.subscriber_id
        AND s.employer_id = (SELECT auth.jwt()) ->> 'employerId'
    )
  );

-- nominees (via parent subscriber)
DROP POLICY IF EXISTS nominees_select_employer ON public.nominees;
CREATE POLICY nominees_select_employer ON public.nominees
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.id = nominees.subscriber_id
        AND s.employer_id = (SELECT auth.jwt()) ->> 'employerId'
    )
  );

-- -----------------------------------------------------------------------------
-- 5) Harden trg_transactions_contribution — add SECURITY DEFINER + search_path.
-- -----------------------------------------------------------------------------
-- The 0002/0042 trigger function had no SECURITY DEFINER, so it only succeeds
-- when fired inside a SECURITY DEFINER context (the signup chain, and the new
-- 0044 employer run). A DIRECT client contribution (the subscriber Save flow's
-- transactions INSERT, run as `authenticated`) would have the trigger run as
-- `authenticated`, which cannot write subscriber_balances under RLS — so the
-- balance silently never moves. Re-emit the function WITH SECURITY DEFINER +
-- a pinned search_path so it bumps balances regardless of the caller's role.
-- Body is BYTE-FAITHFUL to the 0042 re-emit; only the two clauses are added.
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
  -- (b) Bucket split ---------------------------------------------------------
  IF NEW.split_retirement IS NOT NULL AND NEW.split_emergency IS NOT NULL THEN
    v_retirement_share := NEW.split_retirement;
    v_emergency_share  := NEW.split_emergency;
  ELSE
    v_retirement_share := ROUND(NEW.amount * 0.80);
    v_emergency_share  := NEW.amount - v_retirement_share;  -- avoids penny drift
  END IF;

  -- (a) Balance update -------------------------------------------------------
  INSERT INTO public.subscriber_balances (
    subscriber_id,
    retirement_balance,
    emergency_balance,
    total_balance,
    units,
    updated_at
  ) VALUES (
    NEW.subscriber_id,
    v_retirement_share,
    v_emergency_share,
    NEW.amount,
    NEW.amount / v_unit_price,
    now()
  )
  ON CONFLICT (subscriber_id) DO UPDATE SET
    retirement_balance = public.subscriber_balances.retirement_balance + EXCLUDED.retirement_balance,
    emergency_balance  = public.subscriber_balances.emergency_balance  + EXCLUDED.emergency_balance,
    total_balance      = public.subscriber_balances.total_balance      + EXCLUDED.total_balance,
    units              = public.subscriber_balances.units              + EXCLUDED.units,
    updated_at         = now();

  -- (c) First-contribution commission ----------------------------------------
  SELECT s.agent_id, s.name, a.branch_id
    INTO v_agent_id, v_subscriber_name, v_branch_id
    FROM public.subscribers s
    LEFT JOIN public.agents a ON a.id = s.agent_id
   WHERE s.id = NEW.subscriber_id;

  IF v_agent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.commissions
       WHERE subscriber_id = NEW.subscriber_id
         AND agent_id = v_agent_id
    ) THEN
      SELECT rate INTO v_commission_rate
        FROM public.commission_config
       WHERE id = 'default';

      IF v_commission_rate IS NOT NULL THEN
        v_new_commission_id := 'c-' || lpad(
          nextval('public.commission_id_seq')::text, 8, '0'
        );

        INSERT INTO public.commissions (
          id,
          agent_id,
          branch_id,
          subscriber_id,
          subscriber_name,
          amount,
          status,
          first_contribution_date,
          due_date
        ) VALUES (
          v_new_commission_id,
          v_agent_id,
          v_branch_id,
          NEW.subscriber_id,
          v_subscriber_name,
          v_commission_rate,
          'due',
          NEW.date::date,
          NEW.date::date
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-bind idempotently (matches the 0002/0042 DROP/CREATE shape).
DROP TRIGGER IF EXISTS transactions_after_insert_contribution ON public.transactions;
CREATE TRIGGER transactions_after_insert_contribution
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'contribution')
  EXECUTE FUNCTION public.trg_transactions_contribution();

-- =============================================================================
-- End of 0043_subscriber_employer_link.sql
-- Partner: 0044_employer_subscriber_rpcs.sql (onboard + run + metrics).
-- =============================================================================
