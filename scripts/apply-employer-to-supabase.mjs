// One-time cutover helper: apply the Employer backend (migrations 0034 + 0035)
// and seed ONLY the employer demo data into a Supabase project. Idempotent and
// SCOPED — it touches only the employer tables (+ one demo_personas row); it
// NEVER truncates or reseeds subscribers/agents/branches/distributors.
//
// Run:  npx dotenv -e .env.local -- node scripts/apply-employer-to-supabase.mjs
// Needs SUPABASE_DB_URL (the Supabase pooler connection string) in the env.
//
// Safe to re-run: migrations use IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY
// IF EXISTS; seed rows use ON CONFLICT … DO UPDATE / DO NOTHING.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  EMPLOYER,
  EMPLOYEES,
  CONTRIBUTION_RUNS,
  CONTRIBUTION_RUN_LINES,
  EMPLOYER_DEMO_PHONE,
} from '../src/data/employerSeed.js';

const { Client } = pg;

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('ERROR: SUPABASE_DB_URL is not set. Run via: npx dotenv -e .env.local -- node scripts/apply-employer-to-supabase.mjs');
  process.exit(1);
}

const mig = (f) => readFileSync(fileURLToPath(new URL(`../supabase/migrations/${f}`, import.meta.url)), 'utf8');

const client = new Client({ connectionString: DB_URL });

