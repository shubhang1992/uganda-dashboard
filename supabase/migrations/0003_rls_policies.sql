-- =============================================================================
-- Universal Pensions Uganda — Phase 1, Step 4: Row-Level Security Policies
-- =============================================================================
-- Per /Users/shubhang/Desktop/plan.md §"RLS" subsection and §"Risks & gotchas".
--
-- This migration:
--   * Enables RLS on every one of the 20 tables defined in 0001_initial_schema.sql.
--   * Defines SELECT policies per role (subscriber / agent / branch / distributor).
--   * Defines WRITE (INSERT/UPDATE/DELETE) policies per the role-permissions matrix.
--   * Does NOT define any direct INSERT/UPDATE policies on the three state-machine
--     tables — `commissions`, `settlement_runs`, `settlement_run_branch_reviews`.
--     All writes to those tables flow through the SECURITY DEFINER state-machine
--     RPCs in 0004_commission_run_rpcs.sql (which run as the function-owner role,
--     bypassing RLS at write time, and which validate the caller's role via
--     `auth.jwt() ->> 'role'` inside the function body).
--   * Tunes the Realtime publication: ON for `commissions`, `settlement_runs`,
--     `settlement_run_branch_reviews` (low-volume cross-laptop demo loops); OFF
--     for the high-write tables `transactions`, `subscribers`, `subscriber_balances`.
--
-- CRITICAL — the Supabase Auth user-id helper is forbidden in this file.
-- This project signs custom JWTs with the Supabase JWT secret (HS256) — not
-- Supabase Auth-issued tokens — so that helper returns NULL on every request.
-- Every policy must read claims via `auth.jwt() ->> '<claim>'` (e.g.
-- `auth.jwt() ->> 'subscriberId'`, `auth.jwt() ->> 'agentId'`,
-- `auth.jwt() ->> 'branchId'`, `auth.jwt() ->> 'role'`).
-- See plan §"Risks & gotchas" #1.
--
-- The JWT claims schema (custom, plan §"Backend API routes"):
--   {
--     "role":          "subscriber" | "agent" | "branch" | "distributor",
--     "subscriberId":  "s-..." | null,
--     "agentId":       "a-..." | null,
--     "branchId":      "b-..." | null,
--     "distributorId": "d-..." | null,
--     "aud":           "authenticated",
--     "exp":           <unix-ts>
--   }
--
-- FORCE ROW LEVEL SECURITY decision:
-- Used on the 20 tables. The migration runner / table owner is typically a
-- superuser-like role (postgres) that would otherwise bypass policies. The
-- service-role key (used server-side by `api/_lib/supabase-admin.ts`) uses the
-- `service_role` Postgres role, which Supabase grants the
-- `bypassrls` attribute — so its DB writes proceed regardless of FORCE. FORCE
-- adds defence-in-depth: if a future migration ever runs DML under the table
-- owner (e.g. an interactive psql session forgetting to `SET ROLE`), it will
-- be subject to policies just like an authenticated client. Seed scripts that
-- legitimately need to bypass RLS should use the service-role key.
--
-- Policy naming: `<table>_<action>_<role-or-scope>` so the policies appear
-- legible under `\d <table>` in psql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY (all 20 tables)
-- -----------------------------------------------------------------------------
-- Reference / hierarchy
ALTER TABLE regions                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions                          FORCE  ROW LEVEL SECURITY;
ALTER TABLE districts                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts                        FORCE  ROW LEVEL SECURITY;
ALTER TABLE branches                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches                         FORCE  ROW LEVEL SECURITY;
ALTER TABLE agents                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents                           FORCE  ROW LEVEL SECURITY;

-- Subscriber + owned tables
ALTER TABLE subscribers                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers                      FORCE  ROW LEVEL SECURITY;
ALTER TABLE subscriber_balances              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriber_balances              FORCE  ROW LEVEL SECURITY;
ALTER TABLE contribution_schedules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_schedules           FORCE  ROW LEVEL SECURITY;
ALTER TABLE insurance_policies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies               FORCE  ROW LEVEL SECURITY;
ALTER TABLE nominees                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominees                         FORCE  ROW LEVEL SECURITY;
ALTER TABLE transactions                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions                     FORCE  ROW LEVEL SECURITY;
ALTER TABLE claims                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims                           FORCE  ROW LEVEL SECURITY;
ALTER TABLE withdrawals                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals                      FORCE  ROW LEVEL SECURITY;

