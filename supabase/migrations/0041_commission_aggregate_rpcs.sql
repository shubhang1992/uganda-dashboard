-- =============================================================================
-- Universal Pensions Uganda — 0041: commission aggregate read RPCs
-- =============================================================================
-- Moves the three commission read-FOLDS that currently live in JS
-- (src/services/commissions.js) SERVER-SIDE as STABLE SECURITY DEFINER RPCs.
--
-- WHY (the correctness risk this closes):
--   The JS folds — getAgentCommissionList / getPendingDuesByAgent /
--   getPendingDuesByBranch — each do `supabase.from('commissions').select(...)`
--   and then group/sum in the browser. PostgREST caps an unbounded SELECT at
--   1000 rows by default, so on the real (~30k-commission) dataset the folds
--   silently UNDER-report: any commission past row 1000 is dropped before the
--   reduce ever sees it. Folding inside Postgres removes the cap entirely — the
--   aggregate scans every row regardless of any PostgREST page size, and a
--   single jsonb/rowset crosses the wire instead of 30k rows.
--
--   These RPCs return the SAME camelCase-able shapes the JS folds emit (snake
--   here; P4 maps snake→camel in the JS rewrite), so swapping the JS to call
--   them is a pure data-source swap with no UI contract change.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md, mirroring 0029 / 0032 / 0035):
--   * LANGUAGE plpgsql / sql; all three are reads → STABLE.
--   * SECURITY DEFINER + `SET search_path = public, pg_temp` (locked).
--   * Any role read uses auth.jwt() ->> 'app_role' (NEVER 'role' — 'role' is
--     always 'authenticated', the PostgREST SET ROLE name; see CLAUDE.md §5.7).
--     NOTE: like the 0029 read RPCs (get_commission_summary et al.), these three
--     do NOT branch on app_role — they fold whatever rows are visible. RLS on
--     `commissions` already scopes the row set per JWT claim (distributor: all;
--     branch: own branch; agent: own). Because they are SECURITY DEFINER they
--     bypass RLS, so they must NOT widen visibility beyond what the equivalent
--     RLS-scoped SELECT would return — see the SCOPE caveat in risksOrFollowups
--     of the handoff. For the demo (distributor is the sole consumer of the list
--     + pending-dues feeds) this matches the JS, which also returned the full
--     RLS-scoped set. P4 must confirm no narrower role calls these.
--   * REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--   * Forward-only; reversible via 0041_commission_aggregate_rpcs.down.sql.
--   * Migrations 0001-0039 SQL bodies are FROZEN — this is append-only work.
--   * NOT YET APPLIED TO LIVE — applying it is a gated cutover step.
--
-- AGGREGATION EQUIVALENCE (the headline correctness requirement):
--   Each RPC below is annotated with the exact commissions.js lines it mirrors.
--   The arithmetic MUST be identical to the JS reduce/filter folds — a mismatch
--   would change reported money. The mapping is spelled out per-function.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (1) get_agent_commission_list(p_status_focus text)
-- -----------------------------------------------------------------------------
-- Mirrors getAgentCommissionList(statusFocus) — commissions.js:159-211.
-- The JS signature is getAgentCommissionList(statusFocus) where statusFocus is
-- ('paid' | 'due' | null/undefined); p_status_focus carries the same value.
--
-- Per-agent fold (one output row per agent that has ≥1 commission), mirroring
-- the JS reduces at commissions.js:191-208 EXACTLY:
--   totalCommissions     = SUM(amount) over ALL the agent's rows        (:191)
--   totalPaid            = SUM(amount) WHERE status='paid'              (:192)
--   totalDue             = SUM(amount) WHERE status='due'               (:193)
--   subscribersOnboarded = COUNT(*) all the agent's rows               (:204)
--   activeSubscribers    = COUNT(*) all the agent's rows  (= onboarded) (:205)
--   filteredAmount       = SUM(amount) over rows matching p_status_focus
--                          ('paid'→paid rows, 'due'→due rows, ELSE→all rows)(:206)
--   filteredCount        = COUNT(*) of those same filtered rows         (:207)
-- Identity / join columns (commissions.js:197-200):
--   agentName  = agents.name        (JS COALESCE → 'Unknown')          (:197)
--   employeeId = agents.employee_id (JS COALESCE → '')                 (:198)
--   branchId   = agents.branch_id   (the AGENT's branch, NOT the         (:199)
--                commission.branch_id; JS reads agent.branch_id)
--   branchName = branches.name keyed by agents.branch_id
--                (JS COALESCE → 'Unknown')                              (:200)
-- Row filter: JS returns `.filter(a => a.subscribersOnboarded > 0)` (:210).
--   Since the JS Map is BUILT from commission rows, every group already has
--   ≥1 row, so the filter is a no-op there. The GROUP BY below likewise only
--   emits groups that have rows, so the predicate holds intrinsically; we keep
--   `HAVING COUNT(*) > 0` to make the equivalence explicit and auditable.
-- Ordering: the JS does NOT sort this list (insertion order, opaque). We add no
--   ORDER BY for parity; the JS/React layer sorts for display. P4: if any caller
--   depended on Map insertion order, add a deterministic ORDER BY in the rewrite.
--
-- The filteredAmount/Count CASE mirrors the JS branch at commissions.js:187-189
-- where statusFocus drives which rows feed `filtered`. Anything other than the
-- literals 'paid'/'due' (incl. NULL) falls to the ELSE → all rows, exactly as
-- the JS `let filtered = comms` default.
CREATE OR REPLACE FUNCTION public.get_agent_commission_list(
  p_status_focus text DEFAULT NULL
)
RETURNS TABLE (
  agent_id              text,
  agent_name            text,
  employee_id           text,
  branch_id             text,
  branch_name           text,
  total_commissions     numeric,
  total_paid            numeric,
  total_due             numeric,
  subscribers_onboarded bigint,
  active_subscribers    bigint,
  filtered_amount       numeric,
  filtered_count        bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.id                                                              AS agent_id,
    COALESCE(a.name, 'Unknown')                                       AS agent_name,
    COALESCE(a.employee_id, '')                                       AS employee_id,
    COALESCE(a.branch_id, '')                                         AS branch_id,
    COALESCE(b.name, 'Unknown')                                       AS branch_name,
    COALESCE(SUM(c.amount), 0)                                        AS total_commissions,
    COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0)       AS total_paid,
    COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'due'), 0)        AS total_due,
    COUNT(*)                                                          AS subscribers_onboarded,
    COUNT(*)                                                          AS active_subscribers,
    -- filteredAmount: rows matching p_status_focus ('paid'/'due'), else ALL rows.
    COALESCE(SUM(c.amount) FILTER (
      WHERE p_status_focus NOT IN ('paid', 'due')
         OR p_status_focus IS NULL
         OR c.status::text = p_status_focus
    ), 0)                                                             AS filtered_amount,
    -- filteredCount: same predicate as filteredAmount.
    COUNT(*) FILTER (
      WHERE p_status_focus NOT IN ('paid', 'due')
         OR p_status_focus IS NULL
         OR c.status::text = p_status_focus
    )                                                                 AS filtered_count
  FROM public.commissions c
  JOIN public.agents a   ON a.id = c.agent_id
  LEFT JOIN public.branches b ON b.id = a.branch_id
  GROUP BY a.id, a.name, a.employee_id, a.branch_id, b.name
  HAVING COUNT(*) > 0;
