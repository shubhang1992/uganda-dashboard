// Employer data service — Supabase-backed read/write for the Employer
// dashboard, mirroring `src/services/entities.js`.
//
// Dual-path: every function checks `IS_SUPABASE_ENABLED` (from
// `src/services/api.js`). When true it hits Supabase directly (reads are
// RLS-auto-scoped to the caller's employer via the JWT `employerId` claim that
// `supabaseClient.js` forwards; writes go through the 0035 SECURITY DEFINER
// RPCs). When false (`VITE_USE_SUPABASE=false`) it falls back to the frozen
// `src/data/employerSeed.js` rows layered with a per-session mutation store
// (balance-delta technique borrowed from `src/services/subscriber.js`).
//
// Naming convention: Supabase returns snake_case rows. The mappers below
// (`mapEmployer`/`mapEmployee`/`mapRun`/`mapRunLine`) translate to the camelCase
// shape that the hooks + components consume — same idiom as `entities.js`
// `mapBranch`. Only THIS service file imports `employerSeed.js`
// (CLAUDE.md §4.1).
//
// ⚠️ The mock `submitContributionRun` re-derives every amount with the SAME
// math as the `submit_contribution_run` RPC (0038) / the `lineFor` helper in
// employerSeed.js. NEW co-contribution model: the employer MATCHES a % of the
// employee's own monthly saving, capped by an optional fixed UGX maximum:
//   co (matchPct present): employee_half = round(monthlyContribution);
//     employer_half = round(employee_half*matchPct/100), then
//     min(employer_half, round(maxContribution)) when maxContribution is set.
//   co (legacy, employeePct, no matchPct): employer_half = employerAmount ??
//     round(salary*employerPct/100); employee_half = employeeAmount ??
//     round(salary*employeePct/100)  (dual-read back-compat).
//   employer-only: employer_half = employerAmount ?? round(salary*employerPct
//     /100); employee_half = 0.
// Then retirement = round(gross*retPct/100); emergency = gross - retirement;
// units = gross / 1000. It skips suspended / not-owned / not-found /
// zero-contribution employees, mutates session balance-deltas, appends to an
// in-memory `_mockRuns`, and is idempotent via a nonce→result map. It creates
// NO commission side-effects (no `transactions`, `subscriber_balances`, or
// `commissions` writes) — matching the RPC's hard constraint.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import { normalizeFrequency } from '../utils/finance';
import { currentTime } from '../data/mockData';
import {
  EMPLOYER,
  EMPLOYEES,
  CONTRIBUTION_RUNS,
  CONTRIBUTION_RUN_LINES,
  EMPLOYER_UNIT_PRICE,
  LEADERBOARD_COMPETITORS,
} from '../data/employerSeed';

const round = (n) => Math.round(n);

// =============================================================================
// Mappers (snake_case DB row → camelCase frontend shape)
// =============================================================================

/**
 * Map an `employers` row. `default_contribution_config` is JSONB and already
 * camelCase inside (mode/employerPct/…); pass it through untouched.
 */
export function mapEmployer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    registrationNo: row.registration_no,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    district: row.district,
    payrollCadence: row.payroll_cadence,
    defaultContributionConfig: row.default_contribution_config ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map an `employees` row. The JSONB columns (`contribution_config`,
 * `contribution_schedule`, `nominees`) are already camelCase inside, so they
 * pass through. `contribution_schedule.frequency` (if present) is run through
 * `normalizeFrequency` per the hard rule (CLAUDE.md §4.6).
 */
