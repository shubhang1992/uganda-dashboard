-- =============================================================================
-- Universal Pensions Uganda — 0008: wrap auth.jwt() in (SELECT ...) initplan
-- =============================================================================
-- Supabase performance lint 0003 (auth_rls_initplan): every RLS policy that
-- calls auth.jwt() / current_setting() re-evaluates it per row instead of
-- once per query. With our largest tables (transactions 522K, nominees 145K,
-- subscribers 30K), that is the dominant cost on every authenticated read.
--
-- Fix per Supabase recommendation: replace each `auth.jwt()` with
-- `(SELECT auth.jwt())` so the planner pulls it into an InitPlan node that
-- runs exactly once and caches the JSON result for the rest of the query.
--
-- Behavior is identical — the only change is when the JWT is read. This
-- migration is forward-only and re-runnable (DROP IF EXISTS + CREATE).
--
-- Policy bodies are otherwise byte-for-byte the same as 0007.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Reference tables — gate on app_role IS NOT NULL.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS regions_select_authenticated ON regions;
CREATE POLICY regions_select_authenticated ON regions
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS districts_select_authenticated ON districts;
CREATE POLICY districts_select_authenticated ON districts
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS branches_select_authenticated ON branches;
CREATE POLICY branches_select_authenticated ON branches
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS agents_select_authenticated ON agents;
CREATE POLICY agents_select_authenticated ON agents
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS commission_config_select_authenticated ON commission_config;
CREATE POLICY commission_config_select_authenticated ON commission_config
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' IS NOT NULL);

DROP POLICY IF EXISTS demo_personas_select_authenticated ON demo_personas;
CREATE POLICY demo_personas_select_authenticated ON demo_personas
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' IS NOT NULL);


-- -----------------------------------------------------------------------------
-- subscribers — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS subscribers_select_self ON subscribers;
CREATE POLICY subscribers_select_self ON subscribers
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS subscribers_select_agent ON subscribers;
CREATE POLICY subscribers_select_agent ON subscribers
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND agent_id = (SELECT auth.jwt()) ->> 'agentId'
  );

DROP POLICY IF EXISTS subscribers_select_branch ON subscribers;
CREATE POLICY subscribers_select_branch ON subscribers
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = subscribers.agent_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS subscribers_select_distributor ON subscribers;
CREATE POLICY subscribers_select_distributor ON subscribers
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- subscriber_balances — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS subscriber_balances_select_self ON subscriber_balances;
CREATE POLICY subscriber_balances_select_self ON subscriber_balances
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS subscriber_balances_select_agent ON subscriber_balances;
CREATE POLICY subscriber_balances_select_agent ON subscriber_balances
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = subscriber_balances.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS subscriber_balances_select_branch ON subscriber_balances;
CREATE POLICY subscriber_balances_select_branch ON subscriber_balances
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = subscriber_balances.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS subscriber_balances_select_distributor ON subscriber_balances;
CREATE POLICY subscriber_balances_select_distributor ON subscriber_balances
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- contribution_schedules — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS contribution_schedules_select_self ON contribution_schedules;
CREATE POLICY contribution_schedules_select_self ON contribution_schedules
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS contribution_schedules_select_agent ON contribution_schedules;
CREATE POLICY contribution_schedules_select_agent ON contribution_schedules
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = contribution_schedules.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS contribution_schedules_select_branch ON contribution_schedules;
CREATE POLICY contribution_schedules_select_branch ON contribution_schedules
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = contribution_schedules.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS contribution_schedules_select_distributor ON contribution_schedules;
CREATE POLICY contribution_schedules_select_distributor ON contribution_schedules
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- insurance_policies — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS insurance_policies_select_self ON insurance_policies;
CREATE POLICY insurance_policies_select_self ON insurance_policies
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS insurance_policies_select_agent ON insurance_policies;
CREATE POLICY insurance_policies_select_agent ON insurance_policies
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = insurance_policies.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS insurance_policies_select_branch ON insurance_policies;
CREATE POLICY insurance_policies_select_branch ON insurance_policies
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = insurance_policies.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS insurance_policies_select_distributor ON insurance_policies;
CREATE POLICY insurance_policies_select_distributor ON insurance_policies
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- nominees — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS nominees_select_self ON nominees;
CREATE POLICY nominees_select_self ON nominees
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS nominees_select_agent ON nominees;
CREATE POLICY nominees_select_agent ON nominees
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = nominees.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS nominees_select_branch ON nominees;
CREATE POLICY nominees_select_branch ON nominees
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = nominees.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS nominees_select_distributor ON nominees;
CREATE POLICY nominees_select_distributor ON nominees
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- transactions — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS transactions_select_self ON transactions;
CREATE POLICY transactions_select_self ON transactions
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS transactions_select_agent ON transactions;
CREATE POLICY transactions_select_agent ON transactions
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = transactions.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS transactions_select_branch ON transactions;
CREATE POLICY transactions_select_branch ON transactions
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = transactions.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS transactions_select_distributor ON transactions;
CREATE POLICY transactions_select_distributor ON transactions
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- claims — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS claims_select_self ON claims;
CREATE POLICY claims_select_self ON claims
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS claims_select_agent ON claims;
CREATE POLICY claims_select_agent ON claims
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = claims.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS claims_select_branch ON claims;
CREATE POLICY claims_select_branch ON claims
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = claims.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS claims_select_distributor ON claims;
CREATE POLICY claims_select_distributor ON claims
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- withdrawals — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS withdrawals_select_self ON withdrawals;
CREATE POLICY withdrawals_select_self ON withdrawals
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS withdrawals_select_agent ON withdrawals;
CREATE POLICY withdrawals_select_agent ON withdrawals
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = withdrawals.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS withdrawals_select_branch ON withdrawals;
CREATE POLICY withdrawals_select_branch ON withdrawals
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = withdrawals.subscriber_id
        AND a.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS withdrawals_select_distributor ON withdrawals;
