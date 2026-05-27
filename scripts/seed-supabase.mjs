/**
 * Universal Pensions Uganda — Phase 1 Step 3: Supabase seed script.
 *
 * Materializes the full mockData hierarchy (regions → … → commissions →
 * settlement runs → demo personas) into a Supabase Postgres DB.
 *
 * Usage:
 *   1. Add SUPABASE_DB_URL=postgres://... to .env.local (use the connection
 *      pooler URL: aws-1-ap-northeast-1.pooler.supabase.com:6543).
 *   2. Ensure migrations 0001+ are applied to the project.
 *   3. node scripts/seed-supabase.mjs
 *
 * The script:
 *   • Wraps everything in a single transaction.
 *   • SET session_replication_role = replica so the first-contribution
 *     trigger (added in 0002) does NOT fire while seeding — otherwise the
 *     30k seeded contribution transactions would double-insert commissions.
 *   • Upserts on PK so re-runs converge.
 *   • Bulk-inserts via the unnest() pattern (one INSERT per table batch).
 *
 * Idempotent. ~2 min runtime against a pooled Supabase project.
 */

import 'dotenv/config';
import { register } from 'node:module';
import pg from 'pg';

// Register an ESM resolution hook BEFORE importing mockData. The hook
// auto-appends `.js` to extension-less relative specifiers so we can read
// the mock files unchanged (they were written for Vite's relaxed resolver).
// We then `await import(...)` mockData so the hook is live for its
// transitive imports (mockGeo / mockBranchDefs).
register('./seed-loader.mjs', import.meta.url);

const mockData = await import('../src/data/mockData.js');
const {
  REGIONS,
  BRANCHES,
  AGENTS,
  SUBSCRIBERS,
  COMMISSIONS,
  COMMISSION_CONFIG,
  SETTLEMENT_RUNS,
  DISTRICTS,
} = mockData;

const { Client } = pg;

// ─── Connection ─────────────────────────────────────────────────────────────
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error(
    'ERROR: SUPABASE_DB_URL is not set. Add it to .env.local (use the Supabase pooler URL on port 6543).'
  );
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
/**
 * Insert rows in chunks using the unnest() pattern so a single INSERT covers
 * up to CHUNK_SIZE rows at a time (round-trip count ≈ rowCount / CHUNK_SIZE).
 *
 * `columns` is an array of { name, type } objects; the SQL type is required
 * because unnest() can't infer it from an empty array. ON CONFLICT clause
 * forces idempotency.
 *
 * @param {pg.Client} client
 * @param {string} table
 * @param {Array<{name: string, type: string}>} columns
 * @param {Array<Array<any>>} rows  parallel arrays, one per column (column-major)
 * @param {string} conflictTarget  'id' or '(run_id, branch_id)' etc.
 */
async function bulkInsert(client, table, columns, rows, conflictTarget) {
  if (rows[0].length === 0) {
    return;
  }
  const CHUNK_SIZE = 2000;
  const total = rows[0].length;
  const colNames = columns.map((c) => c.name).join(', ');

  // Build the SET clause for ON CONFLICT — every column except the conflict
  // target gets `name = EXCLUDED.name`.
  const conflictCols = conflictTarget.replace(/[()]/g, '').split(',').map((s) => s.trim());
  const updateSet = columns
    .filter((c) => !conflictCols.includes(c.name))
    .map((c) => `${c.name} = EXCLUDED.${c.name}`)
    .join(', ');

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = rows.map((col) => col.slice(offset, end));

    // unnest(...) returns one row per array element across all arrays.
    const unnestArgs = columns
      .map((c, i) => `$${i + 1}::${c.type}[]`)
      .join(', ');
    const selectCols = columns.map((c) => c.name).join(', ');

    const sql =
      `INSERT INTO ${table} (${colNames})
       SELECT ${selectCols}
       FROM unnest(${unnestArgs})
         AS t(${colNames})
       ON CONFLICT (${conflictTarget}) DO UPDATE
         SET ${updateSet}`;

    await client.query(sql, chunk);
  }
}

