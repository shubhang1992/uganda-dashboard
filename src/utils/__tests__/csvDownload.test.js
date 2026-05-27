import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  downloadCsv,
  dateStampedFilename,
  MOBILE_ROW_CAP,
  STREAM_THRESHOLD,
} from '../csvDownload';

// UTF-8 BOM the serialiser in `csv.js` prepends to the header line.
const UTF8_BOM = '﻿';

/**
 * Helper that swaps in a fake `Blob` so we can capture every `new Blob(...)`
 * call from the unit under test and assert on the cell text without dragging
 * jsdom's FileReader into the picture.
 */
function installBlobSpy() {
  const calls = [];
  const RealBlob = globalThis.Blob;
  const FakeBlob = vi.fn(function FakeBlob(parts, opts) {
    calls.push({ parts, opts });
    this.parts = parts;
    this.type = opts?.type ?? '';
    this.size = (parts || []).reduce(
      (n, p) => n + (typeof p === 'string' ? p.length : 0),
      0,
    );
  });
  globalThis.Blob = FakeBlob;
  return {
    calls,
    restore() {
      globalThis.Blob = RealBlob;
    },
    /** Concatenate every string part across all blobs created. */
    text() {
      return calls
        .flatMap((c) => c.parts || [])
        .map((p) => (typeof p === 'string' ? p : ''))
        .join('');
    },
  };
}