CREATE POLICY withdrawals_select_distributor ON withdrawals
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commissions — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS commissions_select_agent ON commissions;
CREATE POLICY commissions_select_agent ON commissions
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND agent_id = (SELECT auth.jwt()) ->> 'agentId'
  );

DROP POLICY IF EXISTS commissions_select_branch ON commissions;
CREATE POLICY commissions_select_branch ON commissions
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND branch_id = (SELECT auth.jwt()) ->> 'branchId'
  );

DROP POLICY IF EXISTS commissions_select_distributor ON commissions;
CREATE POLICY commissions_select_distributor ON commissions
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- settlement_runs — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS settlement_runs_select_agent ON settlement_runs;
CREATE POLICY settlement_runs_select_agent ON settlement_runs
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM commissions c
      WHERE c.run_id = settlement_runs.id
        AND c.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

DROP POLICY IF EXISTS settlement_runs_select_branch ON settlement_runs;
CREATE POLICY settlement_runs_select_branch ON settlement_runs
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND EXISTS (
      SELECT 1 FROM settlement_run_branch_reviews r
      WHERE r.run_id = settlement_runs.id
        AND r.branch_id = (SELECT auth.jwt()) ->> 'branchId'
    )
  );

DROP POLICY IF EXISTS settlement_runs_select_distributor ON settlement_runs;
CREATE POLICY settlement_runs_select_distributor ON settlement_runs
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- settlement_run_branch_reviews — SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS settlement_run_branch_reviews_select_branch ON settlement_run_branch_reviews;
CREATE POLICY settlement_run_branch_reviews_select_branch ON settlement_run_branch_reviews
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND branch_id = (SELECT auth.jwt()) ->> 'branchId'
  );

DROP POLICY IF EXISTS settlement_run_branch_reviews_select_distributor ON settlement_run_branch_reviews;
CREATE POLICY settlement_run_branch_reviews_select_distributor ON settlement_run_branch_reviews
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- users / agent_referrals / contact_submissions — distributor SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_distributor ON users;
CREATE POLICY users_select_distributor ON users
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS agent_referrals_select_distributor ON agent_referrals;
CREATE POLICY agent_referrals_select_distributor ON agent_referrals
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS contact_submissions_select_distributor ON contact_submissions;
CREATE POLICY contact_submissions_select_distributor ON contact_submissions
  FOR SELECT
  USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


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
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND agent_id = (SELECT auth.jwt()) ->> 'agentId'
  );

DROP POLICY IF EXISTS subscribers_update_self ON subscribers;
CREATE POLICY subscribers_update_self ON subscribers
  FOR UPDATE
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND id = (SELECT auth.jwt()) ->> 'subscriberId'
  )
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND id = (SELECT auth.jwt()) ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- transactions / claims / withdrawals — subscriber INSERT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS transactions_insert_self ON transactions;
CREATE POLICY transactions_insert_self ON transactions
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS claims_insert_self ON claims;
CREATE POLICY claims_insert_self ON claims
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS withdrawals_insert_self ON withdrawals;
CREATE POLICY withdrawals_insert_self ON withdrawals
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- nominees — subscriber INSERT / UPDATE / DELETE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS nominees_insert_self ON nominees;
CREATE POLICY nominees_insert_self ON nominees
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS nominees_update_self ON nominees;
CREATE POLICY nominees_update_self ON nominees
  FOR UPDATE
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  )
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS nominees_delete_self ON nominees;
CREATE POLICY nominees_delete_self ON nominees
  FOR DELETE
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- contribution_schedules — subscriber UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS contribution_schedules_update_self ON contribution_schedules;
CREATE POLICY contribution_schedules_update_self ON contribution_schedules
  FOR UPDATE
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  )
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- insurance_policies — subscriber INSERT / UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS insurance_policies_insert_self ON insurance_policies;
CREATE POLICY insurance_policies_insert_self ON insurance_policies
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

DROP POLICY IF EXISTS insurance_policies_update_self ON insurance_policies;
CREATE POLICY insurance_policies_update_self ON insurance_policies
  FOR UPDATE
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  )
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- agents — branch INSERT / UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS agents_insert_branch ON agents;
CREATE POLICY agents_insert_branch ON agents
  FOR INSERT
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND branch_id = (SELECT auth.jwt()) ->> 'branchId'
  );

DROP POLICY IF EXISTS agents_update_branch ON agents;
CREATE POLICY agents_update_branch ON agents
  FOR UPDATE
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND branch_id = (SELECT auth.jwt()) ->> 'branchId'
  )
  WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'branch'
    AND branch_id = (SELECT auth.jwt()) ->> 'branchId'
  );


-- -----------------------------------------------------------------------------
-- branches — distributor INSERT / UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS branches_insert_distributor ON branches;
CREATE POLICY branches_insert_distributor ON branches
  FOR INSERT
  WITH CHECK ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');

DROP POLICY IF EXISTS branches_update_distributor ON branches;
CREATE POLICY branches_update_distributor ON branches
  FOR UPDATE
  USING  ((SELECT auth.jwt()) ->> 'app_role' = 'distributor')
  WITH CHECK ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commission_config — distributor UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS commission_config_update_distributor ON commission_config;
CREATE POLICY commission_config_update_distributor ON commission_config
  FOR UPDATE
  USING  ((SELECT auth.jwt()) ->> 'app_role' = 'distributor')
  WITH CHECK ((SELECT auth.jwt()) ->> 'app_role' = 'distributor');


-- =============================================================================
-- End of 0008_rls_wrap_auth_jwt_initplan.sql