/** Coerce a JS Date to a YYYY-MM-DD string. Pass-through if already a string. */
function toDateStr(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/** Coerce a JS Date / string to a TIMESTAMPTZ-compatible ISO string. */
function toTimestamptz(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** Approximate a DOB from age — mid-year on the birth-year boundary. */
function dobFromAge(age) {
  // MOCK_NOW reference is 2026-05-01 in mockData.
  const birthYear = 2026 - age;
  return `${birthYear}-06-15`;
}

/** Compute tenure months from joinedDate (YYYY-MM-DD) at MOCK_NOW = 2026-05-01. */
function tenureMonthsFromJoined(joinedDate, fallback) {
  if (typeof fallback === 'number') return fallback;
  if (!joinedDate) return null;
  const [y, m] = joinedDate.split('-').map(Number);
  return (2026 - y) * 12 + (5 - m);
}

// ─── Seed ───────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log('• Materializing mockData…');

  // Touching SUBSCRIBERS triggers the lazy Proxy → generates the 30k rows.
  const subscriberIds = Object.keys(SUBSCRIBERS);
  const subscribers = subscriberIds.map((id) => SUBSCRIBERS[id]);

  // mockData's random phone generator collides at 30k scale (~0.5% dupe rate).
  // The partial unique index `subscribers(phone) WHERE NOT is_demo_signup`
  // rejects duplicates. Reassign duplicates to +25671XXXXXXX (non-real UG range)
  // so they stay unique and don't collide with demo personas at +2567000000XX.
  //
  // Idempotency: pre-seed the `seen` set with every phone already on a live
  // (non-demo-signup, non-seeded-id) subscriber row in the DB so a re-run
  // against a populated DB does NOT regenerate a fresh phone that collides
  // with a different existing row's ID-keyed UPSERT. The `subscribers` UPSERT
  // keys off `id`, so phone-row mismatches across re-runs would otherwise
  // trip the partial unique index. We exclude rows whose ID IS in this seed's
  // own ID set — those will be overwritten in place by the UPSERT, so
  // including their old phone in `seen` would force a needless re-roll.
  //
  // The SELECT runs against a separate short-lived connection so the failure
  // mode of "table doesn't exist yet" (extreme first-ever seed before
  // migrations) surfaces as a clear error rather than a half-applied seed.
  const subscriberIdSet = new Set(subscriberIds);
  const preloadClient = new Client({ connectionString: DB_URL });
  await preloadClient.connect();
  let preloadedDupes = new Set();
  try {
    const { rows: existingRows } = await preloadClient.query(
      "SELECT id, phone FROM subscribers WHERE is_demo_signup = false AND phone IS NOT NULL"
    );
    for (const row of existingRows) {
      // Skip rows we own — the upcoming UPSERT will set their phone to the
      // freshly-generated value, freeing the old phone (if it differs) for
      // re-use by another row in this run.
      if (subscriberIdSet.has(row.id)) continue;
      preloadedDupes.add(row.phone);
    }
    if (preloadedDupes.size) {
      console.log(`  → ${preloadedDupes.size} existing phone(s) reserved by live (non-seed) subscribers`);
    }
  } catch (err) {
    // If the subscribers table doesn't exist or any other unexpected error
    // occurs, surface it loudly so a half-applied seed doesn't silently land.
    console.error('ERROR: failed to pre-load existing subscriber phones — has the schema been migrated?');
    await preloadClient.end();
    throw err;
  } finally {
    await preloadClient.end();
  }
  {
    const seen = new Set(preloadedDupes);
    let dupeCount = 0;
    for (const s of subscribers) {
      if (!s.phone) continue;
      if (seen.has(s.phone)) {
        dupeCount += 1;
        // Re-roll into the +25671XXXXXXX synthetic range, padding far enough
        // not to collide with the demo persona block (+2567000000XX) or with
        // the live `+256711…` demo subscribers (`…000001`-`…000005`).
        let attempt = dupeCount;
        let candidate = `+25671${String(attempt).padStart(7, '0')}`;
        while (seen.has(candidate)) {
          attempt += 1;
          candidate = `+25671${String(attempt).padStart(7, '0')}`;
        }
        s.phone = candidate;
        dupeCount = attempt;
      }
      seen.add(s.phone);
    }
    if (dupeCount) console.log(`  → reassigned ${dupeCount} duplicate phones to +25671XXXXXXX range`);
  }
  const branches = Object.values(BRANCHES);
  const agents = Object.values(AGENTS);
  const districts = Object.values(DISTRICTS);
  const regions = Object.values(REGIONS);
  const commissions = Object.values(COMMISSIONS);
  const runs = Object.values(SETTLEMENT_RUNS);

  console.log(
    `  regions=${regions.length} districts=${districts.length} branches=${branches.length} ` +
      `agents=${agents.length} subscribers=${subscribers.length} commissions=${commissions.length}`
  );

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Disable triggers (commission auto-creation + balance recalc) so the
    //    seed can insert raw rows without double-firing them. CRITICAL.
    await client.query("SET session_replication_role = 'replica'");

    // ── regions ────────────────────────────────────────────────────────────
    console.log('• regions…');
    await bulkInsert(
      client,
      'regions',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'parent_id', type: 'text' },
        { name: 'center_lng', type: 'numeric' },
        { name: 'center_lat', type: 'numeric' },
      ],
      [
        regions.map((r) => r.id),
        regions.map((r) => r.name),
        regions.map((r) => r.parentId ?? 'ug'),
        regions.map((r) => r.center?.[0] ?? null),
        regions.map((r) => r.center?.[1] ?? null),
      ],
      'id'
    );

    // ── districts ──────────────────────────────────────────────────────────
    console.log('• districts…');
    await bulkInsert(
      client,
      'districts',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'region_id', type: 'text' },
        { name: 'center_lng', type: 'numeric' },
        { name: 'center_lat', type: 'numeric' },
        { name: 'active', type: 'boolean' },
      ],
      [
        districts.map((d) => d.id),
        districts.map((d) => d.name),
        districts.map((d) => d.parentId),
        districts.map((d) => d.center?.[0] ?? null),
        districts.map((d) => d.center?.[1] ?? null),
        districts.map((d) => d.active !== false),
      ],
      'id'
    );

    // ── branches ───────────────────────────────────────────────────────────
    console.log('• branches…');
    await bulkInsert(
      client,
      'branches',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'district_id', type: 'text' },
        { name: 'center_lng', type: 'numeric' },
        { name: 'center_lat', type: 'numeric' },
        { name: 'manager_name', type: 'text' },
        { name: 'manager_phone', type: 'text' },
        { name: 'manager_email', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'score', type: 'numeric' },
        { name: 'rank', type: 'integer' },
        { name: 'district_rank', type: 'integer' },
        { name: 'district_branch_count', type: 'integer' },
      ],
      [
        branches.map((b) => b.id),
        branches.map((b) => b.name),
        branches.map((b) => b.parentId),
        branches.map((b) => b.center?.[0] ?? null),
        branches.map((b) => b.center?.[1] ?? null),
        branches.map((b) => b.managerName ?? null),
        branches.map((b) => b.managerPhone ?? null),
        branches.map((b) => b.managerEmail ?? null),
        branches.map((b) => b.status ?? 'active'),
        branches.map((b) => b.score ?? null),
        branches.map((b) => b.rank ?? null),
        branches.map((b) => b.districtRank ?? null),
        branches.map((b) => b.districtBranchCount ?? null),
      ],
      'id'
    );

    // ── agents ─────────────────────────────────────────────────────────────
    console.log('• agents…');
    await bulkInsert(
      client,
      'agents',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'gender', type: 'text' },
        { name: 'employee_id', type: 'text' },
        { name: 'branch_id', type: 'text' },
        { name: 'center_lng', type: 'numeric' },
        { name: 'center_lat', type: 'numeric' },
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'rating', type: 'numeric' },
        { name: 'performance', type: 'integer' },
        { name: 'status', type: 'text' },
        { name: 'languages', type: 'jsonb' },
        { name: 'specialties', type: 'jsonb' },
        { name: 'tenure_months', type: 'integer' },
        { name: 'joined_date', type: 'date' },
      ],
      [
        agents.map((a) => a.id),
        agents.map((a) => a.name),
        agents.map((a) => a.gender ?? null),
        agents.map((a) => a.employeeId ?? null),
        agents.map((a) => a.parentId),
        agents.map((a) => a.center?.[0] ?? null),
        agents.map((a) => a.center?.[1] ?? null),
        agents.map((a) => a.phone ?? null),
        agents.map((a) => a.email ?? null),
        agents.map((a) => a.rating ?? null),
        agents.map((a) => a.performance ?? null),
        agents.map((a) => a.status ?? 'active'),
        agents.map((a) => JSON.stringify(a.languages ?? [])),
        agents.map((a) => JSON.stringify(a.specialties ?? [])),
        agents.map((a) => tenureMonthsFromJoined(a.joinedDate, a.tenureMonths)),
        agents.map((a) => a.joinedDate ?? null),
      ],
      'id'
    );

    // ── subscribers ────────────────────────────────────────────────────────
    console.log('• subscribers…');
    // Build district lookup: agentId → districtId (via branch.parentId)
    const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
    const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));
    const subscriberDistrict = (s) => {
      const agent = agentById[s.parentId];
      if (!agent) return null;
      const branch = branchById[agent.parentId];
      return branch?.parentId ?? null;
    };

    await bulkInsert(
      client,
      'subscribers',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'gender', type: 'text' },
        { name: 'age', type: 'integer' },
        { name: 'dob', type: 'date' },
        { name: 'nin', type: 'text' },
        { name: 'occupation', type: 'text' },
        { name: 'agent_id', type: 'text' },
        { name: 'district_id', type: 'text' },
        { name: 'kyc_status', type: 'text' },
        { name: 'is_active', type: 'boolean' },
        { name: 'is_demo_signup', type: 'boolean' },
        { name: 'insurance_same_as_pension', type: 'boolean' },
        { name: 'registered_date', type: 'date' },
        { name: 'last_contribution_date', type: 'date' },
        { name: 'contribution_history', type: 'jsonb' },
        { name: 'products_held', type: 'jsonb' },
        { name: 'current_unit_value', type: 'numeric' },
        { name: 'unit_value_as_of', type: 'timestamptz' },
      ],
      [
        subscribers.map((s) => s.id),
        subscribers.map((s) => s.name),
        subscribers.map((s) => s.email ?? null),
        subscribers.map((s) => s.phone),
        subscribers.map((s) => s.gender ?? null),
        subscribers.map((s) => s.age ?? null),
        subscribers.map((s) => (s.age ? dobFromAge(s.age) : null)),
        // mockData doesn't carry a NIN per subscriber — leave null; signup
        // adds it via createFromSignup.
        subscribers.map(() => null),
        subscribers.map(() => null),
        subscribers.map((s) => s.parentId),
        subscribers.map((s) => subscriberDistrict(s)),
        subscribers.map((s) => s.kycStatus ?? 'complete'),
        subscribers.map((s) => Boolean(s.isActive)),
        // Every seeded subscriber is real demo data — `is_demo_signup=false`
        // so the partial unique index treats their phone numbers as owned.
        subscribers.map(() => false),
        // mockData stores `nominees.pension/insurance` separately; the seed
        // can't always tell whether they intentionally match. We mark all as
        // same-as-pension and the signup flow overrides explicitly per row.
        subscribers.map(() => true),
        subscribers.map((s) => s.registeredDate ?? null),
        // Last contribution: pick the most recent contribution date in tx
        // history, else null.
        subscribers.map((s) => {
          const tx = (s.transactions || []).filter((t) => t.type === 'contribution');
          if (!tx.length) return null;
          // transactions are sorted desc by date already; first hit wins.
          return tx[0].date;
        }),
        subscribers.map((s) => JSON.stringify(s.contributionHistory ?? [])),
        subscribers.map((s) => JSON.stringify(s.productsHeld ?? [])),
        subscribers.map((s) => s.currentUnitValue ?? null),
        subscribers.map((s) => toTimestamptz(s.unitValueAsOf)),
      ],
      'id'
    );

    // ── subscriber_balances ────────────────────────────────────────────────
    console.log('• subscriber_balances…');
    await bulkInsert(
      client,
      'subscriber_balances',
      [
        { name: 'subscriber_id', type: 'text' },
        { name: 'retirement_balance', type: 'numeric' },
        { name: 'emergency_balance', type: 'numeric' },
        { name: 'total_balance', type: 'numeric' },
        { name: 'units', type: 'numeric' },
      ],
      [
        subscribers.map((s) => s.id),
        subscribers.map((s) => s.retirementBalance ?? 0),
        subscribers.map((s) => s.emergencyBalance ?? 0),
        subscribers.map((s) => s.netBalance ?? 0),
        subscribers.map((s) => s.unitsHeld ?? 0),
      ],
      'subscriber_id'
    );

    // ── contribution_schedules ─────────────────────────────────────────────
    console.log('• contribution_schedules…');
    await bulkInsert(
      client,
      'contribution_schedules',
      [
        { name: 'subscriber_id', type: 'text' },
        { name: 'frequency', type: 'text' },
        { name: 'amount', type: 'numeric' },
        { name: 'retirement_pct', type: 'integer' },
        { name: 'emergency_pct', type: 'integer' },
        { name: 'include_insurance', type: 'boolean' },
        { name: 'insurance_choice_made', type: 'boolean' },
        { name: 'next_due_date', type: 'date' },
      ],
      [
        subscribers.map((s) => s.id),
        subscribers.map((s) => s.contributionSchedule?.frequency ?? 'monthly'),
        subscribers.map((s) => s.contributionSchedule?.amount ?? 0),
        subscribers.map((s) => s.contributionSchedule?.retirementPct ?? 80),
        subscribers.map((s) => s.contributionSchedule?.emergencyPct ?? 20),
        subscribers.map((s) => Boolean(s.contributionSchedule?.includeInsurance)),
        // mockData doesn't track this; treat the seed as a definitive choice
        // (true) so the dashboard doesn't badge every seeded subscriber as
        // "decision pending".
        subscribers.map(() => true),
        subscribers.map((s) => s.contributionSchedule?.nextDueDate ?? null),
      ],
      'subscriber_id'
    );

    // ── insurance_policies (only for subscribers with cover > 0) ───────────
    console.log('• insurance_policies…');
    const insureds = subscribers.filter((s) => s.insurance?.cover > 0);
    await bulkInsert(
      client,
      'insurance_policies',
      [
        { name: 'subscriber_id', type: 'text' },
        { name: 'cover', type: 'numeric' },
        { name: 'premium_monthly', type: 'numeric' },
        { name: 'policy_start', type: 'date' },
        { name: 'renewal_date', type: 'date' },
        { name: 'status', type: 'text' },
      ],
      [
        insureds.map((s) => s.id),
        insureds.map((s) => s.insurance.cover),
        insureds.map((s) => s.insurance.premiumMonthly ?? 0),
        insureds.map((s) => s.insurance.policyStart ?? null),
        insureds.map((s) => s.insurance.renewalDate ?? null),
        insureds.map((s) => s.insurance.status ?? 'active'),
      ],
      'subscriber_id'
    );

    // ── nominees ───────────────────────────────────────────────────────────
    console.log('• nominees…');
    const nomineeIds = [];
    const nomineeSubIds = [];
    const nomineeTypes = [];
    const nomineeNames = [];
    const nomineePhones = [];
    const nomineeRels = [];
    const nomineeNins = [];
    const nomineeShares = [];
    for (const s of subscribers) {
      for (const n of s.nominees?.pension ?? []) {
        nomineeIds.push(n.id);
        nomineeSubIds.push(s.id);
        nomineeTypes.push('pension');
        nomineeNames.push(n.name);
        nomineePhones.push(n.phone ?? null);
        nomineeRels.push(n.relationship ?? null);
        nomineeNins.push(n.nin ?? null);
        nomineeShares.push(n.share);
      }
      for (const n of s.nominees?.insurance ?? []) {
        nomineeIds.push(n.id);
        nomineeSubIds.push(s.id);
        nomineeTypes.push('insurance');
        nomineeNames.push(n.name);
        nomineePhones.push(n.phone ?? null);
        nomineeRels.push(n.relationship ?? null);
        nomineeNins.push(n.nin ?? null);
        nomineeShares.push(n.share);
      }
    }
    await bulkInsert(
      client,
      'nominees',
      [
        { name: 'id', type: 'text' },
        { name: 'subscriber_id', type: 'text' },
        { name: 'type', type: 'nominee_type' },
        { name: 'name', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'relationship', type: 'text' },
        { name: 'nin', type: 'text' },
        { name: 'share', type: 'numeric' },
      ],
      [
        nomineeIds,
        nomineeSubIds,
        nomineeTypes,
        nomineeNames,
        nomineePhones,
        nomineeRels,
        nomineeNins,
        nomineeShares,
      ],
      'id'
    );

    // ── transactions (12-month contribution + premium + withdrawal + claim) ─
    console.log('• transactions…');
    const txIds = [];
    const txSubIds = [];
    const txAgentIds = [];
    const txTypes = [];
    const txAmounts = [];
    const txDates = [];
    const txStatuses = [];
    const txMethods = [];
    const txRefs = [];
    const txBuckets = [];
    for (const s of subscribers) {
      for (const t of s.transactions ?? []) {
        txIds.push(t.id);
        txSubIds.push(s.id);
        txAgentIds.push(s.parentId);
        txTypes.push(t.type);
        // mockData stores withdrawals as negative amounts already; preserve.
        txAmounts.push(t.amount);
        txDates.push(toTimestamptz(t.date));
        txStatuses.push(t.status ?? null);
        txMethods.push(t.method ?? null);
        // The mock field is `reference`; the schema column is `txn_ref`.
        txRefs.push(t.reference ?? null);
        txBuckets.push(t.bucket ?? null);
      }
    }
    await bulkInsert(
      client,
      'transactions',
      [
        { name: 'id', type: 'text' },
        { name: 'subscriber_id', type: 'text' },
        { name: 'agent_id', type: 'text' },
        { name: 'type', type: 'text' },
        { name: 'amount', type: 'numeric' },
        { name: 'date', type: 'timestamptz' },
        { name: 'status', type: 'text' },
        { name: 'method', type: 'text' },
        { name: 'txn_ref', type: 'text' },
        { name: 'bucket', type: 'text' },
      ],
      [
        txIds,
        txSubIds,
        txAgentIds,
        txTypes,
        txAmounts,
        txDates,
        txStatuses,
        txMethods,
        txRefs,
        txBuckets,
      ],
      'id'
    );

    // ── claims ─────────────────────────────────────────────────────────────
    console.log('• claims…');
    const claimIds = [];
    const claimSubIds = [];
    const claimTypes = [];
    const claimStatuses = [];
    const claimAmounts = [];
    const claimIncident = [];
    const claimSubmitted = [];
    const claimDescriptions = [];
    for (const s of subscribers) {
      for (const c of s.claims ?? []) {
        claimIds.push(c.id);
        claimSubIds.push(s.id);
        claimTypes.push(c.type);
        claimStatuses.push(c.status);
        claimAmounts.push(c.amount);
        claimIncident.push(c.incidentDate ?? null);
        claimSubmitted.push(c.submittedDate);
        claimDescriptions.push(c.description ?? null);
      }
    }
    await bulkInsert(
      client,
      'claims',
      [
        { name: 'id', type: 'text' },
        { name: 'subscriber_id', type: 'text' },
        { name: 'type', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'amount', type: 'numeric' },
        { name: 'incident_date', type: 'date' },
        { name: 'submitted_date', type: 'date' },
        { name: 'description', type: 'text' },
      ],
      [
        claimIds,
        claimSubIds,
        claimTypes,
        claimStatuses,
        claimAmounts,
        claimIncident,
        claimSubmitted,
        claimDescriptions,
      ],
      'id'
    );

    // ── withdrawals ────────────────────────────────────────────────────────
    console.log('• withdrawals…');
    const wIds = [];
    const wSubIds = [];
    const wAmounts = [];
    const wBuckets = [];
    const wReasons = [];
    const wMethods = [];
    const wStatuses = [];
    const wDates = [];
    const wReferences = [];
    for (const s of subscribers) {
      for (const w of s.withdrawals ?? []) {
        wIds.push(w.id);
        wSubIds.push(s.id);
        wAmounts.push(w.amount);
        wBuckets.push(w.bucket);
        wReasons.push(w.reason ?? null);
        wMethods.push(w.method ?? null);
        wStatuses.push(w.status ?? 'processing');
        wDates.push(w.date);
        // mockData doesn't surface a separate reference on withdrawals; the
        // matching transaction row carries one (`WD-…`). Leave null here.
        wReferences.push(null);
      }
    }
    await bulkInsert(
      client,
      'withdrawals',
      [
        { name: 'id', type: 'text' },
        { name: 'subscriber_id', type: 'text' },
        { name: 'amount', type: 'numeric' },
        { name: 'bucket', type: 'text' },
        { name: 'reason', type: 'text' },
        { name: 'method', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'date', type: 'date' },
        { name: 'reference', type: 'text' },
      ],
      [
        wIds,
        wSubIds,
        wAmounts,
        wBuckets,
        wReasons,
        wMethods,
        wStatuses,
        wDates,
        wReferences,
      ],
      'id'
    );

    // ── commission_config (singleton) ──────────────────────────────────────
    console.log('• commission_config…');
    await client.query(
      `INSERT INTO commission_config (id, rate, cadence, next_run_date, last_updated_by)
       VALUES ('default', $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET rate = EXCLUDED.rate,
             cadence = EXCLUDED.cadence,
             next_run_date = EXCLUDED.next_run_date,
             last_updated_by = EXCLUDED.last_updated_by,
             updated_at = now()`,
      [
        COMMISSION_CONFIG.ratePerSubscriber,
        COMMISSION_CONFIG.cadence,
        COMMISSION_CONFIG.nextRunDate ?? null,
        'seed',
      ]
    );

    // ── settlement_runs (parents of commissions.run_id FK) ─────────────────
    console.log('• settlement_runs…');
    await bulkInsert(
      client,
      'settlement_runs',
      [
        { name: 'id', type: 'text' },
        { name: 'cadence', type: 'text' },
        { name: 'opened_at', type: 'timestamptz' },
        { name: 'closes_at', type: 'timestamptz' },
        { name: 'state', type: 'settlement_run_state' },
        { name: 'total_amount', type: 'numeric' },
        { name: 'commission_count', type: 'integer' },
        { name: 'released_at', type: 'timestamptz' },
        { name: 'released_by', type: 'text' },
        { name: 'notes', type: 'text' },
      ],
      [
        runs.map((r) => r.id),
        runs.map((r) => r.cadence),
        runs.map((r) => toTimestamptz(r.openedAt)),
        runs.map((r) => toTimestamptz(r.closesAt)),
        runs.map((r) => r.state),
        runs.map((r) => r.totalAmount ?? 0),
        runs.map((r) => r.commissionCount ?? 0),
        runs.map((r) => toTimestamptz(r.releasedAt)),
        runs.map((r) => r.releasedBy ?? null),
        runs.map((r) => r.notes ?? null),
      ],
      'id'
    );

    // ── commissions ────────────────────────────────────────────────────────
    // For the released run (r-2026-03): commissions in the 'confirmed',
    // 'released', or 'disputed' (post-payment) state must carry paid_date +
    // txn_ref so getRunBranchBreakdown.releasedAmount adds up.
    console.log('• commissions…');
    await bulkInsert(
      client,
      'commissions',
      [
        { name: 'id', type: 'text' },
        { name: 'agent_id', type: 'text' },
        { name: 'branch_id', type: 'text' },
        { name: 'subscriber_id', type: 'text' },
        { name: 'subscriber_name', type: 'text' },
        { name: 'amount', type: 'numeric' },
        { name: 'status', type: 'commission_status' },
        { name: 'first_contribution_date', type: 'date' },
        { name: 'due_date', type: 'date' },
        { name: 'paid_date', type: 'date' },
        { name: 'run_id', type: 'text' },
        { name: 'txn_ref', type: 'text' },
        { name: 'previous_status', type: 'commission_status' },
        { name: 'dispute_reason', type: 'text' },
        { name: 'disputed_at', type: 'timestamptz' },
        { name: 'disputed_by', type: 'text' },
        { name: 'hold_reason', type: 'text' },
      ],
      [
        commissions.map((c) => c.id),
        commissions.map((c) => c.agentId),
        commissions.map((c) => c.branchId ?? null),
        commissions.map((c) => c.subscriberId),
        commissions.map((c) => c.subscriberName ?? null),
        commissions.map((c) => c.amount),
        commissions.map((c) => c.status),
        commissions.map((c) => c.firstContributionDate ?? null),
        commissions.map((c) => c.dueDate ?? null),
        commissions.map((c) => c.paidDate ?? null),
        commissions.map((c) => c.runId ?? null),
        commissions.map((c) => c.txnRef ?? null),
        commissions.map((c) => c.previousStatus ?? null),
        commissions.map((c) => c.disputeReason ?? null),
        commissions.map((c) => toTimestamptz(c.disputedAt)),
        commissions.map((c) => c.disputedBy ?? null),
        commissions.map((c) => c.holdReason ?? null),
      ],
      'id'
    );

    // ── settlement_run_branch_reviews ──────────────────────────────────────
    console.log('• settlement_run_branch_reviews…');
    const reviewRunIds = [];
    const reviewBranchIds = [];
    const reviewStates = [];
    const reviewBy = [];
    const reviewAt = [];
    const reviewReleasedAt = [];
    for (const r of runs) {
      for (const [bid, review] of Object.entries(r.branchReviews ?? {})) {
        reviewRunIds.push(r.id);
        reviewBranchIds.push(bid);
        // mockData 'approved' maps to ENUM 'approved'; if the run is released,
        // promote per-branch state to 'released' so query-side filtering
        // (released runs show as fully closed out) lines up.
        let state = review.state;
        if (r.state === 'released' && state === 'approved') state = 'released';
        reviewStates.push(state);
        reviewBy.push(review.reviewedBy ?? null);
        reviewAt.push(toTimestamptz(review.reviewedAt));
        reviewReleasedAt.push(r.state === 'released' ? toTimestamptz(r.releasedAt) : null);
      }
    }
    await bulkInsert(
      client,
      'settlement_run_branch_reviews',
      [
        { name: 'run_id', type: 'text' },
        { name: 'branch_id', type: 'text' },
        { name: 'state', type: 'settlement_run_branch_review_state' },
        { name: 'reviewed_by', type: 'text' },
        { name: 'reviewed_at', type: 'timestamptz' },
        { name: 'released_at', type: 'timestamptz' },
      ],
      [reviewRunIds, reviewBranchIds, reviewStates, reviewBy, reviewAt, reviewReleasedAt],
      'run_id, branch_id'
    );

    // ── distributors ───────────────────────────────────────────────────────
    // Singleton-friendly catalogue table (created in migration 0016). The
    // demo seeds `d-001` (the default fallback for distributor logins) and
    // `d-002` (the secondary distributor referenced by the second persona
    // row below). Re-runs upsert on PK so changes to manager_* contact
    // details persist while the table stays converged.
    console.log('• distributors…');
    const distributorRows = [
      {
        id: 'd-001',
        name: 'Universal Pensions Uganda — National',
        manager_name: 'Distributor Lead',
        manager_phone: '+256700000021',
        manager_email: null,
      },
      {
        id: 'd-002',
        name: 'Universal Pensions Uganda — Secondary',
        manager_name: 'Secondary Distributor Lead',
        manager_phone: '+256700000022',
        manager_email: null,
      },
    ];
    await bulkInsert(
      client,
      'distributors',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'parent_id', type: 'text' },
        { name: 'manager_name', type: 'text' },
        { name: 'manager_phone', type: 'text' },
        { name: 'manager_email', type: 'text' },
        { name: 'status', type: 'text' },
      ],
      [
        distributorRows.map((d) => d.id),
        distributorRows.map((d) => d.name),
        distributorRows.map(() => 'ug'),
        distributorRows.map((d) => d.manager_name),
        distributorRows.map((d) => d.manager_phone),
        distributorRows.map((d) => d.manager_email),
        distributorRows.map(() => 'active'),
      ],
      'id'
    );

    // ── demo_personas ──────────────────────────────────────────────────────
    // 3 agents, 2 branches, 2 distributors. Distributor entity IDs (d-001,
    // d-002) now have a backing row in `distributors` (seeded just above,
    // landed by migration 0016). demo_personas keeps doing JWT-mint lookups.
    console.log('• demo_personas…');
    const personas = [
      { id: 'dp-a-001', phone: '+256700000001', role: 'agent', entity_id: 'a-001', label: 'Default agent (Kampala)' },
      { id: 'dp-a-002', phone: '+256700000002', role: 'agent', entity_id: 'a-042', label: 'Northern region agent' },
      { id: 'dp-a-003', phone: '+256700000003', role: 'agent', entity_id: 'a-118', label: 'Western region agent' },
      { id: 'dp-b-001', phone: '+256700000011', role: 'branch', entity_id: 'b-kam-015', label: 'Default branch (Kampala Central)' },
      { id: 'dp-b-002', phone: '+256700000012', role: 'branch', entity_id: 'b-mba-290', label: 'Mbarara branch' },
      { id: 'dp-d-001', phone: '+256700000021', role: 'distributor', entity_id: 'd-001', label: 'Default distributor' },
      { id: 'dp-d-002', phone: '+256700000022', role: 'distributor', entity_id: 'd-002', label: 'Secondary distributor' },
    ];
    await bulkInsert(
      client,
      'demo_personas',
      [
        { name: 'id', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'role', type: 'text' },
        { name: 'entity_id', type: 'text' },
        { name: 'label', type: 'text' },
      ],
      [
        personas.map((p) => p.id),
        personas.map((p) => p.phone),
        personas.map((p) => p.role),
        personas.map((p) => p.entity_id),
        personas.map((p) => p.label),
      ],
      'id'
    );

    // ── users (auth identities) ────────────────────────────────────────────
    // Seed a `users` row per demo persona with `password_hash = NULL` so the
    // first sign-in via `/api/auth/verify-otp` stamps a hash on the existing
    // row (the OTP path stays available until the user opts into a password).
    // The `id` follows `verify-otp.ts`'s deterministic `${role}:${phone}` shape
    // so re-running the seed is idempotent against an OTP-initiated upsert.
    // We mirror the persona list 1:1 here — the same five phones (agent,
    // branch, distributor) gain a `users` row; the subscriber pseudo-personas
    // (`s-0001`…`s-0005`) are NOT in `demo_personas` because subscriber lookup
    // routes through `users(phone, role='subscriber')` directly, so we also
    // seed those five subscriber rows so the demo phones land authenticated
    // on first OTP without a missing-user fallback.
    console.log('• users…');
    const userRows = [
      // Agent / branch / distributor personas — mirror `demo_personas` above.
      ...personas.map((p) => ({
        id: `${p.role}:${p.phone}`,
        phone: p.phone,
        role: p.role,
        // Friendly label as a fallback display name until verify-otp updates.
        name: p.label,
        entity_id: p.entity_id,
      })),
      // Subscriber demo phones (5 seeded subscribers — see CLAUDE.md §8).
      // The entity IDs match the first 5 lazy-generated subscriber rows so
      // the JWT issued by verify-otp carries the same `subscriberId` claim
      // every time. If those IDs drift, verify-otp falls back via
      // `users` lookup → `subscribers` lookup, so the demo still works.
      { id: 'subscriber:+256711000001', phone: '+256711000001', role: 'subscriber', name: 'Demo subscriber 1', entity_id: 's-0001' },
      { id: 'subscriber:+256711000002', phone: '+256711000002', role: 'subscriber', name: 'Demo subscriber 2', entity_id: 's-0002' },
      { id: 'subscriber:+256711000003', phone: '+256711000003', role: 'subscriber', name: 'Demo subscriber 3', entity_id: 's-0003' },
      { id: 'subscriber:+256711000004', phone: '+256711000004', role: 'subscriber', name: 'Demo subscriber 4', entity_id: 's-0004' },
      { id: 'subscriber:+256711000005', phone: '+256711000005', role: 'subscriber', name: 'Demo subscriber 5', entity_id: 's-0005' },
    ];
    await bulkInsert(
      client,
      'users',
      [
        { name: 'id', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'role', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'entity_id', type: 'text' },
        { name: 'password_hash', type: 'text' },
      ],
      [
        userRows.map((u) => u.id),
        userRows.map((u) => u.phone),
        userRows.map((u) => u.role),
        userRows.map((u) => u.name),
        userRows.map((u) => u.entity_id),
        // NULL hash — verify-otp will stamp a bcrypt digest on first sign-in
        // if/when the user sets a password (the OTP path stays primary).
        userRows.map(() => null),
      ],
      'id'
    );

    // 5. Re-enable triggers BEFORE commit. Any post-seed write — by the
    //    application — must go through the normal trigger machinery.
    await client.query("SET session_replication_role = 'origin'");
    await client.query('COMMIT');

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✓ Seed complete in ${elapsed}s.`);
    console.log(
      `Subscribers: ~${subscribers.length}, Agents: ~${agents.length}, ` +
        `Branches: ~${branches.length}, Commissions: ~${commissions.length}, ` +
        `Runs: ${runs.length}, Personas: ${personas.length}`
    );
  } catch (err) {
    console.error('\n✗ Seed failed — rolling back:', err.message);
    try {
      await client.query("SET session_replication_role = 'origin'");
    } catch {}
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
