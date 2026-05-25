-- =============================================================================
-- Universal Pensions Uganda — Phase 1, Step 1: Initial Schema
-- =============================================================================
-- Creates every table from /Users/shubhang/Desktop/plan.md "Database schema",
-- the four required ENUMs, all listed indexes, and all FKs (ON DELETE CASCADE
-- on subscriber-owned tables).
--
-- Conventions:
--   * Every primary key is TEXT (not UUID, not BIGSERIAL). Matches the
--     deterministic IDs the seed will insert (a-001, b-kam-015, s-0001,
--     r-2026-03, c-00001 …).
--   * Column names mirror src/data/mockData.js field names, snake_cased.
--   * snake_case for SQL; the service layer / Supabase JS client will
--     translate to camelCase on the frontend.
--
-- This migration intentionally creates schema only. It does NOT:
--   * define triggers (Agent 2 / 0002_rpc_functions.sql)
--   * define RPCs   (Agent 2 / Agent 5)
--   * define RLS    (Agent 4 / 0003_rls_policies.sql)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
-- pg_trgm powers the fuzzy-match search RPC defined later (Agent 2 — see
-- search_entities(q) in plan §"Read-side RPCs"). Adding here so the schema
-- migration is self-contained.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- ENUMs
-- -----------------------------------------------------------------------------
-- Defined up front so the CREATE TABLE statements below can reference them.

CREATE TYPE commission_status AS ENUM (
  'due',
  'in_run',
  'held',
  'disputed',
  'released',
  'confirmed',
  'rejected'
);

CREATE TYPE settlement_run_state AS ENUM (
  'draft',
  'branch_review',
  'released',
  'cancelled'
);

CREATE TYPE settlement_run_branch_review_state AS ENUM (
  'pending',
  'approved',
  'released'
);

CREATE TYPE nominee_type AS ENUM (
  'pension',
  'insurance'
);

-- =============================================================================
-- Reference / hierarchy tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- regions (4) — static seed
-- -----------------------------------------------------------------------------
CREATE TABLE regions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT,                       -- always 'ug' (country sentinel); kept as denorm only
  center_lng  NUMERIC,
  center_lat  NUMERIC
);

-- -----------------------------------------------------------------------------
-- districts (135) — static seed (GADM list, see src/data/mockGeo.js)
-- -----------------------------------------------------------------------------
CREATE TABLE districts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  region_id   TEXT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  center_lng  NUMERIC,
  center_lat  NUMERIC,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- -----------------------------------------------------------------------------
