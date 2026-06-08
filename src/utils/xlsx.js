// Excel (.xlsx) read/write utility — client-side workbook generation +
// parsing built on SheetJS (`xlsx`). Mirrors the structure / naming / SSR-safe
// download approach of `src/utils/csvDownload.js`.
//
// Used by the distributor commission panel to (a) download a prefilled
// settlement template and (b) parse the re-uploaded `.xlsx` file back into row
// objects. Everything here is client-side — there is no server route.
//
// Bundle-size note: `xlsx` is ~400KB+, so it is pulled in via a lazy/dynamic
// `import('xlsx')` INSIDE each function rather than a top-level static import.
// That keeps it out of the cold-load bundle (it only loads when a user actually
// downloads or uploads a settlement file). `vite.config.js` also carves a
// `vendor-xlsx` manual chunk as a safety net in case anything ever references
// it statically. Both mechanisms coexist; the dynamic import is primary.
//
// The download trigger is the standard hidden-anchor pattern, identical to
// `csvDownload.js`: Blob → `URL.createObjectURL` → hidden `<a download>` →
// click → remove → revoke on the next tick. SSR-safe via a `document` guard.

const DEFAULT_SHEET_NAME = 'Sheet1';

// ── Parse hardening (C2 / B-Excel / BL-14 defense-in-depth) ──────────────────
// Defensive bounds applied BEFORE handing bytes to SheetJS. The `xlsx`
// dependency is now the SheetJS-maintained CDN build (xlsx-0.20.3 from
// cdn.sheetjs.com, pinned in package.json) — it carries the prototype-pollution
// + ReDoS fixes the abandoned npm 0.18.5 build never received (BL-14). These
// caps are kept as defense-in-depth: they bound the blast radius of a large /
// crafted workbook regardless of the parser version.
//
//   - MAX_UPLOAD_BYTES — a per-agent settlement template is tiny (a few KB);
//     5 MB is generous headroom while rejecting anything that could hang the
//     tab or feed the ReDoS path a large string.
//   - MAX_PARSE_ROWS — passed to `XLSX.read({ sheetRows })` so the parser stops
//     after a sane row count rather than walking an implausibly tall sheet.
//   - ALLOWED_EXTENSIONS / spreadsheet MIME types — the file input's `accept`
//     attribute is a hint browsers do NOT enforce (a user can pick "All
//     files"), so we re-check the extension (and MIME when the browser supplies
//     one) here as the real guard.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PARSE_ROWS = 50_000;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls (and some browsers tag .csv with this)
  'text/csv', // .csv
  'application/csv',
  'text/plain', // some OSes report .csv as text/plain
  '', // browsers sometimes omit the type entirely — fall back to extension
]);

/** Lowercased file extension including the leading dot, or '' when none. */
function fileExtension(name) {
  const str = String(name || '').toLowerCase().trim();
  const dot = str.lastIndexOf('.');
  return dot >= 0 ? str.slice(dot) : '';
}

/** Human-readable byte size for user-facing messages (e.g. "5 MB"). */
function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

/**
 * Build an `.xlsx` workbook (as an ArrayBuffer) from row objects.
 *
 * Pure / DOM-free so it can be unit-tested without jsdom. The header row is
 * `columns` (in order); each subsequent row pulls `row[key]` for every column
 * key, coercing `null`/`undefined`/missing keys to an empty string so the
 * worksheet column geometry stays rectangular and predictable.
 *
 * `columns` accepts BOTH shapes: a plain string (used as both the header label
 * AND the row-object lookup key — the distributor settlement caller), or a
 * `{ key, label }` object (label drives the header, key drives the row lookup —
 * the employer onboarding template + roster export). Mixing the two contracts
 * silently produced blank workbooks before (a `{key,label}` object stringified
 * to `[object Object]` in the header and never matched a row key), so we
 * normalise both to `{ key, label }` up front.
 *
 * @param {object} args
 * @param {Array<object>} args.rows — Data rows (plain objects).
 * @param {Array<string|{key:string,label:string}>} args.columns — Defines
 *   column order AND which keys are included. A string is both header + key;
 *   a `{ key, label }` object separates the header label from the row key.
 * @param {string} [args.sheetName='Sheet1'] — Worksheet name.
 * @returns {Promise<ArrayBuffer>} The serialised `.xlsx` bytes.
 */