$$;


-- -----------------------------------------------------------------------------
-- (2) get_pending_dues_by_agent()
-- -----------------------------------------------------------------------------
-- Mirrors getPendingDuesByAgent() — commissions.js:286-325.
-- Folds the DUE-only commission rows per agent (the JS pre-filters with
-- `.eq('status', 'due')` at :291, so only status='due' rows enter the reduce):
--   pendingAmount = SUM(amount) of the agent's DUE rows  (JS :305 entry.amount)
--   pendingCount  = COUNT(*)    of the agent's DUE rows  (JS :306 entry.count)
-- Identity / join columns (commissions.js:316-319):
--   agentName  = agents.name        (COALESCE → 'Unknown')   (:317)
--   employeeId = agents.employee_id (COALESCE → '')          (:318)
--   branchId   = agents.branch_id   (the AGENT's branch)     (:319)
--   branchName = branches.name keyed by agents.branch_id (COALESCE → 'Unknown')
-- Row filter: JS `if (agg.count === 0) continue;` (:311) — but the map is built
--   only from due rows so every group has ≥1; HAVING COUNT(*) > 0 makes it
--   explicit (and is intrinsically true here). Equivalent to JS.
-- Ordering: JS `.sort((a, b) => b.pendingAmount - a.pendingAmount)` (:324) →
--   ORDER BY pending_amount DESC. (Ties: JS Array.sort is stable but the input
--   order is Map-insertion-opaque; we leave ties unordered to match — see P4
--   note. A deterministic tiebreak can be added in P4 without changing totals.)
CREATE OR REPLACE FUNCTION public.get_pending_dues_by_agent()
RETURNS TABLE (
  agent_id       text,
  agent_name     text,
  employee_id    text,
  branch_id      text,
  branch_name    text,
  pending_amount numeric,
  pending_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.id                          AS agent_id,
    COALESCE(a.name, 'Unknown')   AS agent_name,
    COALESCE(a.employee_id, '')   AS employee_id,
    COALESCE(a.branch_id, '')     AS branch_id,
    COALESCE(b.name, 'Unknown')   AS branch_name,
    COALESCE(SUM(c.amount), 0)    AS pending_amount,
    COUNT(*)                      AS pending_count
  FROM public.commissions c
  JOIN public.agents a   ON a.id = c.agent_id
  LEFT JOIN public.branches b ON b.id = a.branch_id
  WHERE c.status = 'due'
  GROUP BY a.id, a.name, a.employee_id, a.branch_id, b.name
  HAVING COUNT(*) > 0
  ORDER BY pending_amount DESC;
$$;


-- -----------------------------------------------------------------------------
-- (3) get_pending_dues_by_branch()
-- -----------------------------------------------------------------------------
-- Mirrors getPendingDuesByBranch() — commissions.js:333-368.
-- Folds the DUE-only commission rows per branch (JS pre-filters `.eq('status',
-- 'due')` at :337). NOTE the grouping key is the COMMISSION's branch_id
-- (`row.branch_id`, JS :346), NOT the agent's branch — this differs from RPC (1)
-- and (2) above, which key on the agent's branch. Kept faithful to the JS.
--   pendingAmount = SUM(amount) of the branch's DUE rows  (JS :350 entry.amount)
--   pendingCount  = COUNT(*)    of the branch's DUE rows  (JS :351 entry.count)
--   agentCount    = COUNT(DISTINCT agent_id) among those DUE rows, counting only
--                   NON-NULL agent_id — JS `if (row.agent_id) entry.agents.add`
--                   (:352) skips falsy agent_ids. agent_id is NOT NULL in the
--                   schema (0001:348), so the FILTER is belt-and-braces parity.
-- Identity / join columns (commissions.js:360-364):
--   branchName = branches.name keyed by the COMMISSION's branch_id
--                (COALESCE → 'Unknown')  (:361)
-- Row filter: JS `if (agg.count === 0) continue;` (:357) — HAVING COUNT(*) > 0.
-- Ordering: JS `.sort((a, b) => b.pendingAmount - a.pendingAmount)` (:367) →
--   ORDER BY pending_amount DESC. (Same tie caveat as RPC (2).)
CREATE OR REPLACE FUNCTION public.get_pending_dues_by_branch()
RETURNS TABLE (
  branch_id      text,
  branch_name    text,
  pending_amount numeric,
  pending_count  bigint,
  agent_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.branch_id                              AS branch_id,
    COALESCE(b.name, 'Unknown')              AS branch_name,
    COALESCE(SUM(c.amount), 0)               AS pending_amount,
    COUNT(*)                                 AS pending_count,
    COUNT(DISTINCT c.agent_id)
      FILTER (WHERE c.agent_id IS NOT NULL)  AS agent_count
  FROM public.commissions c
  LEFT JOIN public.branches b ON b.id = c.branch_id
  WHERE c.status = 'due'
  GROUP BY c.branch_id, b.name
  HAVING COUNT(*) > 0
  ORDER BY pending_amount DESC;
$$;


-- -----------------------------------------------------------------------------
-- Grants — lock down PUBLIC, allow authenticated callers (mirrors 0035).
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_agent_commission_list(text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agent_commission_list(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_pending_dues_by_agent()  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_dues_by_agent() TO authenticated;

REVOKE ALL ON FUNCTION public.get_pending_dues_by_branch()  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_dues_by_branch() TO authenticated;

-- =============================================================================
-- End of 0041_commission_aggregate_rpcs.sql
-- =============================================================================
