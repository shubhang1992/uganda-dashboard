// Employer-role demo seed — Phase 0 of the Employer dashboard.
//
// This module is the SINGLE SOURCE OF TRUTH for the employer demo data. It is
// consumed two ways so the Supabase path and the offline mock path return
// identical entities:
//   * `scripts/seed-supabase.mjs` imports it to seed the `employers` /
//     `employees` / `contribution_runs` / `contribution_run_lines` tables.
//   * The Phase 1 `src/services/employer.js` mock branch (VITE_USE_SUPABASE=
//     false) layers a session-mutation store over these frozen rows.
//
// Like every other `src/data` module this is mock data — reached only through a
// service, NEVER imported by a component/dashboard file (CLAUDE.md §4.1).
//
// Dates are anchored to `MOCK_NOW` (2026-05-26, see mockData.js) — never
// `new Date()` — so the seeded run history / joined-dates stay demo-stable.
//
// Shape conventions mirror mockData.js: camelCase fields, deterministic IDs
// (emp-001, empe-NNN, run-NNN, crl-NNN-NNN). The seed script snake_cases on the
// way into Postgres; the Phase 1 service maps snake→camel on Supabase reads.

import { MOCK_NOW } from './mockData';

const DAY_MS = 86400000;
const UNIT_PRICE = 1000; // UGX/unit — matches the contribution trigger.

