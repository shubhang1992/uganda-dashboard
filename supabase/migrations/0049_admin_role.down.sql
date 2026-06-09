-- =============================================================================
-- DOWN — 0049_admin_role.sql
-- =============================================================================
-- Drops the admin SELECT policies and the three admin RPCs. Additive migration,
-- so the rollback is a clean removal — no prior bodies to restore.
--
-- §1b.6/§1b.10(#5) hardening: `DROP POLICY IF EXISTS ... ON public.<table>` still
-- ERRORS if the *table itself* is absent. Several targets belong to later/data-
-- bearing migrations (employer family from 0032/0044/0047; contribution_run_lines
-- from 0045) that may not be applied — or may already be rolled back — when 0049
-- is reversed. Each DROP POLICY is therefore guarded by a to_regclass check so
-- this .down can never error on a missing relation and is safe to re-run.
-- =============================================================================

DO $$
BEGIN
  -- 1) Admin SELECT policies — distributor clones.
  IF to_regclass('public.subscribers')            IS NOT NULL THEN DROP POLICY IF EXISTS subscribers_select_admin            ON public.subscribers;            END IF;
  IF to_regclass('public.subscriber_balances')    IS NOT NULL THEN DROP POLICY IF EXISTS subscriber_balances_select_admin    ON public.subscriber_balances;    END IF;
  IF to_regclass('public.contribution_schedules') IS NOT NULL THEN DROP POLICY IF EXISTS contribution_schedules_select_admin ON public.contribution_schedules; END IF;
  IF to_regclass('public.insurance_policies')     IS NOT NULL THEN DROP POLICY IF EXISTS insurance_policies_select_admin      ON public.insurance_policies;     END IF;
  IF to_regclass('public.nominees')               IS NOT NULL THEN DROP POLICY IF EXISTS nominees_select_admin                ON public.nominees;               END IF;
  IF to_regclass('public.transactions')           IS NOT NULL THEN DROP POLICY IF EXISTS transactions_select_admin            ON public.transactions;           END IF;
  IF to_regclass('public.claims')                 IS NOT NULL THEN DROP POLICY IF EXISTS claims_select_admin                  ON public.claims;                 END IF;
  IF to_regclass('public.withdrawals')            IS NOT NULL THEN DROP POLICY IF EXISTS withdrawals_select_admin             ON public.withdrawals;            END IF;
  IF to_regclass('public.commissions')            IS NOT NULL THEN DROP POLICY IF EXISTS commissions_select_admin             ON public.commissions;            END IF;
  IF to_regclass('public.settlement_batches')     IS NOT NULL THEN DROP POLICY IF EXISTS settlement_batches_select_admin      ON public.settlement_batches;     END IF;
  IF to_regclass('public.notifications')          IS NOT NULL THEN DROP POLICY IF EXISTS notifications_select_admin           ON public.notifications;          END IF;
  IF to_regclass('public.users')                  IS NOT NULL THEN DROP POLICY IF EXISTS users_select_admin                   ON public.users;                  END IF;
  IF to_regclass('public.agent_referrals')        IS NOT NULL THEN DROP POLICY IF EXISTS agent_referrals_select_admin         ON public.agent_referrals;        END IF;
  IF to_regclass('public.contact_submissions')    IS NOT NULL THEN DROP POLICY IF EXISTS contact_submissions_select_admin     ON public.contact_submissions;    END IF;

  -- 2) Admin SELECT policies — employer family.
  IF to_regclass('public.employers')              IS NOT NULL THEN DROP POLICY IF EXISTS employers_select_admin              ON public.employers;              END IF;
  IF to_regclass('public.contribution_runs')      IS NOT NULL THEN DROP POLICY IF EXISTS contribution_runs_select_admin      ON public.contribution_runs;      END IF;
  IF to_regclass('public.contribution_run_lines') IS NOT NULL THEN DROP POLICY IF EXISTS contribution_run_lines_select_admin ON public.contribution_run_lines; END IF;
  IF to_regclass('public.employer_invites')       IS NOT NULL THEN DROP POLICY IF EXISTS employer_invites_select_admin       ON public.employer_invites;       END IF;
END $$;

-- 3) Admin RPCs (DROP FUNCTION IF EXISTS is already absent-safe).
DROP FUNCTION IF EXISTS public.create_distributor(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_employer(text, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.get_all_employers_metrics();

-- =============================================================================
-- End of 0049_admin_role.down.sql
-- =============================================================================
