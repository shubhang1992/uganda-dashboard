// CSV export utility — generates and downloads CSV files from structured data.
//
// Two surfaces:
//   1. `downloadCSV(filename, headers, rows)` — legacy browser-side download
//      used by every report view in the Distributor + Subscriber dashboards.
//      RFC 4180 escape + OWASP formula-injection defence + UTF-8 BOM.
//   2. `toCsv(rows, columns)` / `toCsvStream(rows, columns)` — pure
//      string/AsyncIterable producers for the audit-remediation pass. These
//      separate serialisation from the DOM so we can unit-test escape behaviour
//      and stream large exports without holding the full document in memory.
//
// Caller responsibility:
//   - `toCsv` enforces `MAX_ROWS` (5,000) to keep client memory bounded.
//   - `toCsvStream` does NOT enforce a row cap — the caller decides chunking.

/** Maximum rows accepted by `toCsv()` before throwing. */
export const MAX_ROWS = 5_000;

// Cells starting with these characters can be interpreted as formulas in
// Excel / Google Sheets / LibreOffice Calc, so we prefix them with a single
// quote and quote-wrap the cell. See OWASP CSV injection.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

const UTF8_BOM = '﻿';
const RFC4180_NEWLINE = '\r\n';

/**
 * Escape a CSV cell value: wrap in quotes if it contains commas, quotes, or
 * newlines (RFC 4180), and defuse Excel formula injection by prefixing
 * dangerous leads. Coerces null/undefined to empty string.
 */
function escapeCell(value) {
  const str = String(value ?? '');
  if (FORMULA_TRIGGERS.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a single CSV row from a record + column definition.
 *
 * @param {object} row
 * @param {Array<{key: string, label: string}>} columns
 * @returns {string}
 */
function buildRow(row, columns) {
  return columns.map((col) => escapeCell(row?.[col.key])).join(',');
}

/**
 * Build the header line (with leading UTF-8 BOM).
 *
 * @param {Array<{key: string, label: string}>} columns
 * @returns {string}
 */
function buildHeader(columns) {
  return UTF8_BOM + columns.map((col) => escapeCell(col.label)).join(',');
}

/**
 * Serialise an array of records into a CSV string. Memory-safe by hard cap.
 *
 * @param {Array<object>} rows
 * @param {Array<{key: string, label: string}>} columns
 * @returns {string}
 * @throws {Error} `CSV_ROW_CAP_EXCEEDED` when `rows.length > MAX_ROWS`.
 */
export function toCsv(rows, columns) {
  if (!Array.isArray(rows)) {
    throw new TypeError('toCsv: rows must be an array');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('toCsv: columns must be a non-empty array');
  }
  if (rows.length > MAX_ROWS) {
    throw new Error('CSV_ROW_CAP_EXCEEDED');
  }

  const lines = [buildHeader(columns), ...rows.map((row) => buildRow(row, columns))];
  return lines.join(RFC4180_NEWLINE);
}

/**
 * Stream CSV output as an async iterable of strings. The producer yields:
 *
 *   1. Header line (with leading BOM and trailing `\r\n`)
 *   2. Each data row (with trailing `\r\n`)
 *   3. A final empty chunk as an end-of-file marker
 *
 * No row cap — the caller decides chunking. Suitable for piping into a
 * `ReadableStream` (web) or `Writable` (node) without ever holding the full
 * document in memory.
 *
 * @param {AsyncIterable<object>|Iterable<object>} rows
 * @param {Array<{key: string, label: string}>} columns
 * @returns {AsyncIterable<string>}
 */
export async function* toCsvStream(rows, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('toCsvStream: columns must be a non-empty array');
  }
  if (rows == null || typeof rows[Symbol.asyncIterator] !== 'function' && typeof rows[Symbol.iterator] !== 'function') {
    throw new TypeError('toCsvStream: rows must be (async-)iterable');
  }

  yield buildHeader(columns) + RFC4180_NEWLINE;

  for await (const row of rows) {
    yield buildRow(row, columns) + RFC4180_NEWLINE;
  }

  // EOF marker — consumers can use this to flush + close the underlying
  // sink without inferring it from iterator-done. Empty string is benign
  // when written to a sink that already received `\r\n`-terminated rows.
  yield '';
}

/**
 * Browser-side download helper — retained for legacy callers that pass
 * `headers: string[]` + `rows: string[][]`. New callers should compose
 * `toCsv()` with their own download trigger.
 *
 * @param {string} filename - File name including .csv extension
 * @param {string[]} headers - Column header labels
 * @param {string[][]} rows - Array of row arrays (each cell is a string)
 */
export function downloadCSV(filename, headers, rows) {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  const csvString = lines.join(RFC4180_NEWLINE);

  const blob = new Blob([UTF8_BOM + csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}
