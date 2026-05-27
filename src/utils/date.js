/**
 * Date formatting — single source of truth for user-visible date strings.
 *
 * Replaces the dozens of ad-hoc `new Date(x).toLocaleDateString('en-UG', {...})`
 * snippets scattered across the codebase. Accepts a `Date`, an ISO string,
 * a millisecond timestamp, or any value `new Date(...)` can parse. Returns
 * an em-dash for unparseable / null / undefined input so the UI never shows
 * "Invalid Date".
 */

const LOCALE = 'en-UG';

const SHORT_OPTS = Object.freeze({ day: 'numeric', month: 'short', year: 'numeric' });
const LONG_OPTS = Object.freeze({ day: 'numeric', month: 'long', year: 'numeric' });
const TIME_OPTS = Object.freeze({ hour: '2-digit', minute: '2-digit' });
const MONTH_YEAR_OPTS = Object.freeze({ month: 'long', year: 'numeric' });
const SHORT_MONTH_YEAR_OPTS = Object.freeze({ month: 'short', year: 'numeric' });
const DAY_MONTH_OPTS = Object.freeze({ day: 'numeric', month: 'short' });

const VARIANTS = {
  short: SHORT_OPTS,                       // "8 Apr 2026"
  long: LONG_OPTS,                         // "8 April 2026"
  time: TIME_OPTS,                         // "14:32"
  'month-year': MONTH_YEAR_OPTS,           // "April 2026"
  'short-month-year': SHORT_MONTH_YEAR_OPTS, // "Apr 2026"
  'day-month': DAY_MONTH_OPTS,             // "8 Apr"
};

function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date-like value.
 *
 * @param {Date | string | number | null | undefined} value
 * @param {{ variant?: 'short' | 'long' | 'time' | 'month-year' | 'day-month' }} [options]
 * @returns {string} formatted string, or "—" when the value is unparseable
 */
export function formatDate(value, options = {}) {
  const { variant = 'short' } = options;
  const d = toDate(value);
  if (!d) return '—';
  const opts = VARIANTS[variant] ?? SHORT_OPTS;
  if (variant === 'time') return d.toLocaleTimeString(LOCALE, opts);
  return d.toLocaleDateString(LOCALE, opts);
}