export function mapEmployee(row) {
  if (!row) return null;
  const schedule = row.contribution_schedule ?? null;
  return {
    id: row.id,
    employerId: row.employer_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    age: row.age,
    nin: row.nin,
    jobTitle: row.job_title,
    salary: Number(row.salary ?? 0),
    status: row.status,
    joinedDate: row.joined_date,
    monthlyContribution: Number(row.monthly_contribution ?? 0),
    contributionConfig: row.contribution_config ?? null,
    contributionSchedule: schedule
      ? {
          ...schedule,
          frequency: schedule.frequency
            ? normalizeFrequency(schedule.frequency)
            : schedule.frequency,
        }
      : null,
    retirementBalance: Number(row.retirement_balance ?? 0),
    emergencyBalance: Number(row.emergency_balance ?? 0),
    netBalance: Number(row.net_balance ?? 0),
    unitsHeld: Number(row.units_held ?? 0),
    totalContributions: Number(row.total_contributions ?? 0),
    insuranceCover: Number(row.insurance_cover ?? 0),
    insurancePremiumMonthly: Number(row.insurance_premium_monthly ?? 0),
    insuranceStatus: row.insurance_status ?? 'inactive',
    insuranceRenewalDate: row.insurance_renewal_date ?? null,
    nominees: Array.isArray(row.nominees) ? row.nominees : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Map a `contribution_runs` header row. */
export function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    employerId: row.employer_id,
    periodLabel: row.period_label,
    status: row.status,
    employerTotal: Number(row.employer_total ?? 0),
    employeeTotal: Number(row.employee_total ?? 0),
    grandTotal: Number(row.grand_total ?? 0),
    runAt: row.run_at,
    createdAt: row.created_at,
  };
}

/** Map a `contribution_run_lines` row. */
export function mapRunLine(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    employeeId: row.employee_id,
    employerAmount: Number(row.employer_amount ?? 0),
    employeeAmount: Number(row.employee_amount ?? 0),
    retirementAmount: Number(row.retirement_amount ?? 0),
    emergencyAmount: Number(row.emergency_amount ?? 0),
    method: row.method,
  };
}

// =============================================================================
// Mock fallback — per-session mutation store layered over employerSeed.js
// =============================================================================
//
// Borrowed from subscriber.js: a session map of balance-deltas + config /
// insurance / profile overrides + appended runs, all resetting on refresh.
// Keyed by employeeId for the balance deltas and per-key overrides; the run
// list + nonce ledger live at module scope (one employer in the demo seed).

const _mockEmployeeMutations = new Map();
/** Appended runs (newest-first when read). */
let _mockRuns = [];
/** Appended run lines (flat). */
let _mockRunLines = [];
/** nonce → prior result, for idempotency. */
const _mockNonceResults = new Map();
/** Employer profile override (applied on top of EMPLOYER on read). */
let _mockEmployerOverride = null;

function readEmployeeSession(id) {
  if (!_mockEmployeeMutations.has(id)) {
    _mockEmployeeMutations.set(id, {
      configOverride: null,
      insuranceOverride: null,
      balanceDelta: {
        retirement: 0,
        emergency: 0,
        net: 0,
        units: 0,
        totalContributions: 0,
      },
    });
  }
  return _mockEmployeeMutations.get(id);
}

/** Layer the session mutations over a frozen seed employee. */
function applyEmployeeMutations(emp) {
  if (!emp) return emp;
  const m = readEmployeeSession(emp.id);
  const cfg = m.configOverride ?? emp.contributionConfig;
  const ins = m.insuranceOverride ?? {
    cover: emp.insuranceCover,
    premium: emp.insurancePremiumMonthly,
    status: emp.insuranceStatus,
    renewalDate: emp.insuranceRenewalDate,
  };
  return {
    ...emp,
    contributionConfig: cfg,
    insuranceCover: ins.cover,
    insurancePremiumMonthly: ins.premium,
    insuranceStatus: ins.status,
    insuranceRenewalDate: ins.renewalDate,
    retirementBalance: Math.max(0, (emp.retirementBalance || 0) + m.balanceDelta.retirement),
    emergencyBalance: Math.max(0, (emp.emergencyBalance || 0) + m.balanceDelta.emergency),
    netBalance: Math.max(0, (emp.netBalance || 0) + m.balanceDelta.net),
    unitsHeld: Math.max(0, (emp.unitsHeld || 0) + m.balanceDelta.units),
    totalContributions: Math.max(0, (emp.totalContributions || 0) + m.balanceDelta.totalContributions),
  };
}