export async function buildWorkbookBuffer({ rows, columns, sheetName = DEFAULT_SHEET_NAME }) {
  const XLSX = await import('xlsx');
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  // Normalise both column contracts to `{ key, label }`: a string column is its
  // own header AND lookup key; a `{ key, label }` object keeps them distinct.
  const cols = safeColumns.map((col) =>
    typeof col === 'string' ? { key: col, label: col } : col,
  );

  // Array-of-arrays (AOA): first row is the header, then one array per data
  // row in column order. Using AOA (rather than json_to_sheet) guarantees the
  // header ordering exactly matches `columns` and that empty cells are filled.
  const aoa = [
    cols.map((col) => col.label),
    ...safeRows.map((row) =>
      cols.map((col) => {
        const value = row?.[col.key];
        return value === null || value === undefined ? '' : value;
      }),
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // `array` type → ArrayBuffer (Uint8Array-backed) suitable for a Blob.
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

/**
 * Generate an `.xlsx` file from row objects and trigger a browser download.
 *
 * SSR-safe: no-ops if `document` is unavailable (mirrors `csvDownload.js`).
 *
 * @param {object} args
 * @param {Array<object>} args.rows — Data rows (plain objects).
 * @param {Array<string>} args.columns — Header strings; column order + key set.
 * @param {string} [args.filename] — Download filename. A `.xlsx` extension is
 *   appended if missing. Defaults to `export.xlsx`.
 * @param {string} [args.sheetName='Sheet1'] — Worksheet name.
 * @returns {Promise<void>}
 */
export async function downloadSheet({ rows, columns, filename, sheetName = DEFAULT_SHEET_NAME }) {
  if (typeof document === 'undefined') {
    // SSR guard — silently no-op rather than throwing. All callers in this
    // repo are client-only, but this keeps the util defensive.
    return;
  }

  const buffer = await buildWorkbookBuffer({ rows, columns, sheetName });

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = ensureXlsxExtension(filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke on the next tick — the browser has already started the download by
  // the time the click handler returns, so holding the URL alive is wasted
  // memory. Matches the `csvDownload.js` pattern.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Parse an uploaded `.xlsx` File/Blob into row objects keyed by header.
 *
 * Never throws — every failure path is caught and surfaced as a human-readable
 * string in the returned `errors` array. Reads the first worksheet only.
 *
 * Hardened (C2 / B-Excel / BL-14 defense-in-depth) BEFORE the bytes ever reach
 * SheetJS: rejects oversize files, non-spreadsheet extensions/MIME types, and
 * caps the parsed row count via `XLSX.read({ sheetRows })`. These bound the
 * blast radius of a large / crafted workbook on top of the patched SheetJS CDN
 * build (xlsx-0.20.3) that the dependency now pins (BL-14).
 *
 * @param {File|Blob} file — The uploaded spreadsheet.
 * @returns {Promise<{ rows: Array<object>, errors: string[] }>}
 *   `rows` is an array of objects keyed by the header row (empty cells default
 *   to `''`). `errors` is empty on success, otherwise carries one or more
 *   diagnostic strings.
 */
export async function parseSheet(file) {
  const errors = [];

  if (!file || typeof file.arrayBuffer !== 'function') {
    errors.push('No file provided, or the file could not be read.');
    return { rows: [], errors };
  }

  // ── Size cap ── reject before pulling the whole buffer into memory / handing
  // it to the vulnerable parser. `Blob`/`File` always expose `.size`.
  const size = Number(file.size);
  if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES) {
    errors.push(
      `The file is too large (${formatBytes(size)}). The settlement template is small — please upload a file under ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
    return { rows: [], errors };
  }

  // ── Extension / MIME validation ── the `accept` attr on the file input is a
  // hint browsers don't enforce, so re-check here. Extension is the primary
  // guard (MIME for spreadsheets is inconsistent across OSes/browsers); MIME is
  // checked only when the browser supplies a non-empty, clearly-wrong type.
  const ext = fileExtension(file.name);
  if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
    errors.push(
      `Unsupported file type "${ext}". Upload an Excel or CSV file (${ALLOWED_EXTENSIONS.join(', ')}).`,
    );
    return { rows: [], errors };
  }
  const mime = String(file.type || '').toLowerCase();
  if (mime && !SPREADSHEET_MIME_TYPES.has(mime)) {
    errors.push(
      `Unsupported file type. Upload an Excel or CSV file (${ALLOWED_EXTENSIONS.join(', ')}).`,
    );
    return { rows: [], errors };
  }

  try {
    const buffer = await file.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      errors.push('The uploaded file is empty.');
      return { rows: [], errors };
    }

    const XLSX = await import('xlsx');
    // `sheetRows` caps how many rows the parser reads (defense-in-depth against
    // an implausibly tall / crafted workbook — BL-14 ReDoS bound).
    const workbook = XLSX.read(buffer, { type: 'array', sheetRows: MAX_PARSE_ROWS });

    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      errors.push('The workbook contains no sheets.');
      return { rows: [], errors };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!Array.isArray(rows) || rows.length === 0) {
      errors.push('The first sheet contains no data rows.');
      return { rows: [], errors };
    }

    return { rows, errors };
  } catch (err) {
    errors.push(`Could not parse the file: ${err?.message || 'unknown error'}.`);
    return { rows: [], errors };
  }
}

/**
 * Ensure a filename ends in `.xlsx`. Falls back to `export.xlsx` for empty /
 * nullish input.
 *
 * @param {string} filename
 * @returns {string}
 */
function ensureXlsxExtension(filename) {
  const base = String(filename || '').trim();
  if (!base) return 'export.xlsx';
  return base.toLowerCase().endsWith('.xlsx') ? base : `${base}.xlsx`;
}
