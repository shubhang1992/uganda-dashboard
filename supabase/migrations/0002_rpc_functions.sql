-- =============================================================================
-- Universal Pensions Uganda — Phase 1, Step 2: Triggers + RPC functions
-- =============================================================================
-- Adds, on top of 0001_initial_schema.sql:
--   * A subscriber-ID sequence for SECURITY DEFINER signup RPCs (range > seed).
--   * 4 triggers (per plan §"Triggers"):
--       - subscribers AFTER INSERT  → seed subscriber_balances row (idempotent).
--       - transactions AFTER INSERT WHEN type='contribution' → bump balances,
--         apply bucket split, and create the first-contribution commission row.
--       - transactions AFTER INSERT WHEN type='withdrawal'   → decrement
--         balances; subtract from emergency first, then retirement, unless the
--         row carries explicit split_retirement / split_emergency.
--       - commissions BEFORE UPDATE → snapshot previous_status when entering
--         the 'disputed' state.
--   * 7 read RPCs (per plan §"Read-side RPCs"):
--       get_entity_commission_summary, get_top_branch, get_breadcrumb,
--       search_entities, get_agent_commission_detail, get_commission_summary,
--       get_run_branch_breakdown.
--   * 2 atomic-write RPCs (SECURITY DEFINER, per plan §"Atomic write RPCs"):
--       create_subscriber_from_signup, create_subscriber_from_agent_onboard.
--
-- This file intentionally does NOT define:
--   * RLS policies                              (Agent 4 / 0003_rls_policies.sql)
--   * Commission state-machine RPCs             (Agent 5 / 0004_commission_run_rpcs.sql)
--
-- Unit price assumption ------------------------------------------------------
-- src/utils/finance.js does NOT export a canonical unit price. The mock data
-- (src/data/mockData.js line 228) uses ~1000 ± 5% per subscriber to derive
-- `currentUnitValue` and `unitsHeld`. The contribution trigger therefore uses a
-- flat 1000 UGX/unit. To swap in a real fund-NAV table later, replace the
-- constant in trg_transactions_contribution() with a SELECT against that table.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Sequence — subscriber IDs created by atomic-write signup RPCs
-- -----------------------------------------------------------------------------
-- The seed inserts deterministic IDs in the range s-0001 .. s-30000 (zero-padded
-- to 4 digits, per src/data/mockData.js#generateSubscribers). Starting the
-- sequence at 100000 and formatting as 6 digits (s-100000, s-100001, …) keeps
-- live-signup IDs strictly above the seeded range so a re-seed never collides.
CREATE SEQUENCE IF NOT EXISTS public.subscriber_id_seq
  START WITH 100000
  INCREMENT BY 1
  MINVALUE 100000
  NO CYCLE;

-- Commission-ID sequence — used only by the contribution trigger for
-- live-signup commission rows. Seed-inserted commissions use deterministic
-- c-00001..c-NNNNN IDs (see src/data/mockData.js); start the sequence above
-- the seed's reserved range. 8-digit padding keeps lexical ordering correct
-- even if the seeder ever expands past 99,999 commissions.
CREATE SEQUENCE IF NOT EXISTS public.commission_id_seq
  START WITH 1000000
  INCREMENT BY 1
  MINVALUE 1000000
  NO CYCLE;


-- =============================================================================
-- Triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. subscribers AFTER INSERT → seed an empty subscriber_balances row.
-- -----------------------------------------------------------------------------
-- Idempotency: ON CONFLICT DO NOTHING. Combined with
-- `SET session_replication_role = replica` during seed (see plan §"Seed
-- strategy"), this lets the seeder skip the trigger entirely AND lets the
-- live-signup RPC re-insert safely if the row was pre-created.
CREATE OR REPLACE FUNCTION public.trg_subscribers_after_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.subscriber_balances (subscriber_id)
  VALUES (NEW.id)
  ON CONFLICT (subscriber_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscribers_after_insert ON public.subscribers;
CREATE TRIGGER subscribers_after_insert
  AFTER INSERT ON public.subscribers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_subscribers_after_insert();


-- -----------------------------------------------------------------------------
-- 2. transactions AFTER INSERT WHEN type='contribution'
-- -----------------------------------------------------------------------------
-- Three responsibilities:
--   (a) Update subscriber_balances: total_balance += amount; units += amount/1000.
--   (b) Apply bucket split — explicit (split_retirement/split_emergency) when
--       non-null, else default 80/20 retirement/emergency.
--           Verification: a 40,000 contribution defaults to retirement=32,000,
--           emergency=8,000 (plan §"Triggers", verification #4).
--   (c) First-contribution commission: NOT EXISTS guard ensures we only create
--       one commission per (agent, subscriber) lifetime. Trigger fires per
--       seeded transaction; the guard plus the seeder's
--       `session_replication_role = replica` keep things idempotent on re-seed.
--
-- The trigger writes the commission row even for subscribers whose agent_id is
-- NULL by skipping the INSERT (no agent → no commission).
CREATE OR REPLACE FUNCTION public.trg_transactions_contribution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- See unit-price comment at top of file. Replace with a NAV-table lookup if
  -- the fund-pricing table is ever added.
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
  -- subscriber_balances row should already exist (subscribers AFTER INSERT
  -- trigger), but ON CONFLICT keeps us safe against trigger-replica seed runs
  -- where the balance row was hand-inserted by the seeder.
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

  -- (c) First-contribution commission ---------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.commissions WHERE subscriber_id = NEW.subscriber_id
  ) THEN
    -- Resolve agent + branch + subscriber name (denormalised at insert time
    -- so reads don't need a join — mirrors src/services/commissions.js shape).
    SELECT s.agent_id, s.name, a.branch_id
      INTO v_agent_id, v_subscriber_name, v_branch_id
      FROM public.subscribers s
      LEFT JOIN public.agents a ON a.id = s.agent_id
     WHERE s.id = NEW.subscriber_id;

    IF v_agent_id IS NOT NULL THEN
      SELECT rate INTO v_commission_rate
        FROM public.commission_config
       WHERE id = 'default';

      -- Defensive: if commission_config row hasn't been seeded yet, skip
      -- gracefully rather than failing the contribution insert.
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
          NEW.date::date  -- live signups: due immediately; settlement runs sweep them up
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


-- -----------------------------------------------------------------------------
-- 3. transactions AFTER INSERT WHEN type='withdrawal'
-- -----------------------------------------------------------------------------
-- Decrement subscriber_balances.total_balance by NEW.amount and split as:
--   - If split_retirement / split_emergency are non-null → apply literally.
--   - Else: subtract from emergency_balance first; once exhausted, remainder
--     comes from retirement_balance. This mirrors the conservative default
--     described in plan §"Triggers" line 109. (Note: services/subscriber.js
--     #requestWithdrawal currently writes a single-`bucket` row; that path
--     should be migrated to set split_* explicitly so the trigger doesn't
--     have to infer. The fallback exists for legacy / manual inserts.)
--
-- NEW.amount on withdrawal rows is the magnitude (positive). The service
-- layer flips the sign for display; the ledger trigger treats it as positive.
CREATE OR REPLACE FUNCTION public.trg_transactions_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ret_take       NUMERIC;
  v_emg_take       NUMERIC;
  v_current_emg    NUMERIC;
  v_amount         NUMERIC := ABS(NEW.amount);  -- defensive: treat as magnitude
BEGIN
  -- Resolve the split first.
  IF NEW.split_retirement IS NOT NULL AND NEW.split_emergency IS NOT NULL THEN
    v_ret_take := NEW.split_retirement;
    v_emg_take := NEW.split_emergency;
  ELSE
    -- Read current emergency balance to compute the fallback.
    SELECT emergency_balance
      INTO v_current_emg
      FROM public.subscriber_balances
     WHERE subscriber_id = NEW.subscriber_id;

    v_current_emg := COALESCE(v_current_emg, 0);

    IF v_amount <= v_current_emg THEN
      v_emg_take := v_amount;
      v_ret_take := 0;
    ELSE
      v_emg_take := v_current_emg;
      v_ret_take := v_amount - v_current_emg;
    END IF;
  END IF;

  UPDATE public.subscriber_balances
     SET retirement_balance = GREATEST(0, retirement_balance - v_ret_take),
         emergency_balance  = GREATEST(0, emergency_balance  - v_emg_take),
         total_balance      = GREATEST(0, total_balance - v_amount),
         updated_at         = now()
   WHERE subscriber_id = NEW.subscriber_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_after_insert_withdrawal ON public.transactions;
CREATE TRIGGER transactions_after_insert_withdrawal
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'withdrawal')
  EXECUTE FUNCTION public.trg_transactions_withdrawal();


-- -----------------------------------------------------------------------------
-- 4. commissions BEFORE UPDATE — snapshot previous_status on dispute entry.
-- -----------------------------------------------------------------------------
-- Mirrors src/services/commissions.js#disputeCommission line ~729:
--   `c.previousStatus = c.status; c.status = 'disputed';`
-- The state-machine RPCs in 0004_ may set previous_status explicitly; this
-- trigger acts as a safety net so any caller that flips status to 'disputed'
-- (RLS-bypassing admin tools, manual SQL, etc.) preserves the audit hop.
-- No-op on all other transitions.
CREATE OR REPLACE FUNCTION public.trg_commissions_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'disputed'::commission_status
     AND OLD.status IS DISTINCT FROM 'disputed'::commission_status
  THEN
    NEW.previous_status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commissions_before_update ON public.commissions;
CREATE TRIGGER commissions_before_update
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commissions_before_update();


-- =============================================================================
-- Read RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_entity_commission_summary(level, entity_id) → jsonb
-- -----------------------------------------------------------------------------
-- Powers `src/services/commissions.js#getEntityCommissionSummary` (lines
-- 914–920). Return shape (camelCase keys — supabase-js will JSON.parse, the
-- caller maps to the existing JS field names):
--
--   { totalPaid, totalDue, totalDisputed,
--     countPaid, countDue, countDisputed,
--     total, countTotal, settlementRate }
--
-- Helper-function bucket rules mirror commissions.js exactly:
--   paid        = released + confirmed
--   outstanding = due + in_run + held
--   disputed    = disputed
-- See `STATUSES_PAID` / `STATUSES_OUTSTANDING` constants in commissions.js.
CREATE OR REPLACE FUNCTION public.get_entity_commission_summary(
  p_level     TEXT,
  p_entity_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_paid     NUMERIC := 0;
  v_total_due      NUMERIC := 0;
  v_total_disputed NUMERIC := 0;
  v_count_paid     INTEGER := 0;
  v_count_due      INTEGER := 0;
  v_count_disputed INTEGER := 0;
  v_count_total    INTEGER := 0;
  v_settlement_rate INTEGER := 0;
BEGIN
  WITH scoped AS (
    SELECT c.amount, c.status
      FROM public.commissions c
     WHERE
       (p_level = 'agent'    AND c.agent_id    = p_entity_id)
    OR (p_level = 'branch'   AND c.branch_id   = p_entity_id)
    OR (p_level = 'district' AND c.branch_id IN (
          SELECT b.id FROM public.branches b WHERE b.district_id = p_entity_id
       ))
    OR (p_level = 'region'   AND c.branch_id IN (
          SELECT b.id FROM public.branches b
            JOIN public.districts d ON d.id = b.district_id
           WHERE d.region_id = p_entity_id
       ))
    OR (p_level = 'country')
  )
  SELECT
    COALESCE(SUM(CASE WHEN status IN ('released','confirmed') THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status IN ('due','in_run','held')  THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status = 'disputed' THEN amount END), 0),
    COALESCE(COUNT(*) FILTER (WHERE status IN ('released','confirmed')), 0),
    COALESCE(COUNT(*) FILTER (WHERE status IN ('due','in_run','held')), 0),
    COALESCE(COUNT(*) FILTER (WHERE status = 'disputed'), 0)
    INTO
      v_total_paid, v_total_due, v_total_disputed,
      v_count_paid, v_count_due, v_count_disputed
    FROM scoped;

  v_count_total := v_count_paid + v_count_due + v_count_disputed;
  IF v_count_total > 0 THEN
    v_settlement_rate := ROUND((v_count_paid::numeric / v_count_total) * 100);
  END IF;

  RETURN jsonb_build_object(
    'totalPaid',      v_total_paid,
    'totalDue',       v_total_due,
    'totalDisputed',  v_total_disputed,
    'countPaid',      v_count_paid,
    'countDue',       v_count_due,
    'countDisputed',  v_count_disputed,
    'total',          v_total_paid + v_total_due + v_total_disputed,
    'countTotal',     v_count_total,
    'settlementRate', v_settlement_rate
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- get_top_branch(level, parent_id) → jsonb
-- -----------------------------------------------------------------------------
-- Powers `src/services/entities.js#getTopPerformingBranch` (lines 113–116).
-- Mirrors `src/data/mockData.js#getTopBranch` (line 1038): finds the branch
-- with the highest most-recent-month contribution total within the scope. The
-- JS implementation reads from a pre-aggregated `metrics.monthlyContributions`
-- array; the SQL implementation sums real transactions for the last calendar
-- month covered by `transactions.date`.
--
-- Return shape: { name: TEXT, contribution: NUMERIC } | NULL
CREATE OR REPLACE FUNCTION public.get_top_branch(
  p_level     TEXT,
  p_parent_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_level NOT IN ('country', 'region', 'district') THEN
    RETURN NULL;
  END IF;

  WITH scoped_branches AS (
    SELECT b.id, b.name
      FROM public.branches b
     WHERE p_level = 'country'
        OR (p_level = 'district' AND b.district_id = p_parent_id)
        OR (p_level = 'region' AND b.district_id IN (
              SELECT d.id FROM public.districts d
               WHERE d.region_id = p_parent_id
           ))
  ),
  -- Constrain the lookup to the most recent calendar month present in the
  -- transactions table — keeps the metric stable when seeded data lags real
  -- "today".
  last_month AS (
    SELECT date_trunc('month', MAX(date))::date AS month_start
      FROM public.transactions
     WHERE type = 'contribution'
  ),
  contribs AS (
    SELECT t.agent_id, t.amount
      FROM public.transactions t, last_month lm
     WHERE t.type = 'contribution'
       AND t.date >= lm.month_start
       AND t.date <  (lm.month_start + INTERVAL '1 month')
  ),
  by_branch AS (
    SELECT sb.id, sb.name, COALESCE(SUM(c.amount), 0) AS contribution
      FROM scoped_branches sb
      LEFT JOIN public.agents a ON a.branch_id = sb.id
      LEFT JOIN contribs c       ON c.agent_id = a.id
     GROUP BY sb.id, sb.name
  )
  SELECT jsonb_build_object(
    'name',         name,
    'contribution', contribution
  )
    INTO v_result
    FROM by_branch
   ORDER BY contribution DESC, name ASC
   LIMIT 1;

  RETURN v_result;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_breadcrumb(level, ids jsonb) → jsonb
-- -----------------------------------------------------------------------------
-- Powers `src/services/entities.js#getBreadcrumb` (lines 128–131). Mirrors
-- `src/data/mockData.js#getBreadcrumbPath` (line 1008):
--   * Always start with the country sentinel.
--   * Walk REGION → DISTRICT → BRANCH → AGENT → SUBSCRIBER, halting at the
--     current level.
--
-- Input `p_ids` is a jsonb object like
--   { "region": "r-central", "district": "d-kampala", "branch": "b-kam-015" }
-- Return shape: jsonb array of `{ level, id, name }`.
CREATE OR REPLACE FUNCTION public.get_breadcrumb(
  p_level TEXT,
  p_ids   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_crumbs jsonb := jsonb_build_array(
    jsonb_build_object('level', 'country', 'id', 'ug', 'name', 'Uganda')
  );
  v_order  TEXT[] := ARRAY['region', 'district', 'branch', 'agent', 'subscriber'];
  v_lvl    TEXT;
  v_id     TEXT;
  v_name   TEXT;
BEGIN
  FOREACH v_lvl IN ARRAY v_order LOOP
    v_id := p_ids ->> v_lvl;
    IF v_id IS NULL OR v_id = '' THEN
      EXIT;
    END IF;

    v_name := NULL;
    IF v_lvl = 'region' THEN
      SELECT name INTO v_name FROM public.regions     WHERE id = v_id;
    ELSIF v_lvl = 'district' THEN
      SELECT name INTO v_name FROM public.districts   WHERE id = v_id;
    ELSIF v_lvl = 'branch' THEN
      SELECT name INTO v_name FROM public.branches    WHERE id = v_id;
    ELSIF v_lvl = 'agent' THEN
      SELECT name INTO v_name FROM public.agents      WHERE id = v_id;
    ELSIF v_lvl = 'subscriber' THEN
      SELECT name INTO v_name FROM public.subscribers WHERE id = v_id;
    END IF;

    IF v_name IS NOT NULL THEN
      v_crumbs := v_crumbs || jsonb_build_array(
        jsonb_build_object('level', v_lvl, 'id', v_id, 'name', v_name)
      );
    END IF;

    EXIT WHEN v_lvl = p_level;
  END LOOP;

  RETURN v_crumbs;
END;
$$;


-- -----------------------------------------------------------------------------
-- search_entities(q) → TABLE(id, name, level, label, parentId)
-- -----------------------------------------------------------------------------
-- Powers `src/services/search.js#searchEntities`. Return shape (lines 25–31):
--   Array<{ id, name, level, label, parentId }>
-- with max 8 results.
--
-- search.js currently excludes subscribers ("too many for client-side"); the
-- server-side pg_trgm index can handle them, but the plan only lists regions/
-- districts/branches/agents/subscribers as fuzzy search targets. Subscribers
-- are included here so the RPC return is a superset; the client-side cap of 8
-- means high-affinity entity matches still bubble up first when the user
-- searches for "Kampala" vs a subscriber name.
CREATE OR REPLACE FUNCTION public.search_entities(p_q TEXT)
RETURNS TABLE(
  entity_id   TEXT,
  entity_name TEXT,
  level       TEXT,
  label       TEXT,
  parent_id   TEXT,
  score       REAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Min-length guard: matches src/services/search.js (returns [] for < 2 chars).
  IF p_q IS NULL OR length(p_q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.entity_id, u.entity_name, u.level, u.label, u.parent_id, u.score
    FROM (
      SELECT r.id   AS entity_id,
             r.name AS entity_name,
             'region'::text AS level,
             'Region'::text AS label,
             r.parent_id    AS parent_id,
             similarity(r.name, p_q) AS score
        FROM public.regions r
       WHERE r.name ILIKE '%' || p_q || '%'
          OR r.name % p_q
      UNION ALL
      SELECT d.id, d.name, 'district', 'District',
             d.region_id, similarity(d.name, p_q)
        FROM public.districts d
       WHERE d.name ILIKE '%' || p_q || '%'
          OR d.name % p_q
      UNION ALL
      SELECT b.id, b.name, 'branch', 'Branch',
             b.district_id, similarity(b.name, p_q)
        FROM public.branches b
       WHERE b.name ILIKE '%' || p_q || '%'
          OR b.name % p_q
      UNION ALL
      SELECT ag.id, ag.name, 'agent', 'Agent',
             ag.branch_id, similarity(ag.name, p_q)
        FROM public.agents ag
       WHERE ag.name ILIKE '%' || p_q || '%'
          OR ag.name % p_q
      UNION ALL
      SELECT sb.id, sb.name, 'subscriber', 'Subscriber',
             sb.agent_id, similarity(sb.name, p_q)
        FROM public.subscribers sb
       WHERE sb.name ILIKE '%' || p_q || '%'
          OR sb.name % p_q
    ) u
   ORDER BY u.score DESC, u.entity_name ASC
   LIMIT 8;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_agent_commission_detail(agent_id) → jsonb
-- -----------------------------------------------------------------------------
-- Powers `src/services/commissions.js#getAgentCommissionDetail` (lines
-- 181–232). Return shape mirrors the JS object exactly, including the
-- `paidTransactions` and `dueTransactions` sub-arrays.
--
-- `daysToDate` for due rows is computed against now() (no MOCK_NOW once we
-- leave the seeded prototype).
CREATE OR REPLACE FUNCTION public.get_agent_commission_detail(
  p_agent_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_agent           RECORD;
  v_branch_name     TEXT;
  v_total           NUMERIC := 0;
  v_total_paid      NUMERIC := 0;
  v_total_due       NUMERIC := 0;
  v_total_subs      INTEGER := 0;
  v_active_subs     INTEGER := 0;
  v_dormant_subs    INTEGER := 0;
  v_paid_txns       jsonb;
  v_due_txns        jsonb;
BEGIN
  SELECT a.id, a.name, a.employee_id, a.phone, a.branch_id, a.rating
    INTO v_agent
    FROM public.agents a
   WHERE a.id = p_agent_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT b.name INTO v_branch_name
    FROM public.branches b WHERE b.id = v_agent.branch_id;

  -- Totals + counts.
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('released','confirmed')), 0),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('due','in_run','held')), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('disputed','rejected')),
    COUNT(*) FILTER (WHERE status = 'disputed')
    INTO v_total, v_total_paid, v_total_due, v_total_subs, v_active_subs, v_dormant_subs
    FROM public.commissions
   WHERE agent_id = p_agent_id;

  -- Paid transactions (released + confirmed).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              c.id,
    'transactionDate', c.paid_date,
    'amount',          c.amount,
    'status',          c.status::text,
    'runId',           c.run_id,
    'txnRef',          c.txn_ref,
    'subscriberId',    c.subscriber_id,
    'subscriberName',  c.subscriber_name
  ) ORDER BY c.paid_date DESC NULLS LAST), '[]'::jsonb)
    INTO v_paid_txns
    FROM public.commissions c
   WHERE c.agent_id = p_agent_id
     AND c.status IN ('released', 'confirmed');

  -- Due transactions (due + in_run + held).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              c.id,
    'dueDate',         c.due_date,
    'daysToDate',      CASE
                          WHEN c.due_date IS NULL THEN NULL
                          ELSE (c.due_date - CURRENT_DATE)
                       END,
    'amount',          c.amount,
    'status',          c.status::text,
    'runId',           c.run_id,
    'branchId',        c.branch_id,
    'branchName',      v_branch_name,
    'subscriberId',    c.subscriber_id,
    'subscriberName',  c.subscriber_name
  ) ORDER BY c.due_date ASC NULLS LAST), '[]'::jsonb)
    INTO v_due_txns
    FROM public.commissions c
   WHERE c.agent_id = p_agent_id
     AND c.status IN ('due', 'in_run', 'held');

  RETURN jsonb_build_object(
    'agentId',              v_agent.id,
    'agentName',            v_agent.name,
    'employeeId',           COALESCE(v_agent.employee_id, ''),
    'agentPhone',           COALESCE(v_agent.phone, ''),
    'branchId',             v_agent.branch_id,
    'branchName',           COALESCE(v_branch_name, 'Unknown'),
    'rating',               COALESCE(v_agent.rating, 0),
    'totalCommissions',     v_total,
    'totalPaid',            v_total_paid,
    'totalDue',             v_total_due,
    'subscribersOnboarded', v_total_subs,
    'activeSubscribers',    v_active_subs,
    'dormantSubscribers',   v_dormant_subs,
    'paidTransactions',     v_paid_txns,
    'dueTransactions',      v_due_txns
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- get_commission_summary(branch_id default null) → jsonb
-- -----------------------------------------------------------------------------
-- Powers `src/services/commissions.js#getCommissionSummary` (lines 97–126).
-- Return shape (per the service):
--   { totalCommissions, totalPaid, totalDue, totalDisputed,
--     totalInRun, totalReleased, totalConfirmed,
--     countTotal, countPaid, countDue, countDisputed,
--     countInRun, countReleased, countConfirmed }
CREATE OR REPLACE FUNCTION public.get_commission_summary(
  p_branch_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH scoped AS (
    SELECT amount, status
      FROM public.commissions
     WHERE p_branch_id IS NULL OR branch_id = p_branch_id
  )
  SELECT jsonb_build_object(
    'totalCommissions', COALESCE(SUM(amount), 0),
    'totalPaid',        COALESCE(SUM(amount) FILTER (WHERE status IN ('released','confirmed')), 0),
    'totalDue',         COALESCE(SUM(amount) FILTER (WHERE status IN ('due','in_run','held')), 0),
    'totalDisputed',    COALESCE(SUM(amount) FILTER (WHERE status = 'disputed'), 0),
    'totalInRun',       COALESCE(SUM(amount) FILTER (WHERE status = 'in_run'), 0),
    'totalReleased',    COALESCE(SUM(amount) FILTER (WHERE status = 'released'), 0),
    'totalConfirmed',   COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0),
    'countTotal',       COUNT(*),
    'countPaid',        COUNT(*) FILTER (WHERE status IN ('released','confirmed')),
    'countDue',         COUNT(*) FILTER (WHERE status IN ('due','in_run','held')),
    'countDisputed',    COUNT(*) FILTER (WHERE status = 'disputed'),
    'countInRun',       COUNT(*) FILTER (WHERE status = 'in_run'),
    'countReleased',    COUNT(*) FILTER (WHERE status = 'released'),
    'countConfirmed',   COUNT(*) FILTER (WHERE status = 'confirmed')
  )
    INTO v_result
    FROM scoped;

  RETURN v_result;
END;
$$;


-- -----------------------------------------------------------------------------
-- get_run_branch_breakdown(run_id) → jsonb array
-- -----------------------------------------------------------------------------
-- Powers `src/services/commissions.js#getRunBranchBreakdown` (lines 341–375).
-- Per-branch totals + review state inside a run. Every branchReview is
-- included even if all its lines are held/disputed (rows can have count=0).
--
-- Return: jsonb array of
--   { branchId, branchName, count, amount, releasedAmount,
--     state, reviewedAt, reviewedBy, releasedAt }
--
-- Note on `branchEmployeeId`: the JS adds `branchEmployeeId: branch?.employeeId
-- ?? null`, but `branches` does not have an `employee_id` column (line 99 of
-- 0001 only defines manager_*). Set to NULL so the JS object keeps the same
-- key shape; callers should not depend on this value.
CREATE OR REPLACE FUNCTION public.get_run_branch_breakdown(
  p_run_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.settlement_runs WHERE id = p_run_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH branch_totals AS (
    -- One row per branch that has at least one commission line in the run.
    SELECT
      c.branch_id,
      COUNT(*)                                                      AS line_count,
      COALESCE(SUM(c.amount), 0)                                    AS amount,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status IN ('released','confirmed')), 0)
                                                                    AS released_amount
      FROM public.commissions c
     WHERE c.run_id = p_run_id
     GROUP BY c.branch_id
  ),
  -- Ensure every settlement_run_branch_reviews row is present, even with 0 lines.
  reviews AS (
    SELECT
      r.branch_id,
      r.state,
      r.reviewed_by,
      r.reviewed_at,
      r.released_at
      FROM public.settlement_run_branch_reviews r
     WHERE r.run_id = p_run_id
  ),
  merged AS (
    SELECT
      COALESCE(bt.branch_id, rv.branch_id)            AS branch_id,
      COALESCE(bt.line_count, 0)                      AS line_count,
      COALESCE(bt.amount, 0)                          AS amount,
      COALESCE(bt.released_amount, 0)                 AS released_amount,
      COALESCE(rv.state, 'pending'::settlement_run_branch_review_state)
                                                      AS state,
      rv.reviewed_by,
      rv.reviewed_at,
      rv.released_at
      FROM branch_totals bt
      FULL OUTER JOIN reviews rv ON rv.branch_id = bt.branch_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId',         m.branch_id,
    'branchName',       COALESCE(b.name, m.branch_id),
    'branchEmployeeId', NULL,
    'count',            m.line_count,
    'amount',           m.amount,
    'releasedAmount',   m.released_amount,
    'state',            m.state::text,
    'reviewedAt',       m.reviewed_at,
    'reviewedBy',       m.reviewed_by,
    'releasedAt',       m.released_at
  ) ORDER BY COALESCE(b.name, m.branch_id) ASC), '[]'::jsonb)
    INTO v_result
    FROM merged m
    LEFT JOIN public.branches b ON b.id = m.branch_id;

  RETURN v_result;
