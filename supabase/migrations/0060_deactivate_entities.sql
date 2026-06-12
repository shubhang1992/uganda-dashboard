-- =============================================================================
-- Universal Pensions Uganda — 0060: deactivate / reactivate distributors + employers
-- =============================================================================
-- Admin can deactivate (and reactivate) a distributor or an employer. On
-- DEACTIVATE the entity's subscribers/members are NOT deactivated — their TAGGING
-- is reset (agent_id / employer_id -> NULL) so they continue as self-onboarded /
-- direct savers. is_active is NEVER touched.
--   * set_distributor_status — flips distributor + its branches + its agents
--     between 'active'/'inactive'; on 'inactive' also detaches every subscriber
--     under the distributor's agent tree. Reactivate is a pure status flip —
--     detached subscribers do NOT re-tag.
--   * set_employer_status — flips employers.status; on 'inactive' detaches every
--     member (employer_id -> NULL).
--
-- ENFORCEMENT (status was cosmetic before this migration):
--   * Login is gated in api/auth/verify-otp.ts (a deactivated agent/branch/
--     distributor/employer can't obtain a JWT — see that file).
--   * Write-path gates are BEFORE-INSERT TRIGGERS (additive, no risk of mangling
--     the large onboarding/invite/run RPC bodies): a deactivated employer cannot
--     admit new members (subscribers insert) or submit new contribution runs.
--     Agent-onboarding by a deactivated agent is covered by the login gate
--     (a deactivated agent can't authenticate). Triggers are OFF during the seed
--     (session_replication_role='replica'), so seeding is unaffected.
--
-- SCHEMA PREP:
--   * branches gains distributor_id (the agent tree was implicitly under the
--     singleton d-001 — branches never had this FK). Backfill ALL -> 'd-001' so
--     the distributor cascade can scope. d-002 ("Secondary") owns nothing.
--   * employers gains status.
--   * get_all_employers_metrics re-emits with 'status' added (admin rollup).
--
-- CONVENTIONS (mirror 0048/0049/0057): SECURITY DEFINER; SET search_path =
--   public, pg_temp; admin gate via (SELECT auth.jwt()) ->> 'app_role' = 'admin'
--   (NEVER 'role'); RAISE P0001; REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO
--   authenticated; FK covering index per 0009/0013. Forward-only; reversible via
--   0060_deactivate_entities.down.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) branches.distributor_id (+ backfill + FK covering index)
-- -----------------------------------------------------------------------------
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS distributor_id text
    REFERENCES public.distributors(id) ON DELETE SET NULL;

-- The entire agent tree (316 branches) is the singleton national distributor
-- d-001's network. d-002 owns nothing.
UPDATE public.branches SET distributor_id = 'd-001' WHERE distributor_id IS NULL;

CREATE INDEX IF NOT EXISTS branches_distributor_id_idx
  ON public.branches (distributor_id);

-- -----------------------------------------------------------------------------
-- 2) employers.status
-- -----------------------------------------------------------------------------
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- -----------------------------------------------------------------------------
-- 3) get_all_employers_metrics — re-emit (0057 body) adding 'status'.
--    Every existing key kept byte-for-byte; only `e.status` is appended.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_employers_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text := (SELECT auth.jwt()) ->> 'app_role';
  v_result jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot read all employer metrics', v_role USING ERRCODE = 'P0001';
  END IF;

  WITH subs AS (
    SELECT
      s.employer_id,
      count(*)                            AS headcount,
      count(*) FILTER (WHERE s.is_active) AS active_count
    FROM public.subscribers s
    WHERE s.employer_id IS NOT NULL
    GROUP BY s.employer_id
  ),
  bal AS (
    SELECT
      s.employer_id,
      COALESCE(sum(b.total_balance), 0) AS total_balance
    FROM public.subscriber_balances b
    JOIN public.subscribers s ON s.id = b.subscriber_id
    WHERE s.employer_id IS NOT NULL
    GROUP BY s.employer_id
  ),
  txn AS (
    SELECT
      s.employer_id,
      COALESCE(sum(t.amount), 0)                                      AS total_contributions,
      COALESCE(sum(t.amount) FILTER (WHERE t.source = 'employer'), 0) AS employer_contributions
    FROM public.transactions t
    JOIN public.subscribers s ON s.id = t.subscriber_id
    WHERE s.employer_id IS NOT NULL
      AND t.type = 'contribution'
    GROUP BY s.employer_id
  ),
  ins AS (
    SELECT
      s.employer_id,
      count(*) AS insured_count
    FROM public.insurance_policies ip
    JOIN public.subscribers s ON s.id = ip.subscriber_id
    WHERE s.employer_id IS NOT NULL
      AND ip.status = 'active'
    GROUP BY s.employer_id
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m.name), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      e.id,
      e.name,
      e.sector,
      e.district,
      e.status,
      e.payroll_cadence                        AS "payrollCadence",
      e.created_at                             AS "createdAt",
      COALESCE(subs.headcount, 0)              AS headcount,
      COALESCE(subs.active_count, 0)           AS "activeCount",
      COALESCE(bal.total_balance, 0)           AS "totalBalance",
      COALESCE(txn.total_contributions, 0)     AS "totalContributions",
      COALESCE(txn.employer_contributions, 0)  AS "employerContributions",
      COALESCE(ins.insured_count, 0)           AS "insuredCount"
    FROM public.employers e
    LEFT JOIN subs ON subs.employer_id = e.id
    LEFT JOIN bal  ON bal.employer_id  = e.id
    LEFT JOIN txn  ON txn.employer_id  = e.id
    LEFT JOIN ins  ON ins.employer_id  = e.id
  ) m;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_employers_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_employers_metrics() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) set_distributor_status — admin-only. Flips distributor + branches + agents.
