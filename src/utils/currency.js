/**
 * Currency formatting — single source of truth for UGX rendering.
 *
 * Replaces the historical pair `formatUGX` (compact, "UGX 1.2M") and
 * `formatUGXExact` (full, "UGX 50,000") plus the dozens of ad-hoc
 * `Math.round(n).toLocaleString('en-UG')` snippets scattered across the
 * codebase. Use this module everywhere money is rendered to the user.
 *
 * Behaviour preserved from the legacy helpers:
 *   - Compact mode returns '—' for non-positive / non-finite values
 *     (so hero figures don't render "UGX 0K").
 *   - Exact mode returns 'UGX 0' for non-positive / non-finite values
 *     (so form summaries still show a deterministic baseline).
 */

const LOCALE = 'en-UG';

/**
 * Format a UGX number.
 *
 * @param {number | null | undefined} value
 * @param {{ compact?: boolean }} [options]
 *   - compact (default `true`) → "UGX 1.2M" rounded short form
 *   - compact `false`           → "UGX 50,000" full precision
 * @returns {string}
 */
export function formatUGX(value, options = {}) {
  const { compact = true } = options;
  const n = Number(value);

  if (compact) {
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e9) return `UGX ${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `UGX ${(n / 1e6).toFixed(1)}M`;
    // Below 1,000 the "K" form would round to a misleading "UGX 0K" / "UGX 1K";
    // show the exact rounded amount instead. >= 1000 behaviour is unchanged.
    if (n < 1e3) return `UGX ${Math.round(n).toLocaleString(LOCALE)}`;
    return `UGX ${(n / 1e3).toFixed(0)}K`;
  }

  if (!Number.isFinite(n) || n <= 0) return 'UGX 0';
  return `UGX ${Math.round(n).toLocaleString(LOCALE)}`;
}

/**
 * Format a raw integer with locale grouping ("12,345"). Use for counts,
 * not money.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString(LOCALE);
}

/**
 * Short form *without* "UGX" prefix (e.g. "1.2M"). Useful for axis labels
 * and dense KPI strips. Preserves the legacy `fmtShort` shape.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatUGXShort(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  // Below 1,000 the "K" form would round to a misleading "0K" / "1K"; show the
  // exact rounded amount instead (mirrors the formatUGX guard). >= 1000 unchanged.
  if (n < 1e3) return `${Math.round(n).toLocaleString(LOCALE)}`;
  return `${(n / 1e3).toFixed(0)}K`;
}