END;
$$;


-- =============================================================================
-- Atomic write RPCs (SECURITY DEFINER)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- _validate_signup_payload(payload) — shared payload validator
-- -----------------------------------------------------------------------------
-- Raises EXCEPTION on the first failed check, so callers never need to read
-- a status code. Postgres functions are transactional by default, so any
-- RAISE here rolls back the in-flight signup transaction.
CREATE OR REPLACE FUNCTION public._validate_signup_payload(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_phone        TEXT;
  v_full_name    TEXT;
  v_dob          TEXT;
  v_gender       TEXT;
  v_nin          TEXT;
  v_district_id  TEXT;
  v_consent      BOOLEAN;
  v_schedule     jsonb;
BEGIN
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'signup payload is required'
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  v_phone       := p_payload ->> 'phone';
  v_full_name   := p_payload ->> 'fullName';
  v_dob         := p_payload ->> 'dob';
  v_gender      := p_payload ->> 'gender';
  v_nin         := p_payload ->> 'nin';
  v_district_id := p_payload ->> 'districtId';
  v_consent     := (p_payload ->> 'consent')::boolean;
  v_schedule    := p_payload -> 'contributionSchedule';

  IF v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'phone is required';
  END IF;
  -- Uganda 9-digit format (no +256 prefix from SignupContext per the JSDoc).
  -- Allow either bare 9 digits or +2569XXXXXXXX form to stay tolerant of both
  -- the OnboardingComplete path and the legacy SignupContext stash.
  IF v_phone !~ '^(\+?256)?[0-9]{9}$' THEN
    RAISE EXCEPTION 'phone must be a valid Uganda number (9 digits, optional +256 prefix); got: %', v_phone;
  END IF;

  IF v_full_name IS NULL OR length(trim(v_full_name)) < 2 THEN
    RAISE EXCEPTION 'fullName is required';
  END IF;
  IF v_dob IS NULL OR v_dob !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'dob is required (YYYY-MM-DD)';
  END IF;
  IF v_gender IS NULL OR v_gender NOT IN ('male','female','other') THEN
    RAISE EXCEPTION 'gender must be male|female|other';
  END IF;
  IF v_nin IS NULL OR length(trim(v_nin)) = 0 THEN
    RAISE EXCEPTION 'nin is required';
  END IF;
  IF v_district_id IS NULL OR v_district_id = '' THEN
    RAISE EXCEPTION 'districtId is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.districts WHERE id = v_district_id) THEN
    RAISE EXCEPTION 'unknown district: %', v_district_id;
  END IF;
  IF v_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent must be explicitly accepted';
  END IF;
  IF v_schedule IS NULL OR (v_schedule ->> 'amount')::numeric IS NULL THEN
    RAISE EXCEPTION 'contributionSchedule.amount is required';
  END IF;
  IF (v_schedule ->> 'amount')::numeric <= 0 THEN
    RAISE EXCEPTION 'contributionSchedule.amount must be > 0';
  END IF;
  IF (v_schedule ->> 'frequency') IS NULL THEN
    RAISE EXCEPTION 'contributionSchedule.frequency is required';
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- _insert_subscriber_chain(payload, calling_agent_id) — shared insert chain
-- -----------------------------------------------------------------------------
-- Used by both atomic-write RPCs. Performs the 5-table insert chain:
--   subscribers → contribution_schedules → nominees(×N) → optional
--   insurance_policies → first transactions row of type='contribution'.
-- Returns the newly-minted subscriber ID. The contribution trigger above
-- handles `subscriber_balances` + the first-contribution `commissions` row.
CREATE OR REPLACE FUNCTION public._insert_subscriber_chain(
  p_payload          jsonb,
  p_calling_agent_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id         TEXT;
  v_schedule       jsonb;
  v_amount         NUMERIC;
  v_retirement_pct INTEGER;
  v_emergency_pct  INTEGER;
  v_frequency      TEXT;
  v_freq_per_year  INTEGER;
  v_next_due       DATE;
  v_p_ben          jsonb;
  v_i_ben          jsonb;
  v_b              jsonb;
  v_nom_counter    INTEGER := 0;
  v_today          DATE := CURRENT_DATE;
  v_dob            DATE;
  v_age            INTEGER;
  v_insurance_pol  jsonb;
  v_tx_id          TEXT;
BEGIN
  -- Mint ID inside the function (sequence-backed; > seeded range).
  v_new_id := 's-' || lpad(nextval('public.subscriber_id_seq')::text, 6, '0');

  v_schedule       := p_payload -> 'contributionSchedule';
  v_amount         := (v_schedule ->> 'amount')::numeric;
  v_retirement_pct := COALESCE((v_schedule ->> 'retirementPct')::integer, 80);
  v_emergency_pct  := COALESCE((v_schedule ->> 'emergencyPct')::integer,  100 - v_retirement_pct);
  v_frequency      := COALESCE(v_schedule ->> 'frequency', 'monthly');
  v_freq_per_year  := CASE v_frequency
                        WHEN 'weekly'      THEN 52
                        WHEN 'monthly'     THEN 12
                        WHEN 'quarterly'   THEN 4
                        WHEN 'half-yearly' THEN 2
                        WHEN 'annually'    THEN 1
                        ELSE 12
                      END;
  -- Next due = today + (365 / periodsPerYear) days; matches the spirit of
  -- mockData.js's nextDueOffsetDays default (1..30 days from now).
  v_next_due := v_today + ((365 / v_freq_per_year))::int;

  v_dob := (p_payload ->> 'dob')::date;
  v_age := EXTRACT(YEAR FROM age(v_today, v_dob))::int;

  ------------------------------------------------------------- subscribers
  INSERT INTO public.subscribers (
    id,
    name,
    email,
    phone,
    gender,
    age,
    dob,
    nin,
    occupation,
    agent_id,
    district_id,
    kyc_status,
    is_active,
    is_demo_signup,
    insurance_same_as_pension,
    registered_date,
    consent_at,
    contribution_history,
    products_held
  ) VALUES (
    v_new_id,
    p_payload ->> 'fullName',
    NULLIF(p_payload ->> 'email', ''),
    p_payload ->> 'phone',
    p_payload ->> 'gender',
    v_age,
    v_dob,
    p_payload ->> 'nin',
    NULLIF(p_payload ->> 'occupation', ''),
    p_calling_agent_id,
    p_payload ->> 'districtId',
    'complete',
    TRUE,
    TRUE,
    COALESCE((p_payload ->> 'insuranceSameAsPension')::boolean, TRUE),
    v_today,
    COALESCE((p_payload ->> 'consentTimestamp')::timestamptz, now()),
    '[]'::jsonb,
    '[]'::jsonb
  );

  ------------------------------------------------------- contribution_schedules
  INSERT INTO public.contribution_schedules (
    subscriber_id,
    frequency,
    amount,
    retirement_pct,
    emergency_pct,
    include_insurance,
    insurance_choice_made,
    next_due_date
  ) VALUES (
    v_new_id,
    v_frequency,
    v_amount,
    v_retirement_pct,
    v_emergency_pct,
    COALESCE((p_payload ->> 'includeInsurance')::boolean, FALSE),
    COALESCE((p_payload ->> 'insuranceChoiceMade')::boolean, TRUE),
    v_next_due
  );

  ------------------------------------------------------------------- nominees
  -- Pension beneficiaries always go in.
  v_p_ben := COALESCE(p_payload -> 'pensionBeneficiaries', '[]'::jsonb);
  FOR v_b IN SELECT jsonb_array_elements(v_p_ben) LOOP
    v_nom_counter := v_nom_counter + 1;
    INSERT INTO public.nominees (
      id, subscriber_id, type, name, phone, relationship, nin, share
    ) VALUES (
      'nom-' || v_new_id || '-p-' || v_nom_counter,
      v_new_id,
      'pension',
      v_b ->> 'name',
      v_b ->> 'phone',
      v_b ->> 'relationship',
      v_b ->> 'nin',
      COALESCE((v_b ->> 'share')::numeric, 0)
    );
  END LOOP;

  -- Insurance beneficiaries: if insuranceSameAsPension, copy the pension list.
  IF COALESCE((p_payload ->> 'insuranceSameAsPension')::boolean, TRUE) THEN
    v_nom_counter := 0;
    FOR v_b IN SELECT jsonb_array_elements(v_p_ben) LOOP
      v_nom_counter := v_nom_counter + 1;
      INSERT INTO public.nominees (
        id, subscriber_id, type, name, phone, relationship, nin, share
      ) VALUES (
        'nom-' || v_new_id || '-i-' || v_nom_counter,
        v_new_id,
        'insurance',
        v_b ->> 'name',
        v_b ->> 'phone',
        v_b ->> 'relationship',
        v_b ->> 'nin',
        COALESCE((v_b ->> 'share')::numeric, 0)
      );
    END LOOP;
  ELSE
    v_i_ben := COALESCE(p_payload -> 'insuranceBeneficiaries', '[]'::jsonb);
    v_nom_counter := 0;
    FOR v_b IN SELECT jsonb_array_elements(v_i_ben) LOOP
      v_nom_counter := v_nom_counter + 1;
      INSERT INTO public.nominees (
        id, subscriber_id, type, name, phone, relationship, nin, share
      ) VALUES (
        'nom-' || v_new_id || '-i-' || v_nom_counter,
        v_new_id,
        'insurance',
        v_b ->> 'name',
        v_b ->> 'phone',
        v_b ->> 'relationship',
        v_b ->> 'nin',
        COALESCE((v_b ->> 'share')::numeric, 0)
      );
    END LOOP;
  END IF;

  ----------------------------------------------------------- insurance_policies
  -- Optional. Accepts either an `insurancePolicy` jsonb sub-object or the
  -- legacy flat `cover` / `premiumMonthly` keys at the payload root.
  v_insurance_pol := p_payload -> 'insurancePolicy';
  IF v_insurance_pol IS NOT NULL THEN
    INSERT INTO public.insurance_policies (
      subscriber_id, cover, premium_monthly,
      policy_start, renewal_date, status
    ) VALUES (
      v_new_id,
      COALESCE((v_insurance_pol ->> 'cover')::numeric, 0),
      COALESCE((v_insurance_pol ->> 'premiumMonthly')::numeric, 0),
      COALESCE((v_insurance_pol ->> 'policyStart')::date, v_today),
      COALESCE((v_insurance_pol ->> 'renewalDate')::date, (v_today + INTERVAL '1 year')::date),
      CASE
        WHEN COALESCE((v_insurance_pol ->> 'cover')::numeric, 0) > 0 THEN 'active'
        ELSE 'inactive'
      END
    );
  END IF;

  ----------------------------------------------------------------- transactions
  -- First contribution. The AFTER INSERT trigger above:
  --   • bumps subscriber_balances (split 80/20 or per-row override),
  --   • creates the first-contribution commission row.
  v_tx_id := 'tx-' || v_new_id || '-init';
  INSERT INTO public.transactions (
    id,
    subscriber_id,
    agent_id,
    type,
    amount,
    date,
    status,
    method,
    txn_ref,
    split_retirement,
    split_emergency
  ) VALUES (
    v_tx_id,
    v_new_id,
    p_calling_agent_id,
    'contribution',
    v_amount,
    now(),
    'settled',
    COALESCE(p_payload ->> 'paymentMethod', 'MTN Mobile Money'),
    'CT-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
    -- Honour the schedule's retirement/emergency percentages on the first txn
    -- so the resulting balances mirror what mockData seeds (e.g. 40k → 32k/8k
    -- on the default 80/20 split).
    ROUND(v_amount * (v_retirement_pct / 100.0)),
    v_amount - ROUND(v_amount * (v_retirement_pct / 100.0))
  );

  RETURN v_new_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- create_subscriber_from_signup(payload jsonb) → text
-- -----------------------------------------------------------------------------
-- Public entry point for the live-signup `/signup/contribution` flow. Bypasses
-- RLS via `SECURITY DEFINER`, since the prospect has no JWT yet — auth happens
-- after this RPC returns successfully.
--
-- Caller: src/services/subscriber.js#createFromSignup
--   payload = SignupContext snapshot ({phone, fullName, dob, gender, nin,
--   email, occupation, districtId, pensionBeneficiaries, insuranceBeneficiaries,
--   insuranceSameAsPension, insuranceChoiceMade, consent, consentTimestamp,
--   contributionSchedule}).
--
-- All inserts run in a single Postgres transaction (function bodies are
-- transactional by default), so any RAISE rolls everything back.
CREATE OR REPLACE FUNCTION public.create_subscriber_from_signup(
  payload jsonb
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id TEXT;
BEGIN
  PERFORM public._validate_signup_payload(payload);
  v_new_id := public._insert_subscriber_chain(payload, 'a-001');
  RETURN v_new_id;
END;
$$;

-- The signup RPC must be callable without a JWT (per plan §"WRITE policies"
-- comment: "subscribers initial INSERT during signup … bypasses policies via
-- the SECURITY DEFINER create_subscriber_from_signup RPC (signup has no JWT
-- yet)"). Grant explicit EXECUTE to anon + authenticated.
REVOKE ALL ON FUNCTION public.create_subscriber_from_signup(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_signup(jsonb)
  TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- create_subscriber_from_agent_onboard(payload, calling_agent_id) → text
-- -----------------------------------------------------------------------------
-- Agent-initiated subscriber onboarding (Agent dashboard /dashboard/onboard).
-- The calling agent's ID is passed explicitly by the caller AND cross-checked
-- against the JWT's `agentId` claim — protects against an agent passing a
-- forged ID.
--
-- Caller: src/services/subscriber.js#createFromAgentOnboard
--   payload          = same shape as create_subscriber_from_signup
--   calling_agent_id = the agent's authenticated agent_id from auth.jwt()
CREATE OR REPLACE FUNCTION public.create_subscriber_from_agent_onboard(
  payload          jsonb,
  calling_agent_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_agent_id TEXT;
  v_new_id       TEXT;
BEGIN
  IF calling_agent_id IS NULL OR calling_agent_id = '' THEN
    RAISE EXCEPTION 'calling_agent_id is required';
  END IF;

  -- Cross-check the explicit arg against the JWT claim. auth.jwt() returns a
  -- jsonb of the verified JWT; the caller is expected to pass the same
  -- agentId they extracted from auth.jwt() ->> 'agentId'. This both protects
  -- against forged IDs and keeps the function callable from psql in dev (where
  -- auth.jwt() may be null) as long as the caller is service_role.
  BEGIN
    v_jwt_agent_id := auth.jwt() ->> 'agentId';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_agent_id := NULL;
  END;

  IF v_jwt_agent_id IS NOT NULL AND v_jwt_agent_id <> calling_agent_id THEN
    RAISE EXCEPTION 'calling_agent_id (%) does not match JWT agentId (%)',
      calling_agent_id, v_jwt_agent_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = calling_agent_id) THEN
    RAISE EXCEPTION 'unknown agent: %', calling_agent_id;
  END IF;

  PERFORM public._validate_signup_payload(payload);
  v_new_id := public._insert_subscriber_chain(payload, calling_agent_id);
  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subscriber_from_agent_onboard(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_agent_onboard(jsonb, text)
  TO authenticated;


-- =============================================================================
-- Grants for read RPCs — open to authenticated; signup RPC also to anon.
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.get_entity_commission_summary(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_branch(text, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_breadcrumb(text, jsonb)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_entities(text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_commission_detail(text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_run_branch_breakdown(text)              TO authenticated;


-- =============================================================================
-- End of 0002_rpc_functions.sql
-- Next:
--   0003_rls_policies.sql        — Agent 4
--   0004_commission_run_rpcs.sql — Agent 5
-- =============================================================================