/** YYYY-MM-DD string `days` before MOCK_NOW. */
function dateDaysAgo(days) {
  const d = new Date(MOCK_NOW.getTime() - days * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO timestamp `days` before MOCK_NOW (TIMESTAMPTZ-compatible). */
function isoDaysAgo(days) {
  return new Date(MOCK_NOW.getTime() - days * DAY_MS).toISOString();
}

const round = (n) => Math.round(n);

// ─── Employer (B2B account) ──────────────────────────────────────────────────
// One demo employer. Default contribution config = the template a new run
// starts from (employer 10% / employee 5% co-contribution).
export const EMPLOYER = Object.freeze({
  id: 'emp-001',
  name: 'Nile Breweries Demo Ltd',
  sector: 'Manufacturing',
  registrationNo: 'UG-REG-2019-04412',
  contactName: 'Patience Namaganda',
  contactPhone: '+256700000031',
  contactEmail: 'hr@nilebreweries.demo',
  district: 'Kampala',
  payrollCadence: 'monthly',
  defaultContributionConfig: {
    mode: 'co-contribution',
    employerPct: 10,
    employeePct: 5,
    employerAmount: null,
    employeeAmount: null,
  },
});

// Demo employer login phone — drives the `demo_personas` + `users` rows so any
// OTP/password login on this phone resolves to emp-001.
export const EMPLOYER_DEMO_PHONE = '+256700000031';

// ─── Employees (standalone roster) ───────────────────────────────────────────
// 16 staff: a mix of co-contribution vs employer-only, varied salaries, a
// couple suspended, some insured. Balances are illustrative lifetime totals.
//
// Default retirement/emergency split is 80/20 unless overridden.
const DEFAULT_SCHEDULE = { retirementPct: 80, emergencyPct: 20 };

/**
 * Build an employee row, deriving net_balance/units/total from retirement +
 * emergency so the seeded balances are internally consistent (net = r + e,
 * units = net / 1000), matching what submit_contribution_run maintains.
 */
function makeEmployee(partial) {
  const retirement = partial.retirementBalance ?? 0;
  const emergency = partial.emergencyBalance ?? 0;
  const net = retirement + emergency;
  return {
    employerId: EMPLOYER.id,
    gender: 'male',
    status: 'active',
    contributionSchedule: DEFAULT_SCHEDULE,
    insuranceCover: 0,
    insurancePremiumMonthly: 0,
    insuranceStatus: 'inactive',
    insuranceRenewalDate: null,
    nominees: [],
    ...partial,
    retirementBalance: retirement,
    emergencyBalance: emergency,
    netBalance: net,
    unitsHeld: net / UNIT_PRICE,
    // Lifetime gross funded ≈ net balance for the demo (no withdrawals).
    totalContributions: partial.totalContributions ?? net,
  };
}

const co = (employerPct, employeePct) => ({
  mode: 'co-contribution',
  employerPct,
  employeePct,
  employerAmount: null,
  employeeAmount: null,
});
const employerOnly = (employerPct) => ({
  mode: 'employer-only',
  employerPct,
  employeePct: 0,
  employerAmount: null,
  employeeAmount: null,
});

export const EMPLOYEES = Object.freeze([
  makeEmployee({
    id: 'empe-001', name: 'Brian Okello', phone: '+256700100001', email: 'brian.okello@nilebreweries.demo',
    gender: 'male', age: 38, nin: 'CM38010012345A', jobTitle: 'Plant Manager', salary: 4200000,
    joinedDate: dateDaysAgo(900), contributionConfig: co(10, 5),
    retirementBalance: 7200000, emergencyBalance: 1800000,
    insuranceCover: 25000000, insurancePremiumMonthly: 42000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-210),
  }),
  makeEmployee({
    id: 'empe-002', name: 'Grace Nakato', phone: '+256700100002', email: 'grace.nakato@nilebreweries.demo',
    gender: 'female', age: 31, nin: 'CF31050067890B', jobTitle: 'Accountant', salary: 2800000,
    joinedDate: dateDaysAgo(640), contributionConfig: co(10, 5),
    retirementBalance: 3360000, emergencyBalance: 840000,
    insuranceCover: 15000000, insurancePremiumMonthly: 28000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-150),
  }),
  makeEmployee({
    id: 'empe-003', name: 'Samuel Otim', phone: '+256700100003', email: 'samuel.otim@nilebreweries.demo',
    gender: 'male', age: 45, nin: 'CM45030011223C', jobTitle: 'Logistics Lead', salary: 3100000,
    joinedDate: dateDaysAgo(1100), contributionConfig: employerOnly(8),
    retirementBalance: 4960000, emergencyBalance: 1240000,
  }),
  makeEmployee({
    id: 'empe-004', name: 'Esther Aciro', phone: '+256700100004', email: 'esther.aciro@nilebreweries.demo',
    gender: 'female', age: 27, nin: 'CF27110033445D', jobTitle: 'QA Technician', salary: 1600000,
    joinedDate: dateDaysAgo(420), contributionConfig: co(10, 5),
    retirementBalance: 1280000, emergencyBalance: 320000,
  }),
  makeEmployee({
    id: 'empe-005', name: 'Joseph Mukasa', phone: '+256700100005', email: 'joseph.mukasa@nilebreweries.demo',
    gender: 'male', age: 52, nin: 'CM52070055667E', jobTitle: 'Maintenance Supervisor', salary: 2400000,
    joinedDate: dateDaysAgo(1500), contributionConfig: employerOnly(8),
    retirementBalance: 5760000, emergencyBalance: 1440000,
    insuranceCover: 20000000, insurancePremiumMonthly: 36000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-90),
  }),
  makeEmployee({
    id: 'empe-006', name: 'Florence Atim', phone: '+256700100006', email: 'florence.atim@nilebreweries.demo',
    gender: 'female', age: 34, nin: 'CF34020077889F', jobTitle: 'HR Officer', salary: 2200000,
    joinedDate: dateDaysAgo(720), contributionConfig: co(12, 6),
    retirementBalance: 3168000, emergencyBalance: 792000,
  }),
  makeEmployee({
    id: 'empe-007', name: 'David Wanyama', phone: '+256700100007', email: 'david.wanyama@nilebreweries.demo',
    gender: 'male', age: 29, nin: 'CM29090099001G', jobTitle: 'Sales Rep', salary: 1900000,
    joinedDate: dateDaysAgo(360), contributionConfig: co(10, 5),
    retirementBalance: 1140000, emergencyBalance: 285000,
  }),
  makeEmployee({
    id: 'empe-008', name: 'Rebecca Namusoke', phone: '+256700100008', email: 'rebecca.namusoke@nilebreweries.demo',
    gender: 'female', age: 41, nin: 'CF41040022334H', jobTitle: 'Procurement Officer', salary: 2600000,
    joinedDate: dateDaysAgo(980), contributionConfig: employerOnly(8),
    retirementBalance: 4992000, emergencyBalance: 1248000,
    insuranceCover: 18000000, insurancePremiumMonthly: 32000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-30),
  }),
  makeEmployee({
    id: 'empe-009', name: 'Isaac Tumusiime', phone: '+256700100009', email: 'isaac.tumusiime@nilebreweries.demo',
    gender: 'male', age: 36, nin: 'CM36060044556I', jobTitle: 'IT Support', salary: 2100000,
    joinedDate: dateDaysAgo(560), contributionConfig: co(10, 5),
    retirementBalance: 2016000, emergencyBalance: 504000,
  }),
  makeEmployee({
    id: 'empe-010', name: 'Mary Auma', phone: '+256700100010', email: 'mary.auma@nilebreweries.demo',
    gender: 'female', age: 24, nin: 'CF24120066778J', jobTitle: 'Admin Assistant', salary: 1300000,
    joinedDate: dateDaysAgo(180), contributionConfig: co(10, 5),
    retirementBalance: 520000, emergencyBalance: 130000,
  }),
  makeEmployee({
    id: 'empe-011', name: 'Peter Sserwadda', phone: '+256700100011', email: 'peter.sserwadda@nilebreweries.demo',
    gender: 'male', age: 48, nin: 'CM48080088990K', jobTitle: 'Security Lead', salary: 1500000,
    joinedDate: dateDaysAgo(1320), contributionConfig: employerOnly(8),
    retirementBalance: 3600000, emergencyBalance: 900000,
  }),
  makeEmployee({
    id: 'empe-012', name: 'Sarah Kobusingye', phone: '+256700100012', email: 'sarah.kobusingye@nilebreweries.demo',
    gender: 'female', age: 33, nin: 'CF33100011002L', jobTitle: 'Marketing Coordinator', salary: 2300000,
    joinedDate: dateDaysAgo(660), contributionConfig: co(10, 5),
    retirementBalance: 2760000, emergencyBalance: 690000,
    insuranceCover: 15000000, insurancePremiumMonthly: 28000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-120),
  }),
  // Suspended — should be skipped by submit_contribution_run.
  makeEmployee({
    id: 'empe-013', name: 'Henry Kato', phone: '+256700100013', email: 'henry.kato@nilebreweries.demo',
    gender: 'male', age: 39, nin: 'CM39050033445M', jobTitle: 'Driver', salary: 1100000,
    status: 'suspended', joinedDate: dateDaysAgo(840), contributionConfig: co(10, 5),
    retirementBalance: 1584000, emergencyBalance: 396000,
  }),
  makeEmployee({
    id: 'empe-014', name: 'Diana Nabirye', phone: '+256700100014', email: 'diana.nabirye@nilebreweries.demo',
    gender: 'female', age: 28, nin: 'CF28030055667N', jobTitle: 'Lab Analyst', salary: 1800000,
    joinedDate: dateDaysAgo(300), contributionConfig: co(10, 5),
    retirementBalance: 1080000, emergencyBalance: 270000,
  }),
  // Suspended employer-only.
  makeEmployee({
    id: 'empe-015', name: 'Robert Ssempala', phone: '+256700100015', email: 'robert.ssempala@nilebreweries.demo',
    gender: 'male', age: 55, nin: 'CM55020077889O', jobTitle: 'Warehouse Hand', salary: 950000,
    status: 'suspended', joinedDate: dateDaysAgo(1700), contributionConfig: employerOnly(8),
    retirementBalance: 2280000, emergencyBalance: 570000,
  }),
  makeEmployee({
    id: 'empe-016', name: 'Juliet Akello', phone: '+256700100016', email: 'juliet.akello@nilebreweries.demo',
    gender: 'female', age: 30, nin: 'CF30070099001P', jobTitle: 'Customer Service', salary: 1400000,
    joinedDate: dateDaysAgo(240), contributionConfig: co(10, 5),
    retirementBalance: 672000, emergencyBalance: 168000,
    insuranceCover: 12000000, insurancePremiumMonthly: 22000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-60),
  }),
]);

