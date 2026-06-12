// ============================================================================
// One-off: seed VIABLE employer-channel activity (emp-001 / Nile Breweries) so
// the admin Platform Overview "Employers" scope Today/Week/Month trends strip
// (new members / contributions / withdrawals / Top Employer, RPC 0059) shows
// real, non-zero movement. SCOPED + idempotent — touches ONLY emp-001's members
// and their transactions; never truncates or reseeds anything else.
//
// Run:  npx dotenv -e .env.local -- node scripts/oneoffs/seed-employer-activity.mjs
// Needs SUPABASE_DB_URL (the Supabase pooler connection string) in the env.
//
// What it does (all anchored on public._demo_now() = 2026-05-18 via the seed's
// MOCK_NOW-relative dates):
//   1. Upserts 5 recent-hire members (empe-017..021) + their balances / schedules
//      / insurance — drives the "New Members" today/week/month trend.
//   2. Upserts ALL emp-001 member transactions (MEMBER_TRANSACTIONS) — the
//      contribution history is now sampled at days [8,12,21,41,72] (was [25,55,85])
//      so today/this-week/this-month light up, plus 4 withdrawals.
//
// SAFETY: runs in ONE transaction with session_replication_role='replica' (the
// same mode the main seed uses) so the upserted contribution rows do NOT re-bump
// the directly-authored subscriber_balances (balances are a lifetime snapshot;
// transactions are an independent recent-activity sample — the platform reads AUM
// from balances and flows from transactions independently). Idempotent: every
// write is ON CONFLICT DO UPDATE / DO NOTHING with deterministic ids, so re-runs
// converge. In-transaction assertions verify the result and roll back on failure.
// Kept under scripts/oneoffs/ — not wired into any npm script or CI.

import pg from 'pg';
import { MEMBERS, MEMBER_TRANSACTIONS } from '../../src/data/employerSeed.js';

const { Client } = pg;

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('ERROR: SUPABASE_DB_URL is not set. Run via: npx dotenv -e .env.local -- node scripts/oneoffs/seed-employer-activity.mjs');
  process.exit(1);
}

const RECENT_HIRES = MEMBERS.filter((m) => m.recentHire);

const client = new Client({ connectionString: DB_URL });

