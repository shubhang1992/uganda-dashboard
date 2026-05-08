/**
 * Settlement-cycle helpers.
 *
 * The cadence (weekly / bi-weekly / monthly) is set network-wide by the
 * distributor admin and fetched via `useNetworkCadence`. These helpers are
 * pure date-math utilities; they take a cadence string as an argument and
 * compute window boundaries / labels for any date input.
 */

export const CADENCES = Object.freeze({
  WEEKLY_FRIDAY: 'weekly-friday',
  BIWEEKLY_FRIDAY: 'biweekly-friday',
  MONTHLY_FIRST: 'monthly-first',
});

const DEFAULT_CADENCE = CADENCES.MONTHLY_FIRST;

const CADENCE_LABEL = {
  [CADENCES.WEEKLY_FRIDAY]: 'Weekly · every Friday',
  [CADENCES.BIWEEKLY_FRIDAY]: 'Bi-weekly · every other Friday',
  [CADENCES.MONTHLY_FIRST]: 'Monthly · 1st of every month',
};

const CADENCE_SHORT = {
  [CADENCES.WEEKLY_FRIDAY]: 'Weekly',
  [CADENCES.BIWEEKLY_FRIDAY]: 'Bi-weekly',
  [CADENCES.MONTHLY_FIRST]: 'Monthly',
};

const FRIDAY = 5;
const MS_DAY = 86400000;

export function cadenceLabel(cadence) {
  return CADENCE_LABEL[cadence] || CADENCE_LABEL[DEFAULT_CADENCE];
}

export function cadenceShortLabel(cadence) {
  return CADENCE_SHORT[cadence] || CADENCE_SHORT[DEFAULT_CADENCE];
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function nextOrSameWeekday(from, weekday) {
  const d = startOfDay(from);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Returns the date the upcoming cycle closes — i.e. the day commissions in
 * the current window will be paid out.
 *  - Monthly: last day of the current month at end-of-day.
 *  - Weekly: the next Friday (today if today is Friday) at end-of-day.
 *  - Bi-weekly: the next Friday on the agent's bi-weekly grid.
 */
export function nextCycleEnd(cadence, now = new Date()) {
  const ref = new Date(now);
  if (cadence === CADENCES.MONTHLY_FIRST) {
    return endOfDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
  }
  if (cadence === CADENCES.WEEKLY_FRIDAY) {
    return endOfDay(nextOrSameWeekday(ref, FRIDAY));
  }
  if (cadence === CADENCES.BIWEEKLY_FRIDAY) {
    // Even ISO-weeks anchor: cycles fall on Fridays of even-numbered weeks.
    const friday = nextOrSameWeekday(ref, FRIDAY);
    const isoWeek = getIsoWeek(friday);
    if (isoWeek % 2 === 0) return endOfDay(friday);
    const next = new Date(friday);
    next.setDate(next.getDate() + 7);
    return endOfDay(next);
  }
  return nextCycleEnd(DEFAULT_CADENCE, ref);
}

/**
 * Window covering the upcoming payout cycle: { start, end }. `start` is the
 * day after the previous cycle ended (or the natural cycle start) and `end`
 * matches `nextCycleEnd`.
 */
export function cycleWindow(cadence, ref = new Date()) {
  const end = nextCycleEnd(cadence, ref);
  let start;
  if (cadence === CADENCES.MONTHLY_FIRST) {
    start = startOfDay(new Date(end.getFullYear(), end.getMonth(), 1));
  } else if (cadence === CADENCES.WEEKLY_FRIDAY) {
    start = startOfDay(new Date(end.getTime() - 6 * MS_DAY));
  } else if (cadence === CADENCES.BIWEEKLY_FRIDAY) {
    start = startOfDay(new Date(end.getTime() - 13 * MS_DAY));
  } else {
    start = startOfDay(new Date(end.getFullYear(), end.getMonth(), 1));
  }
  return { start, end };
}

/**
 * Long, human label for a cycle end-date.
 *   monthly  → "May 2026"
 *   weekly   → "Week of May 24 – 30"
 *   biweekly → "Two weeks ending May 30"
 */
export function formatCycleLabel(end, cadence) {
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return '—';
  if (cadence === CADENCES.MONTHLY_FIRST) {
    return end.toLocaleDateString('en-UG', { month: 'long', year: 'numeric' });
  }
  if (cadence === CADENCES.WEEKLY_FRIDAY) {
    const start = new Date(end.getTime() - 6 * MS_DAY);
    const startTxt = start.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
    const endTxt = end.toLocaleDateString('en-UG', { day: 'numeric' });
    return `Week of ${startTxt} – ${endTxt}`;
  }
  if (cadence === CADENCES.BIWEEKLY_FRIDAY) {
    return `Two weeks ending ${end.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}`;
  }
  return formatCycleLabel(end, DEFAULT_CADENCE);
}

/** Short label for the next-payout date (inline use). */
export function formatPayoutDate(end) {
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return '—';
  return end.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Buckets paid commissions into past cycles by their `paidDate`.
 * Returns newest cycle first.
 */
export function groupCommissionsByPaidCycle(commissions, cadence) {
  const groups = new Map();
  for (const c of commissions || []) {
    const paid = c?.paidDate ? new Date(c.paidDate) : null;
    if (!paid || Number.isNaN(paid.getTime())) continue;
    const anchor = cycleAnchorFor(paid, cadence);
    const key = anchor.toISOString().slice(0, 10);
    if (!groups.has(key)) {
      const win = cycleWindowEnding(anchor, cadence);
      groups.set(key, {
        key,
        start: win.start,
        end: anchor,
        label: formatCycleLabel(anchor, cadence),
        commissions: [],
        total: 0,
      });
    }
    const g = groups.get(key);
    g.commissions.push(c);
    g.total += c.amount || 0;
  }
  return Array.from(groups.values()).sort((a, b) => b.end.getTime() - a.end.getTime());
}

/** The cycle-anchor (end-of-cycle date) for any timestamp. */
function cycleAnchorFor(date, cadence) {
  if (cadence === CADENCES.MONTHLY_FIRST) {
    return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  }
  if (cadence === CADENCES.WEEKLY_FRIDAY) {
    return endOfDay(nextOrSameWeekday(date, FRIDAY));
  }
  if (cadence === CADENCES.BIWEEKLY_FRIDAY) {
    const friday = nextOrSameWeekday(date, FRIDAY);
    const isoWeek = getIsoWeek(friday);
    if (isoWeek % 2 === 0) return endOfDay(friday);
    const prev = new Date(friday);
    prev.setDate(prev.getDate() - 7);
    return endOfDay(prev);
  }
  return cycleAnchorFor(date, DEFAULT_CADENCE);
}

function cycleWindowEnding(end, cadence) {
  let start;
  if (cadence === CADENCES.MONTHLY_FIRST) {
    start = startOfDay(new Date(end.getFullYear(), end.getMonth(), 1));
  } else if (cadence === CADENCES.WEEKLY_FRIDAY) {
    start = startOfDay(new Date(end.getTime() - 6 * MS_DAY));
  } else if (cadence === CADENCES.BIWEEKLY_FRIDAY) {
    start = startOfDay(new Date(end.getTime() - 13 * MS_DAY));
  } else {
    start = startOfDay(new Date(end.getFullYear(), end.getMonth(), 1));
  }
  return { start, end };
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / MS_DAY + 1) / 7);
}
