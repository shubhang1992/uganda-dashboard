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

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Compact relative-time label for list rows / inbox previews, e.g. "now",
 * "5m", "3h", "yesterday", "4d", "2w", or a short date once the gap exceeds a
 * month. Tuned for past timestamps (a ticket's `updatedAt`); future values
 * collapse to "now".
 *
 * The reference instant defaults to the wall clock. Callers that render
 * MOCK_NOW-anchored demo data may pass their own `now` (a Date / ISO string /
 * timestamp) so "3d" copy stays stable — utilities never import the mock store,
 * so the anchor is always supplied from outside (CLAUDE.md §4).
 *
 * @param {Date | string | number | null | undefined} value
 * @param {{ now?: Date | string | number }} [options]
 * @returns {string} relative label, or "—" when the value is unparseable
 */
export function formatRelativeTime(value, options = {}) {
  const d = toDate(value);
  if (!d) return '—';
  const ref = toDate(options.now) ?? new Date();

  const diff = ref.getTime() - d.getTime();
  if (diff < MINUTE_MS) return 'now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
  if (diff < 2 * DAY_MS) return 'yesterday';
  if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d`;
  if (diff < 4 * WEEK_MS) return `${Math.floor(diff / WEEK_MS)}w`;
  // Older than a month: a short date reads better than a large week count.
  return formatDate(d, { variant: 'day-month' });
}