-- Commission domain
ALTER TABLE commission_config                ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_config                FORCE  ROW LEVEL SECURITY;
ALTER TABLE settlement_runs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_runs                  FORCE  ROW LEVEL SECURITY;
ALTER TABLE settlement_run_branch_reviews    ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_run_branch_reviews    FORCE  ROW LEVEL SECURITY;
ALTER TABLE commissions                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions                      FORCE  ROW LEVEL SECURITY;

-- Cross-cutting / new
ALTER TABLE agent_referrals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_referrals                  FORCE  ROW LEVEL SECURITY;
ALTER TABLE contact_submissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions              FORCE  ROW LEVEL SECURITY;
ALTER TABLE users                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                            FORCE  ROW LEVEL SECURITY;
ALTER TABLE demo_personas                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_personas                    FORCE  ROW LEVEL SECURITY;


-- =============================================================================
-- 2. SELECT POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reference tables — readable by any authenticated user (plan §"RLS").
-- -----------------------------------------------------------------------------
-- `regions`, `districts`, `branches`, `agents`, `commission_config`, `demo_personas`.
-- We gate on `auth.jwt() ->> 'role' IS NOT NULL` so unauthenticated PostgREST
-- requests (no JWT) cannot read these tables — only authenticated users with
-- a recognised role. The `aud: "authenticated"` claim is required by PostgREST
-- before the JWT is even handed to RLS.

CREATE POLICY regions_select_authenticated ON regions
  FOR SELECT
  USING (auth.jwt() ->> 'role' IS NOT NULL);

CREATE POLICY districts_select_authenticated ON districts
  FOR SELECT
  USING (auth.jwt() ->> 'role' IS NOT NULL);

CREATE POLICY branches_select_authenticated ON branches
  FOR SELECT
  USING (auth.jwt() ->> 'role' IS NOT NULL);

CREATE POLICY agents_select_authenticated ON agents
  FOR SELECT
  USING (auth.jwt() ->> 'role' IS NOT NULL);

CREATE POLICY commission_config_select_authenticated ON commission_config
  FOR SELECT
  USING (auth.jwt() ->> 'role' IS NOT NULL);

CREATE POLICY demo_personas_select_authenticated ON demo_personas
  FOR SELECT
  USING (auth.jwt() ->> 'role' IS NOT NULL);


-- -----------------------------------------------------------------------------
-- subscribers — self / agent / branch / distributor SELECT
-- -----------------------------------------------------------------------------
-- subscribers table uses `id` (not `subscriber_id`) so the self-check is `id`.
-- Branch admin reach: subscriber's agent's branch_id matches caller's branchId.

CREATE POLICY subscribers_select_self ON subscribers
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY subscribers_select_agent ON subscribers
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND agent_id = auth.jwt() ->> 'agentId'
  );

