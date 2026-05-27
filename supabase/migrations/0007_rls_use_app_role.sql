-- =============================================================================
-- Universal Pensions Uganda — 0007: switch RLS from `role` to `app_role`
-- =============================================================================
-- PostgREST treats the JWT `role` claim as the Postgres role to `SET ROLE`
-- against. Our app-level role (subscriber / agent / branch / distributor)
-- is not a Postgres role — issuing JWTs with `role: "subscriber"` made
-- PostgREST 401 with `22023 role "subscriber" does not exist`.
--
-- Fix: JWTs now carry `role: "authenticated"` (Postgres) and a separate
-- `app_role` claim for the application role. This migration rewrites every
-- policy in 0003_rls_policies.sql that read `auth.jwt() ->> 'role'` so it
-- reads `auth.jwt() ->> 'app_role'` instead. Policy names are preserved.
--
-- Forward-only: each policy is dropped (IF EXISTS) then re-created with the
-- new predicate. Re-running the migration is safe.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Reference tables — gate on app_role IS NOT NULL.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS regions_select_authenticated ON regions;
CREATE POLICY regions_select_authenticated ON regions
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS districts_select_authenticated ON districts;
CREATE POLICY districts_select_authenticated ON districts
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS branches_select_authenticated ON branches;
CREATE POLICY branches_select_authenticated ON branches
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS agents_select_authenticated ON agents;
CREATE POLICY agents_select_authenticated ON agents
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS commission_config_select_authenticated ON commission_config;
CREATE POLICY commission_config_select_authenticated ON commission_config
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS demo_personas_select_authenticated ON demo_personas;
CREATE POLICY demo_personas_select_authenticated ON demo_personas
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' IS NOT NULL);


-- -----------------------------------------------------------------------------
-- subscribers — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS subscribers_select_self ON subscribers;
CREATE POLICY subscribers_select_self ON subscribers
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS subscribers_select_agent ON subscribers;
CREATE POLICY subscribers_select_agent ON subscribers
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND agent_id = auth.jwt() ->> 'agentId'
  );

DROP POLICY IF EXISTS subscribers_select_branch ON subscribers;
CREATE POLICY subscribers_select_branch ON subscribers
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = subscribers.agent_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS subscribers_select_distributor ON subscribers;
CREATE POLICY subscribers_select_distributor ON subscribers
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- subscriber_balances — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS subscriber_balances_select_self ON subscriber_balances;
CREATE POLICY subscriber_balances_select_self ON subscriber_balances
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS subscriber_balances_select_agent ON subscriber_balances;
CREATE POLICY subscriber_balances_select_agent ON subscriber_balances
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = subscriber_balances.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS subscriber_balances_select_branch ON subscriber_balances;
CREATE POLICY subscriber_balances_select_branch ON subscriber_balances
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = subscriber_balances.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS subscriber_balances_select_distributor ON subscriber_balances;
CREATE POLICY subscriber_balances_select_distributor ON subscriber_balances
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- contribution_schedules — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS contribution_schedules_select_self ON contribution_schedules;
CREATE POLICY contribution_schedules_select_self ON contribution_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS contribution_schedules_select_agent ON contribution_schedules;
CREATE POLICY contribution_schedules_select_agent ON contribution_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = contribution_schedules.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS contribution_schedules_select_branch ON contribution_schedules;
CREATE POLICY contribution_schedules_select_branch ON contribution_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = contribution_schedules.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS contribution_schedules_select_distributor ON contribution_schedules;
CREATE POLICY contribution_schedules_select_distributor ON contribution_schedules
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- insurance_policies — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS insurance_policies_select_self ON insurance_policies;
CREATE POLICY insurance_policies_select_self ON insurance_policies
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS insurance_policies_select_agent ON insurance_policies;
CREATE POLICY insurance_policies_select_agent ON insurance_policies
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = insurance_policies.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS insurance_policies_select_branch ON insurance_policies;
CREATE POLICY insurance_policies_select_branch ON insurance_policies
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = insurance_policies.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS insurance_policies_select_distributor ON insurance_policies;
CREATE POLICY insurance_policies_select_distributor ON insurance_policies
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- nominees — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS nominees_select_self ON nominees;
CREATE POLICY nominees_select_self ON nominees
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS nominees_select_agent ON nominees;
CREATE POLICY nominees_select_agent ON nominees
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = nominees.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS nominees_select_branch ON nominees;
CREATE POLICY nominees_select_branch ON nominees
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = nominees.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS nominees_select_distributor ON nominees;
CREATE POLICY nominees_select_distributor ON nominees
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- transactions — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS transactions_select_self ON transactions;
CREATE POLICY transactions_select_self ON transactions
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS transactions_select_agent ON transactions;
CREATE POLICY transactions_select_agent ON transactions
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = transactions.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS transactions_select_branch ON transactions;
CREATE POLICY transactions_select_branch ON transactions
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = transactions.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS transactions_select_distributor ON transactions;
CREATE POLICY transactions_select_distributor ON transactions
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- claims — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS claims_select_self ON claims;
CREATE POLICY claims_select_self ON claims
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS claims_select_agent ON claims;
CREATE POLICY claims_select_agent ON claims
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = claims.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS claims_select_branch ON claims;
CREATE POLICY claims_select_branch ON claims
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = claims.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS claims_select_distributor ON claims;
CREATE POLICY claims_select_distributor ON claims
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- withdrawals — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS withdrawals_select_self ON withdrawals;
CREATE POLICY withdrawals_select_self ON withdrawals
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS withdrawals_select_agent ON withdrawals;
CREATE POLICY withdrawals_select_agent ON withdrawals
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = withdrawals.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS withdrawals_select_branch ON withdrawals;
CREATE POLICY withdrawals_select_branch ON withdrawals
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = withdrawals.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS withdrawals_select_distributor ON withdrawals;
CREATE POLICY withdrawals_select_distributor ON withdrawals
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commissions — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS commissions_select_agent ON commissions;
CREATE POLICY commissions_select_agent ON commissions
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND agent_id = auth.jwt() ->> 'agentId'
  );