/** All employees (seed + session mutations), in seed order. */
function mockEmployees() {
  return EMPLOYEES.map(applyEmployeeMutations);
}

/** All runs: appended session runs (newest first) then seed runs (newest first). */
function mockRuns() {
  const seedRuns = [...CONTRIBUTION_RUNS].sort((a, b) =>
    String(b.runAt ?? '').localeCompare(String(a.runAt ?? '')),
  );
  return [..._mockRuns, ...seedRuns];
}

function mockRunLines(runId) {
  const seedLines = CONTRIBUTION_RUN_LINES.filter((l) => l.runId === runId);
  const sessionLines = _mockRunLines.filter((l) => l.runId === runId);
  return [...sessionLines, ...seedLines];
}

/**
 * Re-derive one employee's line amounts the SAME way the RPC does. Mirrors
 * `lineFor` in employerSeed.js + the SQL in 0038. NEW co-contribution model:
 * the employer MATCHES `matchPct` of the employee's own monthly saving
 * (monthlyContribution), capped by an optional fixed UGX maximum on the
 * employer top-up. Dual-read: a legacy co row (employeePct, no matchPct) falls
 * back to the OLD salary-based math so an un-migrated row never zeroes out.
 * employer-only is unchanged. Returns { skip } + a reason when the employee
 * should be skipped (suspended / zero contribution).
 */
function mockLineFor(emp) {
  if (emp.status !== 'active') return { skip: 'suspended' };
  const cfg = emp.contributionConfig ?? {};
  const mode = cfg.mode ?? 'employer-only';
  let employerHalf;
  let employeeHalf;
  if (mode === 'co-contribution') {
    if (cfg.matchPct != null) {
      // NEW: employee funds their own saving; employer matches a % of it.
      employeeHalf = round(Number(emp.monthlyContribution ?? 0));
      employerHalf = round(employeeHalf * Number(cfg.matchPct ?? 0) / 100);
      if (cfg.maxContribution != null && cfg.maxContribution !== '') {
        employerHalf = Math.min(employerHalf, round(Number(cfg.maxContribution)));
      }
    } else {
      // LEGACY fallback: two independent % of salary (pre-redesign rows).
      employerHalf =
        cfg.employerAmount != null
          ? round(Number(cfg.employerAmount))
          : round((emp.salary ?? 0) * Number(cfg.employerPct ?? 0) / 100);
      employeeHalf =
        cfg.employeeAmount != null
          ? round(Number(cfg.employeeAmount))
          : round((emp.salary ?? 0) * Number(cfg.employeePct ?? 0) / 100);
    }
  } else {
    employerHalf =
      cfg.employerAmount != null
        ? round(Number(cfg.employerAmount))
        : round((emp.salary ?? 0) * Number(cfg.employerPct ?? 0) / 100);
    employeeHalf = 0;
  }
  const gross = employerHalf + employeeHalf;
  if (gross <= 0) return { skip: 'zero_contribution' };
  let retPct = Number(emp.contributionSchedule?.retirementPct ?? 80);
  if (!(retPct >= 0 && retPct <= 100)) retPct = 80;
  const retirement = round(gross * retPct / 100);
  const emergency = gross - retirement;
  return { employerHalf, employeeHalf, gross, retirement, emergency };
}

/**
 * Mock `submit_contribution_run`. Re-derives amounts server-style, skips
 * suspended / not-owned / not-found / zero employees, mutates session
 * balance-deltas, appends a run + lines, and is idempotent via the nonce
 * ledger. Creates NO commission side-effects.
 */