--    On 'inactive', detaches all subscribers under the distributor's agent tree.
--    is_active is intentionally NOT touched. Reactivate does NOT re-tag.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_distributor_status(
  p_distributor_id text,
  p_status         text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role          text    := (SELECT auth.jwt()) ->> 'app_role';
  v_dist_updated  integer := 0;
  v_branches      integer := 0;
  v_agents        integer := 0;
  v_subs_detached integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot set distributor status', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.distributors SET status = p_status, updated_at = now() WHERE id = p_distributor_id;
  GET DIAGNOSTICS v_dist_updated = ROW_COUNT;
  IF v_dist_updated = 0 THEN
    RAISE EXCEPTION 'no distributor %', p_distributor_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.branches
     SET status = p_status
   WHERE distributor_id = p_distributor_id;
  GET DIAGNOSTICS v_branches = ROW_COUNT;

  UPDATE public.agents
     SET status = p_status
   WHERE branch_id IN (SELECT id FROM public.branches WHERE distributor_id = p_distributor_id);
  GET DIAGNOSTICS v_agents = ROW_COUNT;

  IF p_status = 'inactive' THEN
    UPDATE public.subscribers
       SET agent_id = NULL
     WHERE agent_id IN (
       SELECT a.id
         FROM public.agents a
         JOIN public.branches b ON b.id = a.branch_id
        WHERE b.distributor_id = p_distributor_id
     );
    GET DIAGNOSTICS v_subs_detached = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'id',                  p_distributor_id,
    'status',              p_status,
    'branchesUpdated',     v_branches,
    'agentsUpdated',       v_agents,
    'subscribersDetached', v_subs_detached
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_distributor_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_distributor_status(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) set_employer_status — admin-only. Flips employers.status; on 'inactive',
--    detaches all members (employer_id -> NULL). is_active untouched.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_employer_status(
  p_employer_id text,
  p_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text    := (SELECT auth.jwt()) ->> 'app_role';
  v_emp_updated integer := 0;
  v_members     integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot set employer status', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.employers SET status = p_status, updated_at = now() WHERE id = p_employer_id;
  GET DIAGNOSTICS v_emp_updated = ROW_COUNT;
  IF v_emp_updated = 0 THEN
    RAISE EXCEPTION 'no employer %', p_employer_id USING ERRCODE = 'P0001';
  END IF;

  IF p_status = 'inactive' THEN
    UPDATE public.subscribers
       SET employer_id = NULL
     WHERE employer_id = p_employer_id;
    GET DIAGNOSTICS v_members = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'id',              p_employer_id,
    'status',          p_status,
    'membersDetached', v_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_employer_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_employer_status(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6) Write-path enforcement triggers — a deactivated employer cannot admit new
--    members or submit new contribution runs. SECURITY DEFINER so the status
--    lookup bypasses RLS (the invite-completer is anon). Triggers are OFF during
--    the seed (replica mode), so seeding is unaffected. Detach is an UPDATE (not
--    an INSERT), so these BEFORE-INSERT triggers never interfere with it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_inactive_employer_subscriber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.employer_id IS NOT NULL
     AND (SELECT status FROM public.employers WHERE id = NEW.employer_id) = 'inactive' THEN
    RAISE EXCEPTION 'employer % is deactivated and cannot admit new members', NEW.employer_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_inactive_employer_subscriber() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_block_inactive_employer_subscriber ON public.subscribers;
CREATE TRIGGER trg_block_inactive_employer_subscriber
  BEFORE INSERT ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_employer_subscriber();

CREATE OR REPLACE FUNCTION public.block_inactive_employer_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.employer_id IS NOT NULL
     AND (SELECT status FROM public.employers WHERE id = NEW.employer_id) = 'inactive' THEN
    RAISE EXCEPTION 'employer % is deactivated and cannot submit contribution runs', NEW.employer_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_inactive_employer_run() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_block_inactive_employer_run ON public.contribution_runs;
CREATE TRIGGER trg_block_inactive_employer_run
  BEFORE INSERT ON public.contribution_runs
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_employer_run();

-- =============================================================================
-- End of 0060_deactivate_entities.sql
-- =============================================================================