try {
  await client.connect();
  console.log('Connected.');
  await client.query('BEGIN');
  // Triggers OFF — upserting contribution rows must NOT re-bump the directly-
  // authored balances (matches scripts/seed-supabase.mjs).
  await client.query("SET session_replication_role = 'replica'");

  // ── 1) Recent-hire members (subscribers + balances + schedules + insurance) ──
  console.log(`• recent-hire members (${RECENT_HIRES.length})…`);
  for (const m of RECENT_HIRES) {
    await client.query(
      `INSERT INTO subscribers (
         id, name, email, phone, gender, age, dob, nin, kyc_status, occupation,
         agent_id, employer_id, district_id, is_active, registered_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
         gender=EXCLUDED.gender, age=EXCLUDED.age, dob=EXCLUDED.dob, nin=EXCLUDED.nin,
         kyc_status=EXCLUDED.kyc_status, occupation=EXCLUDED.occupation,
         employer_id=EXCLUDED.employer_id, district_id=EXCLUDED.district_id,
         is_active=EXCLUDED.is_active, registered_date=EXCLUDED.registered_date`,
      [
        m.id, m.name, m.email ?? null, m.phone ?? null, m.gender ?? null, m.age ?? null,
        m.dob ?? null, m.nin ?? null, m.kycStatus ?? 'complete', m.occupation ?? null,
        null, m.employerId, m.districtId ?? 'd-kampala', m.status !== 'suspended', m.joinedDate ?? null,
      ],
    );
    await client.query(
      `INSERT INTO subscriber_balances (subscriber_id, retirement_balance, emergency_balance, total_balance, units)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (subscriber_id) DO UPDATE SET
         retirement_balance=EXCLUDED.retirement_balance, emergency_balance=EXCLUDED.emergency_balance,
         total_balance=EXCLUDED.total_balance, units=EXCLUDED.units`,
      [m.id, m.retirementBalance ?? 0, m.emergencyBalance ?? 0, m.netBalance ?? 0, m.unitsHeld ?? 0],
    );
    await client.query(
      `INSERT INTO contribution_schedules (subscriber_id, frequency, amount, retirement_pct, emergency_pct)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (subscriber_id) DO UPDATE SET
         frequency=EXCLUDED.frequency, amount=EXCLUDED.amount,
         retirement_pct=EXCLUDED.retirement_pct, emergency_pct=EXCLUDED.emergency_pct`,
      [
        m.id, m.contributionSchedule?.frequency ?? 'monthly',
        m.contributionSchedule?.amount ?? m.monthlyContribution ?? 0,
        m.contributionSchedule?.retirementPct ?? 80, m.contributionSchedule?.emergencyPct ?? 20,
      ],
    );
    if ((m.insuranceCover ?? 0) > 0) {
      await client.query(
        `INSERT INTO insurance_policies (subscriber_id, cover, premium_monthly, status, renewal_date)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (subscriber_id) DO UPDATE SET
           cover=EXCLUDED.cover, premium_monthly=EXCLUDED.premium_monthly,
           status=EXCLUDED.status, renewal_date=EXCLUDED.renewal_date`,
        [m.id, m.insuranceCover ?? 0, m.insurancePremiumMonthly ?? 0, m.insuranceStatus ?? 'inactive', m.insuranceRenewalDate ?? null],
      );
    }
  }

  // ── 2) Member transactions (re-sampled contributions + withdrawals) ──────────
  // Upsert by deterministic id: existing rows (t-own/-emp-…-1..3) get the new
  // dates; -4/-5 + the t-wd-… withdrawals are inserts. No orphans (old ids ⊂ new).
  console.log(`• member transactions (${MEMBER_TRANSACTIONS.length})…`);
  for (const t of MEMBER_TRANSACTIONS) {
    await client.query(
      `INSERT INTO transactions (
         id, subscriber_id, type, source, amount, date, status, method,
         split_retirement, split_emergency, contribution_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         subscriber_id=EXCLUDED.subscriber_id, type=EXCLUDED.type, source=EXCLUDED.source,
         amount=EXCLUDED.amount, date=EXCLUDED.date, status=EXCLUDED.status, method=EXCLUDED.method,
         split_retirement=EXCLUDED.split_retirement, split_emergency=EXCLUDED.split_emergency,
         contribution_run_id=EXCLUDED.contribution_run_id`,
      [
        t.id, t.subscriberId, t.type ?? 'contribution', t.source ?? 'own', t.amount ?? 0,
        t.date, 'settled', t.method ?? null, t.retirementAmount ?? null, t.emergencyAmount ?? null,
        t.contributionRunId ?? null,
      ],
    );
  }

  // ── 3) In-transaction assertions (roll back on any failure) ──────────────────
  const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); };
  const num = (v) => Number(v);
  const { rows: [v] } = await client.query(`
    SELECT
      (SELECT COALESCE(sum(t.amount),0) FROM transactions t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE s.employer_id IS NOT NULL AND t.type='contribution'
          AND t.date >= date_trunc('day', public._demo_now()) AND t.date < date_trunc('day', public._demo_now())+interval '1 day') AS contrib_today,
      (SELECT COALESCE(sum(t.amount),0) FROM transactions t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE s.employer_id IS NOT NULL AND t.type='contribution'
          AND t.date >= date_trunc('week', public._demo_now()) AND t.date < date_trunc('week', public._demo_now())+interval '7 days') AS contrib_week,
      (SELECT COALESCE(sum(t.amount),0) FROM transactions t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE s.employer_id IS NOT NULL AND t.type='contribution'
          AND t.date >= date_trunc('month', public._demo_now()) AND t.date < date_trunc('month', public._demo_now())+interval '1 month') AS contrib_month,
      (SELECT COALESCE(sum(ABS(t.amount)),0) FROM transactions t JOIN subscribers s ON s.id=t.subscriber_id
        WHERE s.employer_id IS NOT NULL AND t.type='withdrawal'
          AND t.date >= date_trunc('month', public._demo_now()) AND t.date < date_trunc('month', public._demo_now())+interval '1 month') AS withdraw_month,
      (SELECT count(*) FROM subscribers WHERE employer_id IS NOT NULL
          AND registered_date >= date_trunc('week', public._demo_now())::date
          AND registered_date <  (date_trunc('week', public._demo_now())+interval '7 days')::date) AS new_members_week,
      (SELECT count(*) FROM subscriber_balances b JOIN subscribers s ON s.id=b.subscriber_id
        WHERE s.employer_id IS NOT NULL AND b.total_balance < 0) AS negative_balances,
      (SELECT count(*) FROM subscriber_balances b JOIN subscribers s ON s.id=b.subscriber_id
        WHERE s.employer_id IS NOT NULL AND round(b.units) <> round(b.total_balance/1000.0)) AS units_mismatch,
      (SELECT count(*) FROM subscribers WHERE employer_id IS NOT NULL) AS emp_members,
      (SELECT count(*) FROM subscribers WHERE employer_id IS NOT NULL AND is_active) AS emp_active
  `);
  console.log('VERIFY:', v);
  assert(num(v.contrib_today)  > 0, 'employer contributions today must be > 0');
  assert(num(v.contrib_week)   > 0, 'employer contributions this week must be > 0');
  assert(num(v.contrib_month)  > 0, 'employer contributions this month must be > 0');
  assert(num(v.withdraw_month) > 0, 'employer withdrawals this month must be > 0');
  assert(num(v.new_members_week) >= 2, 'new employer members this week must be >= 2');
  assert(num(v.negative_balances) === 0, 'no employer balance may be negative');
  assert(num(v.units_mismatch) === 0, 'units must equal total_balance/1000 for every employer member');

  await client.query('COMMIT');
  console.log('Done. Employer activity seeded (committed).');
} catch (err) {
  try { await client.query('ROLLBACK'); } catch { /* ignore */ }
  console.error('FAILED (rolled back):', err.message);
  process.exitCode = 1;
} finally {
  try { await client.query("SET session_replication_role = 'origin'"); } catch { /* ignore */ }
  await client.end();
}