function _mockSubmitContributionRun(employerId, { rows, periodLabel, method, nonce } = {}) {
  if (nonce && _mockNonceResults.has(nonce)) {
    return _mockNonceResults.get(nonce);
  }
  if (!Array.isArray(rows)) throw new Error('rows must be an array');

  const byId = Object.fromEntries(mockEmployees().map((e) => [e.id, e]));
  const runId = `run-mock-${Date.now()}`;
  const lines = [];
  const skipped = [];
  let employerTotal = 0;
  let employeeTotal = 0;
  let grandTotal = 0;

  for (const row of rows) {
    const employeeId = row?.employeeId;
    if (!employeeId) {
      skipped.push({ employeeId: employeeId ?? null, reason: 'missing_employee_id' });
      continue;
    }
    const emp = byId[employeeId];
    if (!emp) {
      skipped.push({ employeeId, reason: 'not_found' });
      continue;
    }
    // Ownership guard — never fund another employer's staff.
    if (emp.employerId !== employerId) {
      skipped.push({ employeeId, reason: 'not_owned' });
      continue;
    }
    const derived = mockLineFor(emp);
    if (derived.skip) {
      skipped.push({ employeeId, reason: derived.skip });
      continue;
    }

    const lineId = `crl-mock-${Date.now()}-${lines.length + 1}`;
    lines.push({
      id: lineId,
      runId,
      employeeId,
      employerAmount: derived.employerHalf,
      employeeAmount: derived.employeeHalf,
      retirementAmount: derived.retirement,
      emergencyAmount: derived.emergency,
      method: method ?? null,
    });

    // Bump the employee's session balance-deltas (the ONLY balance write).
    const m = readEmployeeSession(employeeId);
    m.balanceDelta.retirement += derived.retirement;
    m.balanceDelta.emergency += derived.emergency;
    m.balanceDelta.net += derived.gross;
    m.balanceDelta.units += derived.gross / EMPLOYER_UNIT_PRICE;
    m.balanceDelta.totalContributions += derived.gross;

    employerTotal += derived.employerHalf;
    employeeTotal += derived.employeeHalf;
    grandTotal += derived.gross;
  }

  let finalRunId = runId;
  if (lines.length > 0) {
    _mockRuns = [
      {
        id: runId,
        employerId,
        periodLabel: periodLabel ?? null,
        status: 'completed',
        employerTotal,
        employeeTotal,
        grandTotal,
        runAt: currentTime().toISOString(),
      },
      ..._mockRuns,
    ];
    _mockRunLines = [...lines, ..._mockRunLines];
  } else {
    finalRunId = null;
  }

  const result = {
    runId: finalRunId,
    linesCreated: lines.length,
    employerTotal,
    employeeTotal,
    grandTotal,
    skipped,
  };
  if (nonce) _mockNonceResults.set(nonce, result);
  return result;
}

// =============================================================================
// Reads
// =============================================================================

/**
 * @endpoint SELECT * FROM employers WHERE id = $1 (RLS auto-scopes to self).
 * @param {string} id - employer ID ('emp-001').
 * @returns {Promise<Object|null>} mapped employer, or null.
 * @cache ['employer', id]
 */