DROP POLICY IF EXISTS commissions_select_branch ON commissions;
CREATE POLICY commissions_select_branch ON commissions
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );

DROP POLICY IF EXISTS commissions_select_distributor ON commissions;
CREATE POLICY commissions_select_distributor ON commissions
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- settlement_runs — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS settlement_runs_select_agent ON settlement_runs;
CREATE POLICY settlement_runs_select_agent ON settlement_runs
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM commissions c
      WHERE c.run_id = settlement_runs.id
        AND c.agent_id = auth.jwt() ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS settlement_runs_select_branch ON settlement_runs;
CREATE POLICY settlement_runs_select_branch ON settlement_runs
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1 FROM settlement_run_branch_reviews r
      WHERE r.run_id = settlement_runs.id
        AND r.branch_id = auth.jwt() ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS settlement_runs_select_distributor ON settlement_runs;
CREATE POLICY settlement_runs_select_distributor ON settlement_runs
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- settlement_run_branch_reviews — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS settlement_run_branch_reviews_select_branch ON settlement_run_branch_reviews;
CREATE POLICY settlement_run_branch_reviews_select_branch ON settlement_run_branch_reviews
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );

DROP POLICY IF EXISTS settlement_run_branch_reviews_select_distributor ON settlement_run_branch_reviews;
CREATE POLICY settlement_run_branch_reviews_select_distributor ON settlement_run_branch_reviews
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- users / agent_referrals / contact_submissions — distributor SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_distributor ON users;
CREATE POLICY users_select_distributor ON users
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS agent_referrals_select_distributor ON agent_referrals;
CREATE POLICY agent_referrals_select_distributor ON agent_referrals
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS contact_submissions_select_distributor ON contact_submissions;
CREATE POLICY contact_submissions_select_distributor ON contact_submissions
  FOR SELECT
  USING (auth.jwt() ->> 'app_role' = 'distributor');


-- =============================================================================
-- WRITE POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subscribers — INSERT (agent) / UPDATE (self)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS subscribers_insert_agent ON subscribers;
CREATE POLICY subscribers_insert_agent ON subscribers
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'agent'
    AND agent_id = auth.jwt() ->> 'agentId'
  );

