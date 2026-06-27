-- 0069_branch_pending_contributions.sql
-- Per-agent "overdue contributions" breakdown for a branch admin's
-- Needs-attention drill-down. Additive + isolated (does NOT touch the big
-- get_entity_metrics_rollup RPC). For each agent under the branch, returns the
-- count of ACTIVE subscribers whose scheduled contribution is past due
-- (next_due_date < today) — the "members who owe this cycle" the branch admin
-- nudges that agent to follow up on. Distinct from "dormant" (is_active=false).
--
-- Backs services/entities.getBranchPendingContributions → useBranchPendingContributions
-- → branch Home "Overdue contributions" value + AttentionAgentsMobile drill-down.
--
-- NOTE: when first applied to the live project via the Supabase MCP this was
-- recorded in schema_migrations under the label "0066_branch_pending_contributions"
-- (it still ran last, after 0068, version 20260626081422). This repo file uses
-- the correct sequential number; the function body is identical and idempotent
-- (CREATE OR REPLACE), so re-applying is harmless.
--
-- Security: SECURITY DEFINER + pinned search_path, EXECUTE granted to
-- authenticated only. Because DEFINER bypasses RLS and p_branch_id is
-- client-supplied, the body MUST self-gate on the JWT claims (it cannot lean
-- on RLS to scope the read). Reads `app_role`/`branchId` per the canonical JWT
-- contract (api/_lib/jwt.ts; CLAUDE.md §5.7 — read `app_role`, NEVER `role`).
-- Oversight pattern mirrors get_entity_metrics_rollup (0057): a 'branch' caller
-- may only read its own branch; 'distributor'/'admin' may read any branch.

CREATE OR REPLACE FUNCTION public.get_branch_pending_contributions(p_branch_id TEXT)
RETURNS TABLE (
  agent_id   TEXT,
  agent_name TEXT,
  total      BIGINT,
  pending    BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- COALESCE collapses NULL to '' so the gate raises reliably rather than
  -- silently falling through a `NULL` comparison.
  v_role   TEXT := COALESCE((SELECT auth.jwt()) ->> 'app_role', '');
  v_branch TEXT := (SELECT auth.jwt()) ->> 'branchId';
BEGIN
  -- ---------------------------------------------------------------------------
  -- Scope gate. Without this, any authenticated user could pass an arbitrary
  -- p_branch_id and read that branch's full agent roster + per-agent counts.
  -- ---------------------------------------------------------------------------
  IF v_role = '' THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('branch', 'distributor', 'admin') THEN
    RAISE EXCEPTION 'role_not_permitted' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'branch' AND (v_branch IS NULL OR p_branch_id <> v_branch) THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY
  SELECT
    a.id   AS agent_id,
    a.name AS agent_name,
    COUNT(s.id)::bigint AS total,
    COUNT(s.id) FILTER (
      WHERE cs.next_due_date IS NOT NULL AND cs.next_due_date < CURRENT_DATE
    )::bigint AS pending
  FROM public.agents a
  JOIN public.subscribers s
    ON s.agent_id = a.id AND s.is_active
  LEFT JOIN public.contribution_schedules cs
    ON cs.subscriber_id = s.id
  WHERE a.branch_id = p_branch_id
  GROUP BY a.id, a.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_pending_contributions(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_pending_contributions(TEXT) TO authenticated;