// ─── Historical contribution runs + lines ────────────────────────────────────
// 3 completed runs (Feb, Mar, Apr 2026). Each line's amounts re-derive the
// employer/employee halves from the snapshot salary + config exactly the way
// submit_contribution_run does, so the seeded ledger matches the live RPC math.

const EMP_BY_ID = Object.fromEntries(EMPLOYEES.map((e) => [e.id, e]));

/** Compute one line's amounts the same way the RPC does (active employees). */
function lineFor(emp, method) {
  const cfg = emp.contributionConfig ?? {};
  const employerHalf =
    cfg.employerAmount != null
      ? round(cfg.employerAmount)
      : round((emp.salary ?? 0) * (cfg.employerPct ?? 0) / 100);
  const employeeHalf =
    cfg.mode === 'co-contribution'
      ? cfg.employeeAmount != null
        ? round(cfg.employeeAmount)
        : round((emp.salary ?? 0) * (cfg.employeePct ?? 0) / 100)
      : 0;
  const gross = employerHalf + employeeHalf;
  const retPct = emp.contributionSchedule?.retirementPct ?? 80;
  const retirement = round(gross * retPct / 100);
  const emergency = gross - retirement;
  return { employerHalf, employeeHalf, gross, retirement, emergency, method };
}

/** Build a run header + its lines for the active employees, anchored N days ago. */
function buildRun(id, periodLabel, daysAgo, method) {
  const activeEmployees = EMPLOYEES.filter((e) => e.status === 'active');
  let employerTotal = 0;
  let employeeTotal = 0;
  const lines = activeEmployees.map((emp, i) => {
    const l = lineFor(emp, method);
    employerTotal += l.employerHalf;
    employeeTotal += l.employeeHalf;
    return {
      id: `crl-${id.slice(4)}-${String(i + 1).padStart(3, '0')}`,
      runId: id,
      employeeId: emp.id,
      employerAmount: l.employerHalf,
      employeeAmount: l.employeeHalf,
      retirementAmount: l.retirement,
      emergencyAmount: l.emergency,
      method,
    };
  });
  return {
    run: {
      id,
      employerId: EMPLOYER.id,
      periodLabel,
      status: 'completed',
      employerTotal,
      employeeTotal,
      grandTotal: employerTotal + employeeTotal,
      runAt: isoDaysAgo(daysAgo),
    },
    lines,
  };
}