CREATE POLICY subscribers_select_branch ON subscribers
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = subscribers.agent_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY subscribers_select_distributor ON subscribers
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- subscriber_balances — same scoping rules joined through subscribers
-- -----------------------------------------------------------------------------
CREATE POLICY subscriber_balances_select_self ON subscriber_balances
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY subscriber_balances_select_agent ON subscriber_balances
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = subscriber_balances.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY subscriber_balances_select_branch ON subscriber_balances
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = subscriber_balances.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY subscriber_balances_select_distributor ON subscriber_balances
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- contribution_schedules — same scoping rules
-- -----------------------------------------------------------------------------
CREATE POLICY contribution_schedules_select_self ON contribution_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY contribution_schedules_select_agent ON contribution_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = contribution_schedules.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY contribution_schedules_select_branch ON contribution_schedules
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = contribution_schedules.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY contribution_schedules_select_distributor ON contribution_schedules
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- insurance_policies — same scoping rules
-- -----------------------------------------------------------------------------
CREATE POLICY insurance_policies_select_self ON insurance_policies
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY insurance_policies_select_agent ON insurance_policies
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = insurance_policies.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY insurance_policies_select_branch ON insurance_policies
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = insurance_policies.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY insurance_policies_select_distributor ON insurance_policies
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- nominees — same scoping rules
-- -----------------------------------------------------------------------------
CREATE POLICY nominees_select_self ON nominees
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY nominees_select_agent ON nominees
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = nominees.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY nominees_select_branch ON nominees
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = nominees.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY nominees_select_distributor ON nominees
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- transactions — same scoping rules
-- -----------------------------------------------------------------------------
CREATE POLICY transactions_select_self ON transactions
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY transactions_select_agent ON transactions
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = transactions.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY transactions_select_branch ON transactions
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = transactions.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY transactions_select_distributor ON transactions
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- claims — same scoping rules
-- -----------------------------------------------------------------------------
CREATE POLICY claims_select_self ON claims
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY claims_select_agent ON claims
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = claims.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY claims_select_branch ON claims
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = claims.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY claims_select_distributor ON claims
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- withdrawals — same scoping rules
-- -----------------------------------------------------------------------------
CREATE POLICY withdrawals_select_self ON withdrawals
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY withdrawals_select_agent ON withdrawals
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM subscribers s
      WHERE s.id = withdrawals.subscriber_id
        AND s.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY withdrawals_select_branch ON withdrawals
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1
      FROM subscribers s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.id = withdrawals.subscriber_id
        AND a.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY withdrawals_select_distributor ON withdrawals
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commissions — agent / branch / distributor SELECT
-- -----------------------------------------------------------------------------
-- branch_id is denormalised on the row (plan §"Database schema"), so the
-- branch-admin policy is a direct equality — no join needed.
--
-- Distributor SELECT must be broad enough that the read-side RPCs in 0002 —
-- `get_agent_commission_detail`, `get_commission_summary`,
-- `get_run_branch_breakdown`, `get_entity_commission_summary` — return data.
-- Those are NOT `SECURITY DEFINER` (they're `LANGUAGE plpgsql STABLE`), so
-- they run under the caller's RLS context. The `distributor` policy below
-- grants unrestricted SELECT to that role.

CREATE POLICY commissions_select_agent ON commissions
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND agent_id = auth.jwt() ->> 'agentId'
  );

CREATE POLICY commissions_select_branch ON commissions
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );

CREATE POLICY commissions_select_distributor ON commissions
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- settlement_runs — branch (their reviewed runs) / distributor SELECT
-- -----------------------------------------------------------------------------
-- Agents need to see runs their commissions are bundled into (for "Past
-- cycles" history on the Commissions page) — granted via a join through
-- commissions.run_id.
--
-- Branch admins see any run that has a review row for their branch — joined
-- through settlement_run_branch_reviews.
--
-- Distributors see all.

CREATE POLICY settlement_runs_select_agent ON settlement_runs
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM commissions c
      WHERE c.run_id = settlement_runs.id
        AND c.agent_id = auth.jwt() ->> 'agentId'
    )
  );

CREATE POLICY settlement_runs_select_branch ON settlement_runs
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND EXISTS (
      SELECT 1 FROM settlement_run_branch_reviews r
      WHERE r.run_id = settlement_runs.id
        AND r.branch_id = auth.jwt() ->> 'branchId'
    )
  );

CREATE POLICY settlement_runs_select_distributor ON settlement_runs
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- settlement_run_branch_reviews — branch (own reviews) / distributor SELECT
-- -----------------------------------------------------------------------------
CREATE POLICY settlement_run_branch_reviews_select_branch ON settlement_run_branch_reviews
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );

CREATE POLICY settlement_run_branch_reviews_select_distributor ON settlement_run_branch_reviews
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- users / agent_referrals / contact_submissions — distributor only
-- -----------------------------------------------------------------------------
-- Per plan §"RLS": "until Admin role is built — see reset.md".
-- Public POSTs into agent_referrals / contact_submissions happen server-side
-- via the service-role key (which bypasses RLS), so no anon INSERT policy.

