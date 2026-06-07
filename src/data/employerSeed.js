// Employer-role demo seed — UNIFIED MODEL (0043–0045).
//
// An employer's staff are now REAL subscribers tagged with `employer_id`. This
// module is the SINGLE SOURCE OF TRUTH for the employer demo data, consumed two
// ways so the Supabase path and the offline mock path agree:
//   * `scripts/seed-supabase.mjs` seeds the `employers` row + the 16 members as
//     tagged `subscribers` (+ balances / schedules / insurance / transactions)
//     and the employer `contribution_runs` history.
//   * The `src/services/employer.js` mock branch (VITE_USE_SUPABASE=false)
//     layers a session-mutation store over the frozen MEMBERS.
//
// Like every other `src/data` module this is mock data — reached only through a
// service, NEVER imported by a component (CLAUDE.md §4.1). Dates anchor to
// `MOCK_NOW` (2026-05-26) for demo stability.
//
// Issue 2: the funding MODE is a SINGLE company-wide value on the employer
// (`defaultContributionConfig`) — applied to every member, never per-member.

import { MOCK_NOW } from './mockData';

const DAY_MS = 86400000;
const UNIT_PRICE = 1000; // UGX/unit — matches the contribution trigger.
const round = (n) => Math.round(n);

function dateDaysAgo(days) {
  const d = new Date(MOCK_NOW.getTime() - days * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDaysAgo(days) {
  return new Date(MOCK_NOW.getTime() - days * DAY_MS).toISOString();
}
/** YYYY-MM-DD birth date for a given age (demo-stable, mid-year). */
function dobForAge(age) {
  return `${MOCK_NOW.getFullYear() - age}-06-15`;
}

// ─── Employer (B2B account) ──────────────────────────────────────────────────
// ONE company-wide contribution model (Issue 2): the employer matches 50% of
// each member's own monthly saving, capped at UGX 200,000.
export const EMPLOYER = Object.freeze({
  id: 'emp-001',
  name: 'Nile Breweries Demo Ltd',
  sector: 'Manufacturing',
  registrationNo: 'UG-REG-2019-04412',
  contactName: 'Patience Namaganda',
  contactPhone: '+256700000031',
  contactEmail: 'hr@nilebreweries.demo',
  district: 'Kampala',
  districtId: 'd-kampala',
  payrollCadence: 'monthly',
  defaultContributionConfig: { mode: 'co-contribution', matchPct: 50, maxContribution: 200000 },
});

// Demo employer login phone — resolves to emp-001 via demo_personas.
export const EMPLOYER_DEMO_PHONE = '+256700000031';

const COMPANY = EMPLOYER.defaultContributionConfig;

/** Employer match for one member under the company config (match mode). */
function employerMatch(monthly) {
  let amt = round(Number(monthly) * (COMPANY.matchPct ?? 0) / 100);
  if (COMPANY.maxContribution != null) amt = Math.min(amt, round(COMPANY.maxContribution));
  return amt;
}

// ─── Members (tagged subscribers) ────────────────────────────────────────────
// 16 staff onboarded by the employer = real subscribers (agent_id NULL). Each
// member's balances are internally consistent with the company match model:
//   ownContributions     = monthlyContribution × monthsActive
//   employerContributions = employerMatch(monthly) × monthsActive
//   netBalance           = own + employer  (split 80/20 retirement/emergency)
const DEFAULT_SPLIT = { retirementPct: 80, emergencyPct: 20, frequency: 'monthly' };

function makeMember(p) {
  const monthly = p.monthlyContribution ?? 0;
  const months = p.monthsActive ?? 12;
  const own = round(monthly * months);
  const employer = round(employerMatch(monthly) * months);
  const net = own + employer;
  const retirement = round(net * 0.8);
  const emergency = net - retirement;
  return {
    employerId: EMPLOYER.id,
    gender: 'male',
    status: 'active',
    districtId: EMPLOYER.districtId,
    nominees: [],
    insuranceCover: 0,
    insurancePremiumMonthly: 0,
    insuranceStatus: 'inactive',
    insuranceRenewalDate: null,
    ...p,
    dob: p.dob ?? dobForAge(p.age ?? 30),
    contributionSchedule: { ...DEFAULT_SPLIT, amount: monthly },
    ownContributions: own,
    employerContributions: employer,
    totalContributions: net,
    retirementBalance: retirement,
    emergencyBalance: emergency,
    netBalance: net,
    unitsHeld: net / UNIT_PRICE,
  };
}

export const MEMBERS = Object.freeze([
  makeMember({ id: 'empe-001', name: 'Brian Okello', phone: '+256700100001', email: 'brian.okello@nilebreweries.demo', gender: 'male', age: 38, nin: 'CM38010012345A', occupation: 'Plant Manager', monthlyContribution: 210000, monthsActive: 30, joinedDate: dateDaysAgo(900), insuranceCover: 25000000, insurancePremiumMonthly: 0, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-210) }),
  makeMember({ id: 'empe-002', name: 'Grace Nakato', phone: '+256700100002', email: 'grace.nakato@nilebreweries.demo', gender: 'female', age: 31, nin: 'CF31050067890B', occupation: 'Accountant', monthlyContribution: 140000, monthsActive: 21, joinedDate: dateDaysAgo(640), insuranceCover: 15000000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-150) }),
  makeMember({ id: 'empe-003', name: 'Samuel Otim', phone: '+256700100003', email: 'samuel.otim@nilebreweries.demo', gender: 'male', age: 45, nin: 'CM45030011223C', occupation: 'Logistics Lead', monthlyContribution: 100000, monthsActive: 36, joinedDate: dateDaysAgo(1100) }),
  makeMember({ id: 'empe-004', name: 'Esther Aciro', phone: '+256700100004', email: 'esther.aciro@nilebreweries.demo', gender: 'female', age: 27, nin: 'CF27110033445D', occupation: 'QA Technician', monthlyContribution: 80000, monthsActive: 14, joinedDate: dateDaysAgo(420) }),
  makeMember({ id: 'empe-005', name: 'Joseph Mukasa', phone: '+256700100005', email: 'joseph.mukasa@nilebreweries.demo', gender: 'male', age: 52, nin: 'CM52070055667E', occupation: 'Maintenance Supervisor', monthlyContribution: 120000, monthsActive: 36, joinedDate: dateDaysAgo(1500), insuranceCover: 20000000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-90) }),
  makeMember({ id: 'empe-006', name: 'Florence Atim', phone: '+256700100006', email: 'florence.atim@nilebreweries.demo', gender: 'female', age: 34, nin: 'CF34020077889F', occupation: 'HR Officer', monthlyContribution: 132000, monthsActive: 24, joinedDate: dateDaysAgo(720) }),
  makeMember({ id: 'empe-007', name: 'David Wanyama', phone: '+256700100007', email: 'david.wanyama@nilebreweries.demo', gender: 'male', age: 29, nin: 'CM29090099001G', occupation: 'Sales Rep', monthlyContribution: 95000, monthsActive: 12, joinedDate: dateDaysAgo(360) }),
  makeMember({ id: 'empe-008', name: 'Rebecca Namusoke', phone: '+256700100008', email: 'rebecca.namusoke@nilebreweries.demo', gender: 'female', age: 41, nin: 'CF41040022334H', occupation: 'Procurement Officer', monthlyContribution: 160000, monthsActive: 32, joinedDate: dateDaysAgo(980), insuranceCover: 18000000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-30) }),
  makeMember({ id: 'empe-009', name: 'Isaac Tumusiime', phone: '+256700100009', email: 'isaac.tumusiime@nilebreweries.demo', gender: 'male', age: 36, nin: 'CM36060044556I', occupation: 'IT Support', monthlyContribution: 105000, monthsActive: 18, joinedDate: dateDaysAgo(560) }),
  makeMember({ id: 'empe-010', name: 'Mary Auma', phone: '+256700100010', email: 'mary.auma@nilebreweries.demo', gender: 'female', age: 24, nin: 'CF24120066778J', occupation: 'Admin Assistant', monthlyContribution: 65000, monthsActive: 6, joinedDate: dateDaysAgo(180) }),
  makeMember({ id: 'empe-011', name: 'Peter Sserwadda', phone: '+256700100011', email: 'peter.sserwadda@nilebreweries.demo', gender: 'male', age: 48, nin: 'CM48080088990K', occupation: 'Security Lead', monthlyContribution: 90000, monthsActive: 36, joinedDate: dateDaysAgo(1320) }),
  makeMember({ id: 'empe-012', name: 'Sarah Kobusingye', phone: '+256700100012', email: 'sarah.kobusingye@nilebreweries.demo', gender: 'female', age: 33, nin: 'CF33100011002L', occupation: 'Marketing Coordinator', monthlyContribution: 115000, monthsActive: 22, joinedDate: dateDaysAgo(660), insuranceCover: 15000000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-120) }),
  // Suspended (skipped by runs).
  makeMember({ id: 'empe-013', name: 'Henry Kato', phone: '+256700100013', email: 'henry.kato@nilebreweries.demo', gender: 'male', age: 39, nin: 'CM39050033445M', occupation: 'Driver', monthlyContribution: 55000, monthsActive: 28, status: 'suspended', joinedDate: dateDaysAgo(840) }),
  makeMember({ id: 'empe-014', name: 'Diana Nabirye', phone: '+256700100014', email: 'diana.nabirye@nilebreweries.demo', gender: 'female', age: 28, nin: 'CF28030055667N', occupation: 'Lab Analyst', monthlyContribution: 90000, monthsActive: 10, joinedDate: dateDaysAgo(300) }),
  makeMember({ id: 'empe-015', name: 'Robert Ssempala', phone: '+256700100015', email: 'robert.ssempala@nilebreweries.demo', gender: 'male', age: 55, nin: 'CM55020077889O', occupation: 'Warehouse Hand', monthlyContribution: 60000, monthsActive: 36, status: 'suspended', joinedDate: dateDaysAgo(1700) }),
  makeMember({ id: 'empe-016', name: 'Juliet Akello', phone: '+256700100016', email: 'juliet.akello@nilebreweries.demo', gender: 'female', age: 30, nin: 'CF30070099001P', occupation: 'Customer Service', monthlyContribution: 70000, monthsActive: 8, joinedDate: dateDaysAgo(240), insuranceCover: 12000000, insuranceStatus: 'active', insuranceRenewalDate: dateDaysAgo(-60) }),
]);