export async function getEmployer(id) {
  if (!IS_SUPABASE_ENABLED) {
    if (id && EMPLOYER.id !== id) return null;
    return { ...EMPLOYER, ...(_mockEmployerOverride ?? {}) };
  }
  const { data, error } = await supabase
    .from('employers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapEmployer(data);
}

/**
 * @endpoint SELECT * FROM employees WHERE employer_id = $1 (RLS auto-scopes).
 * @param {string} employerId
 * @returns {Promise<Array<Object>>}
 * @cache ['employees', employerId]
 */
export async function getEmployees(employerId) {
  if (!IS_SUPABASE_ENABLED) {
    if (!employerId) return mockEmployees();
    return mockEmployees().filter((e) => e.employerId === employerId);
  }
  if (!employerId) return [];
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('employer_id', employerId);
  if (error) throw error;
  return (data ?? []).map(mapEmployee);
}

/**
 * @endpoint SELECT * FROM employees WHERE id = $1 (RLS auto-scopes).
 * @param {string} employeeId
 * @returns {Promise<Object|null>}
 * @cache ['employee', employeeId]
 */
export async function getEmployee(employeeId) {
  if (!IS_SUPABASE_ENABLED) {
    if (!employeeId) return null;
    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    return emp ? applyEmployeeMutations(emp) : null;
  }
  if (!employeeId) return null;
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return mapEmployee(data);
}

/**
 * @endpoint SELECT * FROM contribution_runs WHERE employer_id = $1 (RLS).
 * @param {string} employerId
 * @returns {Promise<Array<Object>>} newest-first.
 * @cache ['contributionRuns', employerId]
 */
export async function getContributionRuns(employerId) {
  if (!IS_SUPABASE_ENABLED) {
    if (!employerId) return mockRuns();
    return mockRuns().filter((r) => r.employerId === employerId);
  }
  if (!employerId) return [];
  const { data, error } = await supabase
    .from('contribution_runs')
    .select('*')
    .eq('employer_id', employerId)
    .order('run_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRun);
}

/**
 * @endpoint SELECT a run header + its lines (RLS auto-scopes).
 * @param {string} runId
 * @returns {Promise<{run: Object, lines: Array<Object>}|null>}
 * @cache ['contributionRun', runId]
 */
export async function getContributionRun(runId) {
  if (!IS_SUPABASE_ENABLED) {
    if (!runId) return null;
    const run = mockRuns().find((r) => r.id === runId);
    if (!run) return null;
    return { run, lines: mockRunLines(runId) };
  }
  if (!runId) return null;
  const { data: runRow, error: runErr } = await supabase
    .from('contribution_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (runErr) {
    if (runErr.code === 'PGRST116') return null;
    throw runErr;
  }
  if (!runRow) return null;
  const { data: lineRows, error: lineErr } = await supabase
    .from('contribution_run_lines')
    .select('*')
    .eq('run_id', runId);
  if (lineErr) throw lineErr;
  return {
    run: mapRun(runRow),
    lines: (lineRows ?? []).map(mapRunLine),
  };
}

/**
 * @endpoint SELECT contribution_run_lines for ONE employee, joined to the run
 *   header for the period label + run date (RLS auto-scopes via the run join —
 *   a line is only visible if its run belongs to the caller's employer).
 *   Newest run first. Mock filters `CONTRIBUTION_RUN_LINES` (+ session lines)
 *   by employeeId and joins to the run period/date the same way.
 * @param {string} employeeId
 * @returns {Promise<Array<{ id, runId, employeeId, employerAmount,
 *   employeeAmount, retirementAmount, emergencyAmount, method, periodLabel,
 *   runAt }>>} newest-first.
 * @cache ['employeeContributions', employeeId]
 */
export async function getEmployeeContributions(employeeId) {
  if (!IS_SUPABASE_ENABLED) {
    if (!employeeId) return [];
    const runById = Object.fromEntries(mockRuns().map((r) => [r.id, r]));
    const seedLines = CONTRIBUTION_RUN_LINES.filter((l) => l.employeeId === employeeId);
    const sessionLines = _mockRunLines.filter((l) => l.employeeId === employeeId);
    return [...sessionLines, ...seedLines]
      .map((l) => {
        const run = runById[l.runId] ?? null;
        return {
          ...mapRunLine(l),
          periodLabel: run?.periodLabel ?? null,
          runAt: run?.runAt ?? null,
        };
      })
      .sort((a, b) => String(b.runAt ?? '').localeCompare(String(a.runAt ?? '')));
  }
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from('contribution_run_lines')
    .select('*, contribution_runs(period_label, run_at)')
    .eq('employee_id', employeeId);
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({
      ...mapRunLine(row),
      periodLabel: row.contribution_runs?.period_label ?? null,
      runAt: row.contribution_runs?.run_at ?? null,
    }))
    .sort((a, b) => String(b.runAt ?? '').localeCompare(String(a.runAt ?? '')));
}

/**
 * @endpoint RPC get_employer_metrics() (Supabase) — aggregates for the
 *   hero/overview. Mock computes the identical shape from the seed.
 * @returns {Promise<{
 *   headcount:number, active:number, suspended:number,
 *   totalBalance:number, totalContributions:number, insuredCount:number,
 *   employerYtd:number, employeeYtd:number,
 *   modeSplit:{ coContribution:number, employerOnly:number },
 * }>}
 * @cache ['employerMetrics', employerId]
 */
export async function getEmployerMetrics() {
  if (!IS_SUPABASE_ENABLED) {
    const emps = mockEmployees();
    const headcount = emps.length;
    const active = emps.filter((e) => e.status === 'active').length;
    const suspended = emps.filter((e) => e.status === 'suspended').length;
    const totalBalance = emps.reduce((s, e) => s + (e.netBalance || 0), 0);
    const totalContributions = emps.reduce((s, e) => s + (e.totalContributions || 0), 0);
    const insuredCount = emps.filter((e) => e.insuranceStatus === 'active').length;
    const coContribution = emps.filter((e) => (e.contributionConfig?.mode) === 'co-contribution').length;
    const employerOnly = headcount - coContribution;
    // YTD = sum over runs in the current calendar year (demo clock).
    const year = currentTime().getFullYear();
    const runsThisYear = mockRuns().filter((r) => {
      const y = new Date(r.runAt).getFullYear();
      return y === year;
    });
    const employerYtd = runsThisYear.reduce((s, r) => s + (r.employerTotal || 0), 0);
    const employeeYtd = runsThisYear.reduce((s, r) => s + (r.employeeTotal || 0), 0);
    return {
      headcount,
      active,
      suspended,
      totalBalance,
      totalContributions,
      insuredCount,
      employerYtd,
      employeeYtd,
      modeSplit: { coContribution, employerOnly },
    };
  }
  const { data, error } = await supabase.rpc('get_employer_metrics');
  if (error) throw error;
  return data ?? {};
}

/**
 * Monthly-contributions leaderboard for the Overview hero — the caller's own
 * "this month" total ranked against a field of peer employers.
 *
 * Dual-path by construction: the employer's OWN figure is the NEWEST
 * contribution run's `grandTotal`, read through `getContributionRuns` so the
 * number is byte-identical on the Supabase and mock branches (runs exist on
 * both). That "you" entry is merged with the seeded `LEADERBOARD_COMPETITORS`
 * (invented demo peers — see employerSeed.js), sorted by `monthlyTotal`
 * descending, and assigned a 1-based `rank`.
 *
 * `deltaRanks` is a static seeded "↑2" on the employer's own row — an honest
 * mock: there is no historical-rank store to diff against, so we don't fabricate
 * a per-competitor movement (competitors report 0).
 *
 * @future A `get_employer_leaderboard()` RPC would replace the seeded peers by
 *   aggregating `SUM(contribution_runs.grand_total)` per employer for the
 *   current calendar month across ALL employers, tagging `isYou` from the
 *   `employerId` JWT claim (and could derive a real `deltaRanks` from a
 *   prior-month snapshot). No SQL is needed now — the demo runs entirely off the
 *   seed + the caller's own runs.
 *
 * @param {string} employerId
 * @returns {Promise<Array<{ rank:number, name:string, monthlyTotal:number,
 *   isYou:boolean, deltaRanks:number }>>} ranked best-first.
 * @cache ['employerLeaderboard', employerId]
 */
export async function getEmployerLeaderboard(employerId) {
  if (!employerId) return [];

  // OWN "this month" = newest run's grandTotal. Reuse getContributionRuns so the
  // figure is identical on both paths (it already RLS/ownership-scopes the runs).
  const runs = await getContributionRuns(employerId);
  const myMonthly = runs[0]?.grandTotal ?? 0;

  // The employer's display name (best-effort; falls back to a neutral label so
  // the chip never renders an empty company name).
  const me = await getEmployer(employerId);
  const myName = me?.name || 'Your company';

  const entries = [
    { name: myName, monthlyTotal: myMonthly, isYou: true, deltaRanks: 2 },
    ...LEADERBOARD_COMPETITORS.map((c) => ({
      name: c.name,
      monthlyTotal: c.monthlyTotal,
      isYou: false,
      deltaRanks: 0,
    })),
  ];

  return entries
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// =============================================================================
// Writes — Supabase via 0035 SECURITY DEFINER RPCs; mock via session store.
// =============================================================================

/**
 * Submits a contribution run. NON-optimistic — the server (RPC) is the truth.
 * The server RE-DERIVES every amount from employees.salary + contribution_config
 * (client amounts are advisory). Idempotent via `nonce`.
 *
 * @param {string} employerId - caller's employer (used by the mock ownership
 *   guard; under Supabase the RPC reads it from the JWT claim).
 * @param {{ rows: Array<{employeeId:string}>, periodLabel?:string,
 *           method?:string, nonce?:string }} payload
 * @returns {Promise<{ runId:string|null, linesCreated:number,
 *   employerTotal:number, employeeTotal:number, grandTotal:number,
 *   skipped:Array<{employeeId:string, reason:string}> }>}
 */
export async function submitContributionRun(employerId, { rows, periodLabel, method, nonce } = {}) {
  if (!IS_SUPABASE_ENABLED) {
    return _mockSubmitContributionRun(employerId, { rows, periodLabel, method, nonce });
  }
  const { data, error } = await supabase.rpc('submit_contribution_run', {
    p_rows: rows,
    p_period_label: periodLabel ?? null,
    p_method: method ?? null,
    p_nonce: nonce ?? null,
  });
  if (error) throw error;
  return data;
}

/**
 * Replaces an employee's contribution config.
 * @param {string} employeeId
 * @param {Object} config - { mode, employerPct, employeePct, employerAmount, employeeAmount }
 * @returns {Promise<Object>} the updated employee (mapped).
 */
export async function updateEmployeeContributionConfig(employeeId, config) {
  if (!IS_SUPABASE_ENABLED) {
    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    if (!emp) throw new Error('Employee not found');
    readEmployeeSession(employeeId).configOverride = config;
    return applyEmployeeMutations(emp);
  }
  const { data, error } = await supabase.rpc('update_employee_contribution_config', {
    p_employee_id: employeeId,
    p_config: config,
  });
  if (error) throw error;
  return mapEmployee(data);
}

/**
 * Sets an employee's insurance cover + monthly premium. Status derives from
 * cover (>0 → 'active').
 * @param {string} employeeId
 * @param {{ cover:number, premium:number }} payload
 * @returns {Promise<Object>} the updated employee (mapped).
 */
export async function updateEmployeeInsurance(employeeId, { cover, premium } = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    if (!emp) throw new Error('Employee not found');
    const active = Number(cover ?? 0) > 0;
    readEmployeeSession(employeeId).insuranceOverride = {
      cover: Number(cover ?? 0),
      premium: Number(premium ?? 0),
      status: active ? 'active' : 'inactive',
      // Demo: keep the seed renewal date if present (derivePolicyStatus reused
      // by later phases to render active/expired).
      renewalDate: emp.insuranceRenewalDate,
    };
    return applyEmployeeMutations(emp);
  }
  const { data, error } = await supabase.rpc('update_employee_insurance', {
    p_employee_id: employeeId,
    p_cover: Number(cover ?? 0),
    p_premium: Number(premium ?? 0),
  });
  if (error) throw error;
  return mapEmployee(data);
}

/**
 * Patches the caller's own employer profile row. Only editable
 * profile/config keys are honoured server-side.
 * @param {Object} patch - { name?, sector?, registrationNo?, contactName?,
 *   contactPhone?, contactEmail?, district?, payrollCadence?,
 *   defaultContributionConfig? }
 * @returns {Promise<Object>} the updated employer (mapped).
 */
export async function updateEmployerProfile(patch) {
  if (!IS_SUPABASE_ENABLED) {
    _mockEmployerOverride = { ...(_mockEmployerOverride ?? {}), ...patch };
    return { ...EMPLOYER, ..._mockEmployerOverride };
  }
  const { data, error } = await supabase.rpc('update_employer_profile', {
    p_patch: patch ?? {},
  });
  if (error) throw error;
  return mapEmployer(data);
}

// Re-export the data sources the mock fallback touches so static analysis
// flags any future drift (no callers; mirrors entities.js `_mockSources`).
export const _employerMockSources = {
  EMPLOYER,
  EMPLOYEES,
  CONTRIBUTION_RUNS,
  CONTRIBUTION_RUN_LINES,
};