CREATE POLICY users_select_distributor ON users
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');

CREATE POLICY agent_referrals_select_distributor ON agent_referrals
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');

CREATE POLICY contact_submissions_select_distributor ON contact_submissions
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'distributor');


-- =============================================================================
-- 3. WRITE POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subscribers
-- -----------------------------------------------------------------------------
-- INSERT by agent: row's agent_id must equal caller's agentId.
--   Signup INSERTs (no JWT yet) bypass via SECURITY DEFINER
--   create_subscriber_from_signup RPC (0002). Agent-led onboarding
--   uses create_subscriber_from_agent_onboard, which is also SECURITY DEFINER
--   so it bypasses RLS, but this direct INSERT policy lets a future ad-hoc
--   single-row insert from an authenticated agent work without a wrapper RPC.
CREATE POLICY subscribers_insert_agent ON subscribers
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'agent'
    AND agent_id = auth.jwt() ->> 'agentId'
  );

-- UPDATE by self. The editable column set is enforced by WITH CHECK on the
-- *new* row matching the existing row on every non-editable column. The
-- only fields `src/services/subscriber.js#updateProfile` actually mutates
-- (called from `src/subscriber-dashboard/pages/ProfilePage.jsx`) are
-- `name`, `email`, and `phone`.
--
-- The plan §"RLS" gave illustrative examples — "e.g. email, occupation,
-- consent_at" — but no code path mutates `occupation` or `consent_at` after
-- signup today (consent_at is set inside the SECURITY DEFINER signup RPC and
-- not editable afterwards). We deliberately allow `consent_at` in the editable
-- set anyway: subscribers may need to re-consent if terms change, and
-- subscribers may want to update their occupation when their job changes.
-- These are forward-looking — adding them now means we don't have to ship
-- another migration when those screens land.
--
-- Editable columns: name, email, phone, occupation, consent_at.
-- All other columns must remain unchanged (including the primary key `id`,
-- the join key `agent_id`, the lifecycle flag `is_demo_signup`, etc.).
CREATE POLICY subscribers_update_self ON subscribers
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND id = auth.jwt() ->> 'subscriberId'
    -- Lock down non-editable columns: must equal the existing row's value.
    AND id                        = (SELECT s.id                        FROM subscribers s WHERE s.id = subscribers.id)
    AND gender                    IS NOT DISTINCT FROM (SELECT s.gender                    FROM subscribers s WHERE s.id = subscribers.id)
    AND age                       IS NOT DISTINCT FROM (SELECT s.age                       FROM subscribers s WHERE s.id = subscribers.id)
    AND dob                       IS NOT DISTINCT FROM (SELECT s.dob                       FROM subscribers s WHERE s.id = subscribers.id)
    AND nin                       IS NOT DISTINCT FROM (SELECT s.nin                       FROM subscribers s WHERE s.id = subscribers.id)
    AND agent_id                  IS NOT DISTINCT FROM (SELECT s.agent_id                  FROM subscribers s WHERE s.id = subscribers.id)
    AND district_id               IS NOT DISTINCT FROM (SELECT s.district_id               FROM subscribers s WHERE s.id = subscribers.id)
    AND kyc_status                = (SELECT s.kyc_status                FROM subscribers s WHERE s.id = subscribers.id)
    AND is_active                 = (SELECT s.is_active                 FROM subscribers s WHERE s.id = subscribers.id)
    AND is_demo_signup            = (SELECT s.is_demo_signup            FROM subscribers s WHERE s.id = subscribers.id)
    AND insurance_same_as_pension = (SELECT s.insurance_same_as_pension FROM subscribers s WHERE s.id = subscribers.id)
    AND registered_date           IS NOT DISTINCT FROM (SELECT s.registered_date           FROM subscribers s WHERE s.id = subscribers.id)
    AND last_contribution_date    IS NOT DISTINCT FROM (SELECT s.last_contribution_date    FROM subscribers s WHERE s.id = subscribers.id)
    AND contribution_history      IS NOT DISTINCT FROM (SELECT s.contribution_history      FROM subscribers s WHERE s.id = subscribers.id)
    AND products_held             IS NOT DISTINCT FROM (SELECT s.products_held             FROM subscribers s WHERE s.id = subscribers.id)
    AND current_unit_value        IS NOT DISTINCT FROM (SELECT s.current_unit_value        FROM subscribers s WHERE s.id = subscribers.id)
    AND unit_value_as_of          IS NOT DISTINCT FROM (SELECT s.unit_value_as_of          FROM subscribers s WHERE s.id = subscribers.id)
    AND created_at                = (SELECT s.created_at                FROM subscribers s WHERE s.id = subscribers.id)
  );