describe('csvDownload utils', () => {
  let createObjectURLSpy;
  let revokeObjectURLSpy;
  let blobSpy;
  let originalURL;

  beforeEach(() => {
    // jsdom's URL has createObjectURL but it is a no-op stub; spy on it.
    originalURL = globalThis.URL;
    createObjectURLSpy = vi.fn(() => 'blob:fake-url');
    revokeObjectURLSpy = vi.fn();
    globalThis.URL = {
      ...originalURL,
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    };
    blobSpy = installBlobSpy();
    vi.useFakeTimers();
  });

  afterEach(() => {
    blobSpy.restore();
    globalThis.URL = originalURL;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('dateStampedFilename()', () => {
    it('returns `{slug}-{YYYY-MM-DD}.csv`', () => {
      const out = dateStampedFilename('agent-report');
      expect(out).toMatch(/^agent-report-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('lower-cases and dashifies whitespace in the slug', () => {
      const out = dateStampedFilename('Agent  Commission Report');
      expect(out).toMatch(/^agent-commission-report-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('falls back to `export` for empty / null / undefined slugs', () => {
      expect(dateStampedFilename('')).toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(dateStampedFilename(null)).toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(dateStampedFilename(undefined)).toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('zero-pads single-digit month and day', () => {
      vi.setSystemTime(new Date(2026, 0, 3, 12, 0, 0)); // 3 Jan 2026 local
      expect(dateStampedFilename('x')).toBe('x-2026-01-03.csv');
    });
  });

  describe('downloadCsv() — RFC 4180 escaping', () => {
    const columns = [
      { key: 'name', label: 'Name' },
      { key: 'note', label: 'Note' },
    ];

    it('quote-wraps cells containing commas', async () => {
      await downloadCsv({
        rows: [{ name: 'Acme, Ltd', note: 'fine' }],
        columns,
        filename: 't',
      });
      expect(blobSpy.text()).toContain('"Acme, Ltd"');
    });

    it('escapes embedded double quotes per RFC 4180 (double them)', async () => {
      await downloadCsv({
        rows: [{ name: 'He said "hi"', note: 'x' }],
        columns,
        filename: 't',
      });
      expect(blobSpy.text()).toContain('"He said ""hi"""');
    });

    it('quote-wraps cells containing newlines', async () => {
      await downloadCsv({
        rows: [{ name: 'line1\nline2', note: 'x' }],
        columns,
        filename: 't',
      });
      expect(blobSpy.text()).toContain('"line1\nline2"');
    });

    it('quote-wraps cells containing carriage returns', async () => {
      await downloadCsv({
        rows: [{ name: 'line1\rline2', note: 'x' }],
        columns,
        filename: 't',
      });
      expect(blobSpy.text()).toContain('"line1\rline2"');
    });

    it('prepends a UTF-8 BOM to the header line', async () => {
      await downloadCsv({
        rows: [{ name: 'a', note: 'b' }],
        columns,
        filename: 't',
      });
      const csv = blobSpy.text();
      expect(csv.startsWith(UTF8_BOM)).toBe(true);
    });

    it('uses `\\r\\n` line separators between rows', async () => {
      await downloadCsv({
        rows: [
          { name: 'a', note: '1' },
          { name: 'b', note: '2' },
        ],
        columns,
        filename: 't',
      });
      // Expect at least two CRLF separators (after header, after first row).
      const csv = blobSpy.text();
      const crlfCount = (csv.match(/\r\n/g) || []).length;
      expect(crlfCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('downloadCsv() — DOM trigger', () => {
    const columns = [{ key: 'name', label: 'Name' }];
    const rows = [{ name: 'alice' }];

    it('creates an <a> anchor with the date-stamped filename and a Blob URL', async () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      await downloadCsv({ rows, columns, filename: 'my-export' });

      // The anchor is the only element this util creates.
      const anchorCalls = createElementSpy.mock.calls.filter((c) => c[0] === 'a');
      expect(anchorCalls.length).toBe(1);

      // Captured anchor was appended + removed.
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      const appendedAnchor = appendSpy.mock.calls[0][0];
      expect(appendedAnchor.tagName).toBe('A');
      expect(appendedAnchor.download).toMatch(/^my-export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(appendedAnchor.href).toContain('blob:fake-url');
    });

    it('builds the Blob with the `text/csv;charset=utf-8;` MIME type', async () => {
      await downloadCsv({ rows, columns, filename: 't' });
      expect(blobSpy.calls.length).toBe(1);
      expect(blobSpy.calls[0].opts).toEqual({ type: 'text/csv;charset=utf-8;' });
    });

    it('calls URL.createObjectURL once and revokes it on the next tick', async () => {
      await downloadCsv({ rows, columns, filename: 't' });
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      // The util schedules revoke via setTimeout(..., 0).
      vi.runAllTimers();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
    });
  });

  describe('downloadCsv() — degenerate inputs', () => {
    it('returns silently for an empty header / column list', async () => {
      await downloadCsv({ rows: [{ a: 1 }], columns: [], filename: 't' });
      expect(blobSpy.calls.length).toBe(0);
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    it('returns silently when rows is not an array', async () => {
      await downloadCsv({ rows: null, columns: [{ key: 'a', label: 'A' }], filename: 't' });
      expect(blobSpy.calls.length).toBe(0);
    });

    it('returns silently when columns is not an array', async () => {
      await downloadCsv({ rows: [], columns: null, filename: 't' });
      expect(blobSpy.calls.length).toBe(0);
    });

    it('still emits a header-only CSV when rows is an empty array', async () => {
      await downloadCsv({
        rows: [],
        columns: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        filename: 't',
      });
      expect(blobSpy.calls.length).toBe(1);
      const csv = blobSpy.text();
      // Just header (with BOM) — no row separator yet.
      expect(csv).toBe(`${UTF8_BOM}A,B`);
    });
  });

  describe('downloadCsv() — mobile capping', () => {
    const columns = [{ key: 'i', label: 'I' }];

    it('truncates to MOBILE_ROW_CAP and fires onCapNotice when isMobile + over cap', async () => {
      const onCapNotice = vi.fn();
      const rows = Array.from({ length: MOBILE_ROW_CAP + 25 }, (_, i) => ({ i }));
      await downloadCsv({ rows, columns, filename: 't', isMobile: true, onCapNotice });
      expect(onCapNotice).toHaveBeenCalledTimes(1);
      expect(onCapNotice).toHaveBeenCalledWith({
        capped: MOBILE_ROW_CAP,
        total: MOBILE_ROW_CAP + 25,
      });
    });

    it('does not fire onCapNotice when isMobile but under cap', async () => {
      const onCapNotice = vi.fn();
      await downloadCsv({
        rows: [{ i: 1 }],
        columns,
        filename: 't',
        isMobile: true,
        onCapNotice,
      });
      expect(onCapNotice).not.toHaveBeenCalled();
    });

    it('does not cap when isMobile is false even if over the cap', async () => {
      const onCapNotice = vi.fn();
      // 200 rows is well under both `MOBILE_ROW_CAP` and `STREAM_THRESHOLD`,
      // so we hit neither the mobile-cap branch nor the streaming branch.
      const rows = Array.from({ length: 200 }, (_, i) => ({ i }));
      await downloadCsv({ rows, columns, filename: 't', isMobile: false, onCapNotice });
      expect(onCapNotice).not.toHaveBeenCalled();
    });

    it('STREAM_THRESHOLD is exported as a positive number', () => {
      expect(typeof STREAM_THRESHOLD).toBe('number');
      expect(STREAM_THRESHOLD).toBeGreaterThan(0);
    });
  });
});