const RUN_DEFS = [
  buildRun('run-001', 'February 2026', 105, 'Bank transfer'),
  buildRun('run-002', 'March 2026', 75, 'Bank transfer'),
  buildRun('run-003', 'April 2026', 35, 'MTN Mobile Money'),
];

export const CONTRIBUTION_RUNS = Object.freeze(RUN_DEFS.map((r) => r.run));
export const CONTRIBUTION_RUN_LINES = Object.freeze(RUN_DEFS.flatMap((r) => r.lines));

// ─── Leaderboard competitors (demo-only) ─────────────────────────────────────
// Anonymous-but-plausible Ugandan employers for the Overview monthly-contribution
// leaderboard. These are INVENTED demo figures — NOT real financial data for
// any named company. Consumed only by `getEmployerLeaderboard` in
// `src/services/employer.js`, which merges in emp-001's own "this month" total
// (the newest run's grandTotal = UGX 4,074,000) and ranks the combined list.
//
// Calibrated so emp-001 lands at ~#3: EXACTLY two competitors sit above
// 4,074,000 (MTN Uganda 6.82M, Centenary Bank 5.31M) and the remaining nine sit
// below it, so once "you" is spliced in the ranks read
//   #1 MTN · #2 Centenary · #3 YOU · #4 Roofings · …
// `monthlyTotal` is UGX/month. Kept as a frozen array (mockData.js convention).
export const LEADERBOARD_COMPETITORS = Object.freeze([
  Object.freeze({ name: 'MTN Uganda', monthlyTotal: 6820000 }),
  Object.freeze({ name: 'Centenary Bank', monthlyTotal: 5310000 }),
  // — emp-001 ("you", 4,074,000) ranks here, between Centenary and Roofings —
  Object.freeze({ name: 'Roofings Group', monthlyTotal: 3760000 }),
  Object.freeze({ name: 'Quality Chemicals', monthlyTotal: 3415000 }),
  Object.freeze({ name: 'Café Javas', monthlyTotal: 2980000 }),
  Object.freeze({ name: 'Movit Products', monthlyTotal: 2540000 }),
  Object.freeze({ name: 'Mukwano Industries', monthlyTotal: 2185000 }),
  Object.freeze({ name: 'Pearl Dairy Farms', monthlyTotal: 1870000 }),
  Object.freeze({ name: 'Vision Group', monthlyTotal: 1540000 }),
  Object.freeze({ name: 'Bidco Uganda', monthlyTotal: 1295000 }),
  Object.freeze({ name: 'Tian Tang Group', monthlyTotal: 980000 }),
]);

// Re-export the by-id index + unit price for the Phase 1 service.
export const EMPLOYEES_BY_ID = EMP_BY_ID;
export { UNIT_PRICE as EMPLOYER_UNIT_PRICE };
