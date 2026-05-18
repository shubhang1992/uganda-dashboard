// CSV download orchestrator — composes `toCsv` / `toCsvStream` from
// `src/utils/csv.js` with the browser-side Blob + invisible `<a download>`
// trigger. Two surfaces today:
//
//   1. `src/dashboard/reports/ReportView.jsx` — distributor report exports.
//   2. `src/dashboard/commissions/CommissionPanel.jsx` — agent commission
//      detail "Download" button.
//
// Behaviour follows §6.C of the audit-remediation plan:
//   - If running on a mobile UA AND the dataset exceeds `MOBILE_ROW_CAP`,
//     truncate to the cap and surface a toast warning via the optional
//     `onCapNotice` callback so callers can wire it to their toast system
//     without forcing this util to import the ToastContext directly.
//   - If rows > `STREAM_THRESHOLD`, build the CSV via `toCsvStream` so the
//     async-iterable path is exercised. The string chunks are still
//     concatenated into a single Blob — the helper's value here is keeping
//     the streaming API hot rather than forking a separate large-file path.
//   - Otherwise the regular `toCsv` synchronous serialiser is used.
//
// The actual download trigger is the standard hidden-anchor pattern:
//   - `Blob` with `text/csv;charset=utf-8` MIME (BOM is already in the
//     serialiser output via `csv.js`).
//   - `URL.createObjectURL(blob)`.
//   - Hidden `<a download>` appended to `document.body`, clicked, removed.
//   - `URL.revokeObjectURL(url)` scheduled via `setTimeout(..., 0)` — the
//     brief specifies "0" rather than the legacy 100ms because the anchor
//     has already kicked off the browser download by the time the click
//     handler returns. Holding the URL longer is wasted memory.

import { toCsv, toCsvStream, MAX_ROWS } from './csv';

/** Row cap for mobile UA exports. Matches the brief: "cap at 5,000 + toast". */
export const MOBILE_ROW_CAP = 5_000;

/** Above this threshold we exercise the streaming serialiser. */
export const STREAM_THRESHOLD = MAX_ROWS;

/**
 * Build a date-stamped filename in `{slug}-{YYYY-MM-DD}.csv` form.
 *
 * @param {string} slug
 * @returns {string}
 */
export function dateStampedFilename(slug) {
  const safe = String(slug || 'export').trim().toLowerCase().replace(/\s+/g, '-');
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${safe}-${yyyy}-${mm}-${dd}.csv`;
}

/**
 * Trigger a CSV download in the browser.
 *
 * @param {object} args
 * @param {Array<object>} args.rows — Data rows.
 * @param {Array<{key: string, label: string}>} args.columns — Column config.
 * @param {string} args.filename — `{slug}` portion; date stamp + `.csv`
 *   extension are appended by `dateStampedFilename`.
 * @param {boolean} [args.isMobile=false] — Caller-detected mobile UA flag.
 *   When `true` AND rows > cap, the export is truncated to `MOBILE_ROW_CAP`
 *   and `onCapNotice` (if provided) is invoked.
 * @param {(info: { capped: number, total: number }) => void} [args.onCapNotice]
 *   Optional callback fired when mobile capping kicks in. Wire to your
 *   toast system: `onCapNotice: ({ capped, total }) => addToast('warning', …)`.
 * @returns {Promise<void>}
 */
export async function downloadCsv({ rows, columns, filename, isMobile = false, onCapNotice }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // SSR guard — silently no-op rather than throwing. Callers in this repo
    // are all client-only but this keeps the util defensive.
    return;
  }
  if (!Array.isArray(rows) || !Array.isArray(columns) || columns.length === 0) {
    return;
  }

  // Step 1 — apply the mobile cap if needed.
  let effectiveRows = rows;
  const totalCount = rows.length;
  if (isMobile && totalCount > MOBILE_ROW_CAP) {
    effectiveRows = rows.slice(0, MOBILE_ROW_CAP);
    if (typeof onCapNotice === 'function') {
      onCapNotice({ capped: MOBILE_ROW_CAP, total: totalCount });
    }
  }

  // Step 2 — serialise. The streaming path is used as the brief specifies
  // even though we still concatenate into a single Blob: it keeps the async
  // iterable surface alive for any future caller that pipes into a sink.
  let csv;
  if (effectiveRows.length > STREAM_THRESHOLD) {
    const chunks = [];
    for await (const chunk of toCsvStream(effectiveRows, columns)) {
      if (chunk) chunks.push(chunk);
    }
    csv = chunks.join('');
  } else {
    csv = toCsv(effectiveRows, columns);
  }

  // Step 3 — kick off the browser download. The serialiser already prefixes
  // the UTF-8 BOM, so the Blob mime type is the standard text/csv flavour.
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = dateStampedFilename(filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Per the brief: revoke the object URL on the next tick. The browser has
  // already started the download by the time the click handler returns, so
  // holding the URL alive longer is just memory.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
