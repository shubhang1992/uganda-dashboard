-- =============================================================================
-- Universal Pensions Uganda — 0016: distributors table
-- =============================================================================
-- The platform has been operating with a "distributor" role for months
-- (settled JWT claim `distributorId`, dashboard at `/dashboard`, RLS predicates
-- on commissions / settlement_runs / settlement_run_branch_reviews keyed on
-- `auth.jwt() ->> 'distributorId'`), but no `distributors` table ever existed.
-- The frontend has hard-coded `d-001` as a `demo_personas` fallback ID
-- (BACKEND.md §8, §14a) and the seed inserts personas with `entity_id =
-- 'd-001' / 'd-002'` referencing a row that does not exist in any table.
--
-- This migration lands a thin singleton-friendly table so:
--   1. Future role-specific data (manager name/phone/email, status) has a home.
--   2. The settlement-run RPCs can validate `distributor_id` against a real FK
--      target (future work — no FK is added here to avoid churning 0014/0015).
--   3. The role-permissions matrix in `docs/role-permissions.md` matches reality.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + ON CONFLICT
-- on the seed row, so re-running is a no-op. Forward-only per the project's
-- migration discipline (BACKEND.md §15 "Migration discipline").
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.distributors (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_id     TEXT NOT NULL DEFAULT 'ug',
  manager_name  TEXT,
  manager_phone TEXT,
  manager_email TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;

-- Public read: every authenticated role (subscriber/agent/branch/distributor)
-- + anon may read distributor catalogue rows. Pattern mirrors the post-0014
-- public-geo-reads stance for `regions` / `districts` — the distributor name
-- is reference data, not PII. If PII concerns ever surface, tighten to
-- `auth.jwt() ->> 'app_role' IS NOT NULL`.
DROP POLICY IF EXISTS distributors_select ON public.distributors;
CREATE POLICY distributors_select ON public.distributors FOR SELECT USING (true);

-- Self-update: a distributor JWT may UPDATE its own row (manager contact
-- details, status). The narrow scope mirrors the `subscribers_update_self`
-- pattern in 0005. Column immutability (no id/parent_id changes) can be
-- enforced via a BEFORE UPDATE trigger in a future migration if/when the
-- distributor dashboard adds row edits — for now the policy is ownership-only.
DROP POLICY IF EXISTS distributors_update_self ON public.distributors;
CREATE POLICY distributors_update_self ON public.distributors FOR UPDATE
  USING (auth.jwt() ->> 'distributorId' = id);

-- Seed the singleton row referenced by `demo_personas.entity_id = 'd-001'`
-- (scripts/seed-supabase.mjs line 843). ON CONFLICT keeps re-runs idempotent
-- without overwriting fields a future hand-edit may have set.
INSERT INTO public.distributors (id, name, manager_name, manager_phone)
VALUES (
  'd-001',
  'Universal Pensions Uganda — National',
  'Distributor Lead',
  '+256700000021'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- End of 0016_distributors_table.sql
-- =============================================================================