-- subscribers_update_self uses 0005's simplified form — ownership-only.
-- The column-pinning subqueries from 0003 trigger infinite RLS recursion
-- (0005 replaced them with the trg_subscribers_enforce_editable_cols
-- BEFORE-UPDATE trigger, which is also updated below to read app_role).
DROP POLICY IF EXISTS subscribers_update_self ON subscribers;
CREATE POLICY subscribers_update_self ON subscribers
  FOR UPDATE
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- transactions / claims / withdrawals — subscriber INSERT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS transactions_insert_self ON transactions;
CREATE POLICY transactions_insert_self ON transactions
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS claims_insert_self ON claims;
CREATE POLICY claims_insert_self ON claims
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS withdrawals_insert_self ON withdrawals;
CREATE POLICY withdrawals_insert_self ON withdrawals
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- nominees — subscriber INSERT / UPDATE / DELETE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS nominees_insert_self ON nominees;
CREATE POLICY nominees_insert_self ON nominees
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS nominees_update_self ON nominees;
CREATE POLICY nominees_update_self ON nominees
  FOR UPDATE
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS nominees_delete_self ON nominees;
CREATE POLICY nominees_delete_self ON nominees
  FOR DELETE
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- contribution_schedules — subscriber UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS contribution_schedules_update_self ON contribution_schedules;
CREATE POLICY contribution_schedules_update_self ON contribution_schedules
  FOR UPDATE
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- insurance_policies — subscriber INSERT / UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS insurance_policies_insert_self ON insurance_policies;
CREATE POLICY insurance_policies_insert_self ON insurance_policies
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

DROP POLICY IF EXISTS insurance_policies_update_self ON insurance_policies;
CREATE POLICY insurance_policies_update_self ON insurance_policies
  FOR UPDATE
  USING (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- agents — branch INSERT / UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS agents_insert_branch ON agents;
CREATE POLICY agents_insert_branch ON agents
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );

DROP POLICY IF EXISTS agents_update_branch ON agents;
CREATE POLICY agents_update_branch ON agents
  FOR UPDATE
  USING (
    auth.jwt() ->> 'app_role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  )
  WITH CHECK (
    auth.jwt() ->> 'app_role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );


-- -----------------------------------------------------------------------------
-- branches — distributor INSERT / UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS branches_insert_distributor ON branches;
CREATE POLICY branches_insert_distributor ON branches
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS branches_update_distributor ON branches;
CREATE POLICY branches_update_distributor ON branches
  FOR UPDATE
  USING  (auth.jwt() ->> 'app_role' = 'distributor')
  WITH CHECK (auth.jwt() ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commission_config — distributor UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS commission_config_update_distributor ON commission_config;
CREATE POLICY commission_config_update_distributor ON commission_config
  FOR UPDATE
  USING  (auth.jwt() ->> 'app_role' = 'distributor')
  WITH CHECK (auth.jwt() ->> 'app_role' = 'distributor');


-- =============================================================================
-- RPC + TRIGGER FUNCTION BODIES — swap `role` → `app_role`
-- =============================================================================
-- 0004 defines 13 SECURITY DEFINER commission state-machine RPCs and 0005
-- defines `trg_subscribers_enforce_editable_cols`. Each reads
-- `auth.jwt() ->> 'role'` to gate the caller; with JWTs now carrying the app
-- role under `app_role`, those checks would always see 'authenticated' and
-- reject every caller.
--
-- Rather than copy ~1000 lines of pl/pgsql verbatim into this migration, we
-- pull the current definition of each function via `pg_get_functiondef`, do
-- a literal-string swap (`auth.jwt() ->> 'role'` → `auth.jwt() ->> 'app_role'`),
-- and re-issue the CREATE OR REPLACE. This keeps the bodies in sync with
-- whatever 0004/0005 last installed and is idempotent — re-running the
-- migration replaces the bodies with themselves after the first pass (since
-- the source string is no longer present, the replace is a no-op).
--
-- If a future migration introduces a new function that reads the role claim,
-- include it here too.

DO $migration$
DECLARE
  v_signature text;
  v_def       text;
  v_funcs     text[] := ARRAY[
    'public.open_run()',
    'public.cancel_run(text)',
    'public.release_run(text)',
    'public.release_branch(text, text)',
    'public.branch_approve_all(text)',
    'public.mark_branch_reviewed(text)',
    'public.branch_approve_line(text)',
    'public.branch_hold_line(text, text)',
    'public.branch_dispute_line(text, text)',
    'public.approve_dispute(text, text)',
    'public.reject_dispute(text, text)',
    'public.withdraw_dispute(text)',
    'public.agent_confirm_commission(text)',
    'public.trg_subscribers_enforce_editable_cols()'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_funcs LOOP
    v_def := pg_get_functiondef(v_signature::regprocedure);
    v_def := replace(v_def, 'auth.jwt() ->> ''role''', 'auth.jwt() ->> ''app_role''');
    EXECUTE v_def;
  END LOOP;
END
$migration$;


-- =============================================================================
-- End of 0007_rls_use_app_role.sql
-- =============================================================================