const ACTIVE_MEMBERS = MEMBERS.filter((m) => m.status === 'active');

// ─── Member contribution transactions (own + employer history) ───────────────
// A compact 3-month history per active member: their own monthly saving and the
// employer match, so the member detail + subscriber dashboard show both sources.
function buildMemberTransactions() {
  const txns = [];
  ACTIVE_MEMBERS.forEach((m) => {
    [25, 55, 85].forEach((daysAgo, i) => {
      const own = round(m.monthlyContribution);
      txns.push({
        id: `t-own-${m.id}-${i + 1}`, subscriberId: m.id, type: 'contribution', source: 'own',
        amount: own, date: isoDaysAgo(daysAgo), method: 'MTN Mobile Money',
        retirementAmount: round(own * 0.8), emergencyAmount: own - round(own * 0.8), contributionRunId: null,
      });
      const emp = employerMatch(m.monthlyContribution);
      if (emp > 0) {
        txns.push({
          id: `t-emp-${m.id}-${i + 1}`, subscriberId: m.id, type: 'contribution', source: 'employer',
          amount: emp, date: isoDaysAgo(daysAgo - 1), method: 'Bank transfer',
          retirementAmount: round(emp * 0.8), emergencyAmount: emp - round(emp * 0.8),
          contributionRunId: `run-00${3 - i}`,
        });
      }
    });
  });
  return txns;
}
export const MEMBER_TRANSACTIONS = Object.freeze(buildMemberTransactions());