-- -----------------------------------------------------------------------------
-- transactions — subscriber INSERT own
-- -----------------------------------------------------------------------------
-- Covers `makeAdHocContribution`, `requestWithdrawal` per the role-permissions
-- matrix. The first-contribution INSERT during signup happens inside the
-- SECURITY DEFINER `create_subscriber_from_signup` RPC and bypasses this
-- policy. Withdrawal records also feed `transactions` through the
-- subscriber-side service (per plan §"Database schema"), so the same
-- INSERT policy covers both.
CREATE POLICY transactions_insert_self ON transactions
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- claims — subscriber INSERT own
-- -----------------------------------------------------------------------------
CREATE POLICY claims_insert_self ON claims
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- withdrawals — subscriber INSERT own
-- -----------------------------------------------------------------------------
CREATE POLICY withdrawals_insert_self ON withdrawals
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- nominees — subscriber INSERT / UPDATE / DELETE own
-- -----------------------------------------------------------------------------
-- The subscriber dashboard's Nominees page (`src/subscriber-dashboard/pages/
-- NomineesPage.jsx`) does add / edit / delete operations against this table.
CREATE POLICY nominees_insert_self ON nominees
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY nominees_update_self ON nominees
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY nominees_delete_self ON nominees
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- contribution_schedules — subscriber UPDATE own
-- -----------------------------------------------------------------------------
-- Schedules are seeded / inserted via the SECURITY DEFINER signup RPC; the
-- subscriber-side service (`updateContributionSchedule`) does UPDATE only.
CREATE POLICY contribution_schedules_update_self ON contribution_schedules
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- insurance_policies — subscriber INSERT / UPDATE own
-- -----------------------------------------------------------------------------
-- Covers `updateInsuranceCover` — which today either creates the policy row
-- (when none exists) or updates the existing cover/premium.
CREATE POLICY insurance_policies_insert_self ON insurance_policies
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );

CREATE POLICY insurance_policies_update_self ON insurance_policies
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'subscriber'
    AND subscriber_id = auth.jwt() ->> 'subscriberId'
  );


-- -----------------------------------------------------------------------------
-- agents — branch INSERT / UPDATE own-branch agents
-- -----------------------------------------------------------------------------
-- Covers `createAgent` and any agent-row updates (status flips, profile edits)
-- a branch admin makes. The `agent_id = auth.jwt() ->> 'agentId'` clause is
-- not relevant here — we gate on the agent's `branch_id`.
CREATE POLICY agents_insert_branch ON agents
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );

CREATE POLICY agents_update_branch ON agents
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'branch'
    AND branch_id = auth.jwt() ->> 'branchId'
  );


-- -----------------------------------------------------------------------------
-- branches — distributor INSERT / UPDATE (unrestricted)
-- -----------------------------------------------------------------------------
-- Covers `createBranch`, `updateBranch`, `setBranchStatus` in services/entities.js.
CREATE POLICY branches_insert_distributor ON branches
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'distributor');

CREATE POLICY branches_update_distributor ON branches
  FOR UPDATE
  USING  (auth.jwt() ->> 'role' = 'distributor')
  WITH CHECK (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commission_config — distributor UPDATE (unrestricted)
-- -----------------------------------------------------------------------------
-- Single-row config table (CHECK id = 'default'). No INSERT policy — the row
-- exists by seed and is never deleted. Distributor admin tweaks `rate` and
-- `cadence` via Settings → Commission rate.
CREATE POLICY commission_config_update_distributor ON commission_config
  FOR UPDATE
  USING  (auth.jwt() ->> 'role' = 'distributor')
  WITH CHECK (auth.jwt() ->> 'role' = 'distributor');


-- -----------------------------------------------------------------------------
-- commissions / settlement_runs / settlement_run_branch_reviews — NO direct WRITE policies
-- -----------------------------------------------------------------------------
-- Per plan §"RLS" and §"Commission state-machine RPCs": every write to these
-- three tables flows through the SECURITY DEFINER state-machine functions in
-- 0004_commission_run_rpcs.sql — `open_run`, `cancel_run`, `release_run`,
-- `release_branch`, `branch_approve_all`, `mark_branch_reviewed`,
-- `branch_approve_line`, `branch_hold_line`, `branch_dispute_line`,
-- `approve_dispute`, `reject_dispute`, `withdraw_dispute`,
-- `agent_confirm_commission`. Each function validates the caller's role via
-- `auth.jwt() ->> 'role'` and `RAISE EXCEPTION`s on mismatch.
--
-- Implication: with RLS enabled and no INSERT/UPDATE/DELETE policy defined,
-- *every* direct write from a normal authenticated client is denied. The
-- service-role key (server-side only) still bypasses RLS for legitimate
-- admin operations (seed scripts etc.).
--
-- Future agent-side dispute RPC: Agent 5 flagged that `disputeCommission(by='agent')`
-- in services/commissions.js exists today but the state-machine doesn't yet
-- expose an agent-side counterpart to `branch_dispute_line`. When that RPC
-- lands, it will be SECURITY DEFINER and validate `auth.jwt() ->> 'role' = 'agent'`
-- — no change to RLS needed because there's no direct UPDATE policy here to
-- block it.
--
-- INSERT into `commissions` also comes from the contribution trigger in 0002
-- (first-contribution → commission), which runs in the trigger context. With
-- FORCE ROW LEVEL SECURITY, trigger writes are still subject to policies; the
-- trigger function (`trg_transactions_contribution`) in 0002 is declared
-- `SECURITY DEFINER` so its INSERTs bypass RLS by the function-owner's privileges.


-- =============================================================================
-- 4. REALTIME PUBLICATION TUNING (plan §"Risks & gotchas" #2)
-- =============================================================================
-- Supabase Realtime broadcasts every change on every table in the
-- `supabase_realtime` publication. Defaults include all public tables.
--
-- Strategy:
--   ON for `commissions`, `settlement_runs`, `settlement_run_branch_reviews`
--     — cross-laptop demo loops (branch approves on Laptop A → distributor
--     sees update on Laptop B) need sub-second propagation. Volume is low.
--   OFF for `transactions`, `subscribers`, `subscriber_balances` — high-write
--     tables would burn free-tier connections. React Query's 5min staleTime
--     with manual invalidation is sufficient.
--
-- The plan §"Risks & gotchas" #2 calls this a `config.toml` change. It is not
-- — Supabase Realtime publication membership is a SQL-level concern. The
-- `supabase/config.toml` file affects only the local CLI emulator; the hosted
-- project reads from `supabase_realtime` directly.
--
-- Each ALTER is wrapped in a DO block so re-running this migration is safe
-- when a table is already in / already out of the publication.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE transactions;
EXCEPTION
  WHEN undefined_object THEN NULL;          -- table not in publication: fine
  WHEN undefined_table  THEN NULL;          -- table doesn't exist: shouldn't happen post-0001
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE subscribers;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table  THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE subscriber_balances;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table  THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commissions;
EXCEPTION
  WHEN duplicate_object THEN NULL;          -- table already in publication: fine
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settlement_runs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settlement_run_branch_reviews;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- End of 0003_rls_policies.sql
-- Next: per-role psql verification once Phase 0b lands:
--   SET LOCAL request.jwt.claims = '{"role":"agent","agentId":"a-001","aud":"authenticated"}';
--   SELECT count(*) FROM subscribers;   -- should equal a-001's subscriber count
--   ... etc. per role.
-- =============================================================================