try {
  await client.connect();
  console.log('Connected.');

  // ── Migrations (DDL) ──────────────────────────────────────────────────────
  console.log('• migration 0034 (employer schema + RLS)…');
  await client.query(mig('0034_employer_schema_and_rls.sql'));
  console.log('• migration 0035 (employer RPCs)…');
  await client.query(mig('0035_employer_rpcs.sql'));

  // ── Employer (1 row) ──────────────────────────────────────────────────────
  console.log('• employers…');
  await client.query(
    `INSERT INTO employers (
       id, name, sector, registration_no, contact_name, contact_phone,
       contact_email, district, payroll_cadence, default_contribution_config
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, sector = EXCLUDED.sector,
       registration_no = EXCLUDED.registration_no, contact_name = EXCLUDED.contact_name,
       contact_phone = EXCLUDED.contact_phone, contact_email = EXCLUDED.contact_email,
       district = EXCLUDED.district, payroll_cadence = EXCLUDED.payroll_cadence,
       default_contribution_config = EXCLUDED.default_contribution_config, updated_at = now()`,
    [
      EMPLOYER.id, EMPLOYER.name, EMPLOYER.sector, EMPLOYER.registrationNo,
      EMPLOYER.contactName, EMPLOYER.contactPhone, EMPLOYER.contactEmail,
      EMPLOYER.district, EMPLOYER.payrollCadence,
      JSON.stringify(EMPLOYER.defaultContributionConfig ?? {}),
    ],
  );

  // ── Employees (standalone roster) ─────────────────────────────────────────
  console.log(`• employees (${EMPLOYEES.length})…`);
  for (const e of EMPLOYEES) {
    await client.query(
      `INSERT INTO employees (
         id, employer_id, name, phone, email, gender, age, nin, job_title, salary,
         status, joined_date, contribution_config, retirement_balance, emergency_balance,
         net_balance, units_held, total_contributions, contribution_schedule,
         insurance_cover, insurance_premium_monthly, insurance_status,
         insurance_renewal_date, nominees
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         employer_id = EXCLUDED.employer_id, name = EXCLUDED.name, phone = EXCLUDED.phone,
         email = EXCLUDED.email, gender = EXCLUDED.gender, age = EXCLUDED.age, nin = EXCLUDED.nin,
         job_title = EXCLUDED.job_title, salary = EXCLUDED.salary, status = EXCLUDED.status,
         joined_date = EXCLUDED.joined_date, contribution_config = EXCLUDED.contribution_config,
         retirement_balance = EXCLUDED.retirement_balance, emergency_balance = EXCLUDED.emergency_balance,
         net_balance = EXCLUDED.net_balance, units_held = EXCLUDED.units_held,
         total_contributions = EXCLUDED.total_contributions, contribution_schedule = EXCLUDED.contribution_schedule,
         insurance_cover = EXCLUDED.insurance_cover, insurance_premium_monthly = EXCLUDED.insurance_premium_monthly,
         insurance_status = EXCLUDED.insurance_status, insurance_renewal_date = EXCLUDED.insurance_renewal_date,
         nominees = EXCLUDED.nominees, updated_at = now()`,
      [
        e.id, e.employerId, e.name, e.phone ?? null, e.email ?? null, e.gender ?? null,
        e.age ?? null, e.nin ?? null, e.jobTitle ?? null, e.salary ?? 0, e.status ?? 'active',
        e.joinedDate ?? null, JSON.stringify(e.contributionConfig ?? {}), e.retirementBalance ?? 0,
        e.emergencyBalance ?? 0, e.netBalance ?? 0, e.unitsHeld ?? 0, e.totalContributions ?? 0,
        JSON.stringify(e.contributionSchedule ?? {}), e.insuranceCover ?? 0,
        e.insurancePremiumMonthly ?? 0, e.insuranceStatus ?? 'inactive',
        e.insuranceRenewalDate ?? null, JSON.stringify(e.nominees ?? []),
      ],
    );
  }

  // ── Contribution runs + lines ─────────────────────────────────────────────
  console.log(`• contribution_runs (${CONTRIBUTION_RUNS.length})…`);
  for (const r of CONTRIBUTION_RUNS) {
    await client.query(
      `INSERT INTO contribution_runs (
         id, employer_id, period_label, status, employer_total, employee_total, grand_total, run_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         employer_id = EXCLUDED.employer_id, period_label = EXCLUDED.period_label,
         status = EXCLUDED.status, employer_total = EXCLUDED.employer_total,
         employee_total = EXCLUDED.employee_total, grand_total = EXCLUDED.grand_total,
         run_at = EXCLUDED.run_at`,
      [
        r.id, r.employerId, r.periodLabel ?? null, r.status ?? 'completed',
        r.employerTotal ?? 0, r.employeeTotal ?? 0, r.grandTotal ?? 0, r.runAt,
      ],
    );
  }

  console.log(`• contribution_run_lines (${CONTRIBUTION_RUN_LINES.length})…`);
  for (const l of CONTRIBUTION_RUN_LINES) {
    await client.query(
      `INSERT INTO contribution_run_lines (
         id, run_id, employee_id, employer_amount, employee_amount,
         retirement_amount, emergency_amount, method
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         run_id = EXCLUDED.run_id, employee_id = EXCLUDED.employee_id,
         employer_amount = EXCLUDED.employer_amount, employee_amount = EXCLUDED.employee_amount,
         retirement_amount = EXCLUDED.retirement_amount, emergency_amount = EXCLUDED.emergency_amount,
         method = EXCLUDED.method`,
      [
        l.id, l.runId, l.employeeId, l.employerAmount ?? 0, l.employeeAmount ?? 0,
        l.retirementAmount ?? 0, l.emergencyAmount ?? 0, l.method ?? null,
      ],
    );
  }

  // ── demo_personas (employer phone → emp-001) ──────────────────────────────
  console.log('• demo_personas (employer)…');
  await client.query(
    `INSERT INTO demo_personas (id, phone, role, entity_id, label)
     VALUES ('dp-e-001', $1, 'employer', $2, 'Default employer (Nile Breweries Demo)')
     ON CONFLICT DO NOTHING`,
    [EMPLOYER_DEMO_PHONE, EMPLOYER.id],
  );

  // ── Verify ────────────────────────────────────────────────────────────────
  const { rows } = await client.query(
    `select
       (select count(*) from employers where id = 'emp-001')               as employers,
       (select count(*) from employees where employer_id = 'emp-001')       as employees,
       (select count(*) from contribution_runs where employer_id = 'emp-001') as runs,
       (select count(*) from contribution_run_lines
          where run_id in (select id from contribution_runs where employer_id='emp-001')) as lines`,
  );
  console.log('VERIFY:', rows[0]);
  console.log('Done. Employer backend + demo data applied.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