// ─── Employer contribution runs (history headers) ────────────────────────────
// Each monthly run posts the employer match to every active member.
function buildRun(id, periodLabel, daysAgo) {
  const employerTotal = ACTIVE_MEMBERS.reduce((s, m) => s + employerMatch(m.monthlyContribution), 0);
  return {
    id, employerId: EMPLOYER.id, periodLabel, status: 'completed',
    employerTotal, employeeTotal: 0, grandTotal: employerTotal, runAt: isoDaysAgo(daysAgo),
  };
}
export const CONTRIBUTION_RUNS = Object.freeze([
  buildRun('run-001', 'February 2026', 105),
  buildRun('run-002', 'March 2026', 75),
  buildRun('run-003', 'April 2026', 35),
  buildRun('run-004', 'May 2026', 5),
]);

// ─── Leaderboard competitors (demo-only) ─────────────────────────────────────
// Invented peer employers; "you" = the newest run's grandTotal is spliced in by
// getEmployerLeaderboard. Calibrated so the demo employer lands mid-field.
export const LEADERBOARD_COMPETITORS = Object.freeze([
  Object.freeze({ name: 'MTN Uganda', monthlyTotal: 4180000 }),
  Object.freeze({ name: 'Centenary Bank', monthlyTotal: 3240000 }),
  Object.freeze({ name: 'Roofings Group', monthlyTotal: 1180000 }),
  Object.freeze({ name: 'Quality Chemicals', monthlyTotal: 990000 }),
  Object.freeze({ name: 'Café Javas', monthlyTotal: 825000 }),
  Object.freeze({ name: 'Movit Products', monthlyTotal: 560000 }),
  Object.freeze({ name: 'Mukwano Industries', monthlyTotal: 340000 }),
]);

export { UNIT_PRICE as EMPLOYER_UNIT_PRICE };