-- branches (~314)
-- -----------------------------------------------------------------------------
CREATE TABLE branches (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  district_id            TEXT NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  center_lng             NUMERIC,
  center_lat             NUMERIC,
  manager_name           TEXT,
  manager_phone          TEXT,
  manager_email          TEXT,
  status                 TEXT NOT NULL DEFAULT 'active',        -- 'active' | 'inactive'
  score                  NUMERIC,                               -- 0-100 health score
  rank                   INTEGER,                               -- 1 = best, global
  district_rank          INTEGER,                               -- 1 = best within district
  district_branch_count  INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- agents (~500-600)
-- -----------------------------------------------------------------------------
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  gender          TEXT,                                -- 'male' | 'female' | 'other'
  employee_id     TEXT,
  branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  center_lng      NUMERIC,
  center_lat      NUMERIC,
  phone           TEXT,
  email           TEXT,
  rating          NUMERIC,                             -- 3.0-5.0
  performance     INTEGER,                             -- 45-100
  status          TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'inactive'
  languages       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  specialties     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of strings
  tenure_months   INTEGER,
  joined_date     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Subscriber + per-subscriber tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subscribers (~30k)
-- -----------------------------------------------------------------------------
-- `is_demo_signup = true` for every prospect-created row (signup flow + agent
-- onboarding). The partial unique index on (phone) WHERE is_demo_signup = false
-- lets demo signups collide-and-overwrite without breaking seeded data.
CREATE TABLE subscribers (
  id                            TEXT PRIMARY KEY,
  name                          TEXT NOT NULL,
  email                         TEXT,
  phone                         TEXT NOT NULL,
  gender                        TEXT,                                -- 'male' | 'female' | 'other'
  age                           INTEGER,
  dob                           DATE,
  nin                           TEXT,
  occupation                    TEXT,
  agent_id                      TEXT REFERENCES agents(id) ON DELETE SET NULL,
  district_id                   TEXT REFERENCES districts(id) ON DELETE SET NULL,
  kyc_status                    TEXT NOT NULL DEFAULT 'complete',    -- 'complete' (default per CLAUDE.md rule)
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo_signup                BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_same_as_pension     BOOLEAN NOT NULL DEFAULT TRUE,
  registered_date               DATE,
  consent_at                    TIMESTAMPTZ,
  last_contribution_date        DATE,
  contribution_history          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 12-month sparkline (array<number>)
  products_held                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of product strings
  current_unit_value            NUMERIC,
  unit_value_as_of              TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- subscriber_balances — one row per subscriber, maintained by trigger
-- -----------------------------------------------------------------------------
CREATE TABLE subscriber_balances (
  subscriber_id       TEXT PRIMARY KEY
                        REFERENCES subscribers(id) ON DELETE CASCADE,
  retirement_balance  NUMERIC NOT NULL DEFAULT 0,
  emergency_balance   NUMERIC NOT NULL DEFAULT 0,
  total_balance       NUMERIC NOT NULL DEFAULT 0,
  units               NUMERIC NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- contribution_schedules — recurring contribution preferences
-- -----------------------------------------------------------------------------
-- `frequency` is a free-text TEXT column to mirror the existing schedule's
-- 'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'annually' values.
-- (The frontend normalises via normalizeFrequency() — keeping TEXT keeps room
-- for legacy aliases on the inbound side.)
CREATE TABLE contribution_schedules (
  subscriber_id          TEXT PRIMARY KEY
                           REFERENCES subscribers(id) ON DELETE CASCADE,
  frequency              TEXT NOT NULL,
  amount                 NUMERIC NOT NULL,
  retirement_pct         INTEGER NOT NULL DEFAULT 80,                  -- 0-100
  emergency_pct          INTEGER NOT NULL DEFAULT 20,                  -- 0-100; r+e = 100
  include_insurance      BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_choice_made  BOOLEAN NOT NULL DEFAULT FALSE,               -- distinguish skipped vs declined
  next_due_date          DATE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- insurance_policies — nullable per subscriber
-- -----------------------------------------------------------------------------
CREATE TABLE insurance_policies (
  subscriber_id    TEXT PRIMARY KEY
                     REFERENCES subscribers(id) ON DELETE CASCADE,
  cover            NUMERIC NOT NULL DEFAULT 0,
  premium_monthly  NUMERIC NOT NULL DEFAULT 0,
  policy_start     DATE,
  renewal_date     DATE,
  status           TEXT NOT NULL DEFAULT 'inactive',  -- 'active' | 'inactive'
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- nominees — pension + insurance beneficiaries
-- -----------------------------------------------------------------------------
CREATE TABLE nominees (
  id             TEXT PRIMARY KEY,
  subscriber_id  TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  type           nominee_type NOT NULL,                        -- 'pension' | 'insurance'
  name           TEXT NOT NULL,
  phone          TEXT,
  relationship   TEXT,                                         -- 'spouse' | 'child' | 'parent' | 'sibling' | 'other'
  nin            TEXT,
  share          NUMERIC NOT NULL CHECK (share >= 0 AND share <= 100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- transactions — append-only; trigger updates balances + commission
-- -----------------------------------------------------------------------------
-- `type` is TEXT (not an ENUM) because mockData generates four types today
-- ('contribution', 'withdrawal', 'premium', 'claim'). The plan calls out
-- contribution/withdrawal explicitly for the balance trigger; the other two
-- ride through as-is. Keeping TEXT avoids a future ENUM alter when the system
-- adds a fifth ledger type.
--
-- `split_retirement` / `split_emergency` are NULLABLE so callers can override
-- the default 80/20 split (plan.md line 108-112).
CREATE TABLE transactions (
  id                TEXT PRIMARY KEY,
  subscriber_id     TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  agent_id          TEXT REFERENCES agents(id) ON DELETE SET NULL,  -- denorm for fast agent-level queries
  type              TEXT NOT NULL,                                  -- 'contribution' | 'withdrawal' | 'premium' | 'claim'
  amount            NUMERIC NOT NULL,
  date              TIMESTAMPTZ NOT NULL,
  status            TEXT,                                           -- 'settled' | 'processing' | 'paid' …
  method            TEXT,                                           -- 'MTN Mobile Money' | 'Airtel Money' | 'Bank transfer' | 'Auto-debit'
  txn_ref           TEXT,                                           -- e.g. CT-12345, PR-54321, WD-67890, CL-13579
  bucket            TEXT,                                           -- 'retirement' | 'emergency' (only on withdrawal txns)
  split_retirement  NUMERIC,                                        -- nullable override
  split_emergency   NUMERIC,                                        -- nullable override
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- claims — per subscriber
-- -----------------------------------------------------------------------------
CREATE TABLE claims (
  id              TEXT PRIMARY KEY,
  subscriber_id   TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,                                    -- 'medical' | 'accident' | 'hospitalization' | 'critical_illness'
  status          TEXT NOT NULL,                                    -- 'submitted' | 'under_review' | 'approved' | 'paid' | 'rejected'
  amount          NUMERIC NOT NULL,
  incident_date   DATE,
  submitted_date  DATE NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- withdrawals — per subscriber
-- -----------------------------------------------------------------------------
CREATE TABLE withdrawals (
  id              TEXT PRIMARY KEY,
  subscriber_id   TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  amount          NUMERIC NOT NULL,
  bucket          TEXT NOT NULL,                                    -- 'retirement' | 'emergency'
  reason          TEXT,                                             -- 'Medical' | 'Education' | 'Housing' | 'Business' | 'Other' (free text)
  method          TEXT,                                             -- 'MTN Mobile Money' | 'Airtel Money' | 'Bank transfer'
  status          TEXT NOT NULL DEFAULT 'processing',               -- 'paid' | 'processing'
  date            DATE NOT NULL,
  reference       TEXT,                                             -- WD-xxxxx
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Commission domain
-- =============================================================================

-- -----------------------------------------------------------------------------
-- commission_config — single-row "config" table (`id = 'default'`)
-- -----------------------------------------------------------------------------
-- The id has a fixed default of 'default' and is constrained to that single
-- value so callers cannot accidentally insert a second config row.
CREATE TABLE commission_config (
  id                TEXT PRIMARY KEY DEFAULT 'default'
                       CHECK (id = 'default'),
  rate              NUMERIC NOT NULL,                              -- UGX per subscriber
  cadence           TEXT NOT NULL,                                 -- 'weekly-friday' | 'biweekly-friday' | 'monthly-first'
  next_run_date     DATE,
  last_updated_by   TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- settlement_runs — bundles many commissions paid out together
-- -----------------------------------------------------------------------------
CREATE TABLE settlement_runs (
  id                TEXT PRIMARY KEY,                              -- e.g. r-2026-03
  cadence           TEXT NOT NULL,
  opened_at         TIMESTAMPTZ NOT NULL,
  closes_at         TIMESTAMPTZ,
  state             settlement_run_state NOT NULL DEFAULT 'draft',
  total_amount      NUMERIC NOT NULL DEFAULT 0,
  commission_count  INTEGER NOT NULL DEFAULT 0,
  released_at       TIMESTAMPTZ,
  released_by       TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- settlement_run_branch_reviews — per-branch review state inside a run
-- -----------------------------------------------------------------------------
-- Composite PK (run_id, branch_id). Models the JS branchReviews map on each
-- run object today.
CREATE TABLE settlement_run_branch_reviews (
  run_id        TEXT NOT NULL REFERENCES settlement_runs(id) ON DELETE CASCADE,
  branch_id     TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  state         settlement_run_branch_review_state NOT NULL DEFAULT 'pending',
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  released_at   TIMESTAMPTZ,
  PRIMARY KEY (run_id, branch_id)
);

-- -----------------------------------------------------------------------------
-- commissions — full state-machine row
-- -----------------------------------------------------------------------------
-- branch_id is denormalised on the row for fast RLS + per-branch summaries
-- (every commission carries its agent's branch).
-- subscriber_name is denormalised for run-detail listings without a join.
CREATE TABLE commissions (
  id                         TEXT PRIMARY KEY,                     -- c-00001
  agent_id                   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  branch_id                  TEXT REFERENCES branches(id) ON DELETE SET NULL,
  subscriber_id              TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  subscriber_name            TEXT,                                 -- denorm at insert time
  amount                     NUMERIC NOT NULL,
  status                     commission_status NOT NULL DEFAULT 'due',
  first_contribution_date    DATE,
  due_date                   DATE,
  paid_date                  DATE,
  run_id                     TEXT REFERENCES settlement_runs(id) ON DELETE SET NULL,
  txn_ref                    TEXT,
  agent_confirmed            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Dispute lifecycle ------------------------------------------------------------------
  previous_status            commission_status,                    -- saved before transition to 'disputed'
  dispute_reason             TEXT,
  disputed_at                TIMESTAMPTZ,
  disputed_by                TEXT,                                 -- 'agent' | 'branch' (mockData convention)
  resolved_at                TIMESTAMPTZ,
  resolved_by                TEXT,
  outcome_reason             TEXT,
  -- Hold lifecycle ---------------------------------------------------------------------
  hold_reason                TEXT,                                 -- set when branch holds a line
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Cross-cutting / new tables (per plan §"Database schema")
-- =============================================================================

-- -----------------------------------------------------------------------------
-- agent_referrals — KYC fallback referrals (from kyc.referToAgent)
-- -----------------------------------------------------------------------------
-- See src/services/kyc.js#referToAgent and POST /api/kyc/agent-referral in
-- plan §"Backend API routes". `ticket_id` is the public-facing reference.
CREATE TABLE agent_referrals (
  id            TEXT PRIMARY KEY,                                  -- internal row ID
  ticket_id     TEXT UNIQUE NOT NULL,                              -- UAG-XXXX, surfaced to the user
  phone         TEXT NOT NULL,
  reason        TEXT NOT NULL,
  stage         TEXT,                                              -- e.g. 'nira', 'liveness'
  tracking_id   TEXT,                                              -- KYC pipeline correlation
  session_id    TEXT,                                              -- onboardingSessionId
  status        TEXT NOT NULL DEFAULT 'open',                      -- 'open' | 'in_progress' | 'resolved'
  eta           TEXT,                                              -- 'within 24 hours' …
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- contact_submissions — landing-page contact form drops here
-- -----------------------------------------------------------------------------
-- Matches src/services/contact.js#submitContactForm payload {name,email,message}.
CREATE TABLE contact_submissions (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- users — auth identities
-- -----------------------------------------------------------------------------
-- Roles seeded today: subscriber, agent, branch, distributor. Admin and
-- Employer roles are deferred per plan (frontend not yet built).
-- UNIQUE(phone, role) — NOT UNIQUE(phone) — so the same phone can attach to
-- multiple roles for demo purposes (e.g. an agent who is also a subscriber).
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  phone           TEXT NOT NULL,
  role            TEXT NOT NULL,                                   -- 'subscriber' | 'agent' | 'branch' | 'distributor' | future: 'admin' | 'employer'
  name            TEXT,
  entity_id       TEXT,                                            -- subscriber_id / agent_id / branch_id / distributor_id, per role
  email           TEXT,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_phone_role_unique UNIQUE (phone, role)
);

-- -----------------------------------------------------------------------------
-- demo_personas — phone → entity ID lookup for non-subscriber roles
-- -----------------------------------------------------------------------------
-- Seed pattern (plan.md lines 228-236):
--   +25670000001 -> agent a-001, +25670000002 -> agent a-042, …
--   +25670000011 -> branch b-kam-015, +25670000012 -> branch b-mba-290
--   +25670000021 -> distributor d-001, +25670000022 -> distributor d-002
-- 7 rows total — verified against the seed COUNT(*) assertion in the plan.
CREATE TABLE demo_personas (
  id          TEXT PRIMARY KEY,                                    -- internal row ID
  phone       TEXT NOT NULL,
  role        TEXT NOT NULL,                                       -- 'agent' | 'branch' | 'distributor'
  entity_id   TEXT NOT NULL,                                       -- string ID matching agents/branches/etc.
  label       TEXT,                                                -- internal label e.g. "Default agent (Kampala)"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demo_personas_phone_role_unique UNIQUE (phone, role)
);

-- =============================================================================
-- Indexes (plan.md §"Indexes")
-- =============================================================================

-- subscribers(agent_id) — agent-scoped subscriber lookups
CREATE INDEX IF NOT EXISTS subscribers_agent_id_idx
  ON subscribers (agent_id);

-- subscribers(phone) WHERE NOT is_demo_signup — partial UNIQUE so non-demo
-- phones are uniquely owned, while demo signups can collide-and-overwrite.
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_phone_unique_non_demo_idx
  ON subscribers (phone)
  WHERE is_demo_signup = FALSE;

-- transactions(subscriber_id, date DESC) — drives the recent-activity feed
CREATE INDEX IF NOT EXISTS transactions_subscriber_id_date_idx
  ON transactions (subscriber_id, date DESC);

-- commissions(agent_id, status)
CREATE INDEX IF NOT EXISTS commissions_agent_id_status_idx
  ON commissions (agent_id, status);

-- commissions(branch_id, status)
CREATE INDEX IF NOT EXISTS commissions_branch_id_status_idx
  ON commissions (branch_id, status);

-- commissions(run_id)
CREATE INDEX IF NOT EXISTS commissions_run_id_idx
  ON commissions (run_id);

-- settlement_run_branch_reviews(branch_id) — RLS-friendly per-branch lookups.
-- The composite PK already covers (run_id, branch_id); this is the reverse.
CREATE INDEX IF NOT EXISTS settlement_run_branch_reviews_branch_id_idx
  ON settlement_run_branch_reviews (branch_id);

-- users(phone) — login phone lookups
CREATE INDEX IF NOT EXISTS users_phone_idx
  ON users (phone);

-- demo_personas(phone, role) — JWT mint lookup
CREATE INDEX IF NOT EXISTS demo_personas_phone_role_idx
  ON demo_personas (phone, role);

-- =============================================================================
-- End of 0001_initial_schema.sql
-- Next migration files (created by other agents):
--   0002_rpc_functions.sql       — triggers + read/write RPCs (Agent 2)
--   0003_rls_policies.sql        — RLS policies (Agent 4)
--   0004_commission_run_rpcs.sql — state-machine RPCs (Agent 5)
-- =============================================================================
