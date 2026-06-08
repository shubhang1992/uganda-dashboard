-- =============================================================================
-- DOWN — 0049_admin_role.sql
-- =============================================================================
-- Drops the admin SELECT policies and the three admin RPCs. Additive migration,
-- so the rollback is a clean removal — no prior bodies to restore.
-- =============================================================================

-- 1) Admin SELECT policies — distributor clones.
DROP POLICY IF EXISTS subscribers_select_admin            ON public.subscribers;
DROP POLICY IF EXISTS subscriber_balances_select_admin    ON public.subscriber_balances;
DROP POLICY IF EXISTS contribution_schedules_select_admin ON public.contribution_schedules;
DROP POLICY IF EXISTS insurance_policies_select_admin      ON public.insurance_policies;
DROP POLICY IF EXISTS nominees_select_admin                ON public.nominees;
DROP POLICY IF EXISTS transactions_select_admin            ON public.transactions;
DROP POLICY IF EXISTS claims_select_admin                  ON public.claims;
DROP POLICY IF EXISTS withdrawals_select_admin             ON public.withdrawals;
DROP POLICY IF EXISTS commissions_select_admin             ON public.commissions;
DROP POLICY IF EXISTS settlement_batches_select_admin      ON public.settlement_batches;
DROP POLICY IF EXISTS notifications_select_admin           ON public.notifications;
DROP POLICY IF EXISTS users_select_admin                   ON public.users;
DROP POLICY IF EXISTS agent_referrals_select_admin         ON public.agent_referrals;
DROP POLICY IF EXISTS contact_submissions_select_admin     ON public.contact_submissions;

-- 2) Admin SELECT policies — employer family.
DROP POLICY IF EXISTS employers_select_admin              ON public.employers;
DROP POLICY IF EXISTS contribution_runs_select_admin      ON public.contribution_runs;
DROP POLICY IF EXISTS contribution_run_lines_select_admin ON public.contribution_run_lines;
DROP POLICY IF EXISTS employer_invites_select_admin       ON public.employer_invites;

-- 3) Admin RPCs.
DROP FUNCTION IF EXISTS public.create_distributor(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_employer(text, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.get_all_employers_metrics();

-- =============================================================================
-- End of 0049_admin_role.down.sql
-- =============================================================================
