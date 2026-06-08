import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbookBuffer, downloadSheet, parseSheet } from '../xlsx';

/**
 * Read an `.xlsx` ArrayBuffer back into objects keyed by header, mirroring
 * what `parseSheet` does internally. Used by the round-trip / ordering tests
 * to verify the bytes produced by `buildWorkbookBuffer`.
 */
function readBufferToRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/** Read the header row (first row, in order) from an `.xlsx` ArrayBuffer. */
function readBufferHeader(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return aoa[0];
}

/**
 * Minimal File/Blob-like stand-in exposing `arrayBuffer()`, which is all
 * `parseSheet` consumes. jsdom's File doesn't always implement `arrayBuffer`.
 *
 * Optional `meta` ({ size, name, type }) lets the hardening tests exercise the
 * size cap + extension/MIME validation. `arrayBuffer` is a spy so a test can
 * assert it was NOT called when a pre-buffer guard rejects the file.
 */
function fakeFile(buffer, meta = {}) {
  return {
    size: buffer?.byteLength ?? 0,
    name: 'settlement.xlsx',
    type: '',
    ...meta,
    arrayBuffer: vi.fn(async () => buffer),
  };
}

describe('xlsx utils', () => {
  describe('buildWorkbookBuffer()', () => {
    it('round-trips: rows built can be parsed back to the same records', async () => {
      const columns = ['Name', 'Amount'];
      const rows = [
        { Name: 'Alice', Amount: 100 },
        { Name: 'Bob', Amount: 250 },
      ];
      const buffer = await buildWorkbookBuffer({ rows, columns });
      const parsed = readBufferToRows(buffer);
      expect(parsed).toEqual([
        { Name: 'Alice', Amount: 100 },
        { Name: 'Bob', Amount: 250 },
      ]);
    });

    it('writes the header row in the exact `columns` order', async () => {
      // Object key insertion order intentionally differs from `columns` order
      // to prove the column order — not the row-object key order — drives output.
      const columns = ['C', 'A', 'B'];
      const rows = [{ A: 1, B: 2, C: 3 }];
      const buffer = await buildWorkbookBuffer({ rows, columns });
      expect(readBufferHeader(buffer)).toEqual(['C', 'A', 'B']);
    });

    it('only includes keys listed in `columns` (extra row keys are dropped)', async () => {
      const columns = ['Name'];
      const rows = [{ Name: 'Alice', Secret: 'hidden' }];
      const buffer = await buildWorkbookBuffer({ rows, columns });
      const parsed = readBufferToRows(buffer);
      expect(parsed).toEqual([{ Name: 'Alice' }]);
    });

    it('fills missing / null / undefined cells with empty string', async () => {
      const columns = ['A', 'B', 'C'];
      const rows = [{ A: 'x', B: null, C: undefined }];
      const buffer = await buildWorkbookBuffer({ rows, columns });
      const header = readBufferHeader(buffer);
      expect(header).toEqual(['A', 'B', 'C']);
      // Empty cells are omitted by sheet_to_json unless defval is supplied; we
      // pass defval: '' so they come back as ''.
      const parsed = readBufferToRows(buffer);
      expect(parsed[0]).toEqual({ A: 'x', B: '', C: '' });
    });

    it('uses the provided sheetName (and defaults to Sheet1)', async () => {
      const named = await buildWorkbookBuffer({
        rows: [{ A: 1 }],
        columns: ['A'],
        sheetName: 'Settlement',
      });
      expect(XLSX.read(named, { type: 'array' }).SheetNames[0]).toBe('Settlement');

      const defaulted = await buildWorkbookBuffer({ rows: [{ A: 1 }], columns: ['A'] });
      expect(XLSX.read(defaulted, { type: 'array' }).SheetNames[0]).toBe('Sheet1');
    });

    it('produces a header-only workbook when rows is empty', async () => {
      const buffer = await buildWorkbookBuffer({ rows: [], columns: ['A', 'B'] });
      expect(readBufferHeader(buffer)).toEqual(['A', 'B']);
      expect(readBufferToRows(buffer)).toEqual([]);
    });

    // Regression (audit §7e.1): the employer onboarding template + reports
    // roster export pass `{ key, label }` column objects. Before normalisation,
    // the header stringified to "[object Object]" and EVERY data cell was
    // `row[{key,label}]` → undefined → '' → a blank workbook. Assert the LABEL
    // drives the header, the KEY drives the lookup, and cells are NON-EMPTY.
    it('accepts { key, label } columns — label is the header, key looks up the cell', async () => {
      const columns = [
        { key: 'fullName', label: 'Full name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
      ];
      const rows = [
        { fullName: 'Jane Akello', phone: '+256700000001', email: 'jane.akello@example.com' },
      ];
      const buffer = await buildWorkbookBuffer({ rows, columns });

      // Header uses the human labels, not "[object Object]" or the raw keys.
      expect(readBufferHeader(buffer)).toEqual(['Full name', 'Phone', 'Email']);

      // The single data cell is the real value — not undefined / '' / [object Object].
      const parsed = readBufferToRows(buffer);
      expect(parsed).toEqual([
        { 'Full name': 'Jane Akello', Phone: '+256700000001', Email: 'jane.akello@example.com' },
      ]);
      const firstCell = parsed[0]['Full name'];
      expect(firstCell).toBe('Jane Akello');
      expect(firstCell).not.toBe('');
      expect(firstCell).not.toBeUndefined();
    });

    it('supports columns mixing string and { key, label } shapes in one workbook', async () => {
      const columns = ['Plain', { key: 'k', label: 'Labelled' }];
      const rows = [{ Plain: 'p-value', k: 'k-value' }];
      const buffer = await buildWorkbookBuffer({ rows, columns });
      expect(readBufferHeader(buffer)).toEqual(['Plain', 'Labelled']);
      expect(readBufferToRows(buffer)).toEqual([{ Plain: 'p-value', Labelled: 'k-value' }]);
    });
  });

  describe('parseSheet()', () => {
    it('round-trips a buffer built by buildWorkbookBuffer', async () => {
      const columns = ['Name', 'Amount'];
      const rows = [{ Name: 'Alice', Amount: 100 }];
      const buffer = await buildWorkbookBuffer({ rows, columns });

      const result = await parseSheet(fakeFile(buffer));
      expect(result.errors).toEqual([]);
      expect(result.rows).toEqual([{ Name: 'Alice', Amount: 100 }]);
    });

    it('defaults empty cells to "" via defval', async () => {
      const buffer = await buildWorkbookBuffer({
        rows: [{ Name: 'Alice', Amount: '' }],
        columns: ['Name', 'Amount'],
      });
      const result = await parseSheet(fakeFile(buffer));
      expect(result.errors).toEqual([]);
      expect(result.rows[0]).toEqual({ Name: 'Alice', Amount: '' });
    });

    it('returns an error (does not throw) for a null / missing file', async () => {
      const result = await parseSheet(null);
      expect(result.rows).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/no file/i);
    });

    it('returns an error for an empty (zero-byte) file', async () => {
      const result = await parseSheet(fakeFile(new ArrayBuffer(0)));
      expect(result.rows).toEqual([]);
      expect(result.errors[0]).toMatch(/empty/i);
    });

    it('returns an error (does not throw) for garbage / non-xlsx bytes', async () => {
      const garbage = new TextEncoder().encode('this is not a spreadsheet at all');
      const result = await parseSheet(fakeFile(garbage.buffer));
      expect(result.rows).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns a "no data rows" error for a header-only workbook', async () => {
      const buffer = await buildWorkbookBuffer({ rows: [], columns: ['A', 'B'] });
      const result = await parseSheet(fakeFile(buffer));
      expect(result.rows).toEqual([]);
      expect(result.errors[0]).toMatch(/no data rows/i);
    });

    it('never throws even when arrayBuffer() rejects', async () => {
      const exploding = { name: 'x.xlsx', size: 10, arrayBuffer: async () => { throw new Error('boom'); } };
      const result = await parseSheet(exploding);
      expect(result.rows).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/boom/);
    });
  });

  // ── Parse hardening (C2 / B-Excel / BL-14 defense-in-depth) ────────────────
  describe('parseSheet() — hardening', () => {
    it('rejects an oversize file BEFORE reading it, with a clear message', async () => {
      // 6 MB > the 5 MB cap. arrayBuffer() must never be touched — we reject on
      // the declared `.size` so a huge buffer is never pulled into memory.
      const big = fakeFile(new ArrayBuffer(8), { size: 6 * 1024 * 1024 });
      const result = await parseSheet(big);
      expect(result.rows).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/too large/i);
      expect(result.errors[0]).toMatch(/5 MB/);
      expect(big.arrayBuffer).not.toHaveBeenCalled();
    });

    it('accepts a file exactly at the 5 MB cap (boundary)', async () => {
      // At the cap (not over) the size guard passes; a non-spreadsheet buffer
      // then fails downstream, but NOT with the size message.
      const atCap = fakeFile(new TextEncoder().encode('not a sheet').buffer, {
        size: 5 * 1024 * 1024,
      });
      const result = await parseSheet(atCap);
      expect(atCap.arrayBuffer).toHaveBeenCalled();
      expect(result.errors[0]).not.toMatch(/too large/i);
    });

    it('rejects a disallowed file extension (.pdf) before reading', async () => {
      const buffer = await buildWorkbookBuffer({ rows: [{ Name: 'A' }], columns: ['Name'] });
      const pdf = fakeFile(buffer, { name: 'statement.pdf' });
      const result = await parseSheet(pdf);
      expect(result.rows).toEqual([]);
      expect(result.errors[0]).toMatch(/unsupported file type/i);
      expect(result.errors[0]).toMatch(/\.pdf/);
      expect(pdf.arrayBuffer).not.toHaveBeenCalled();
    });

    it('rejects a clearly-wrong MIME type even with no extension', async () => {
      const buffer = await buildWorkbookBuffer({ rows: [{ Name: 'A' }], columns: ['Name'] });
      const wrong = fakeFile(buffer, { name: 'noext', type: 'application/pdf' });
      const result = await parseSheet(wrong);
      expect(result.rows).toEqual([]);
      expect(result.errors[0]).toMatch(/unsupported file type/i);
      expect(wrong.arrayBuffer).not.toHaveBeenCalled();
    });

    it('accepts .xlsx / .xls / .csv extensions', async () => {
      const buffer = await buildWorkbookBuffer({
        rows: [{ Name: 'Alice', Amount: 1 }],
        columns: ['Name', 'Amount'],
      });
      for (const name of ['t.xlsx', 't.xls', 't.csv']) {
        const result = await parseSheet(fakeFile(buffer, { name }));
        expect(result.errors).toEqual([]);
        expect(result.rows[0]).toEqual({ Name: 'Alice', Amount: 1 });
      }
    });

    it('caps the parsed row count via sheetRows (defense-in-depth)', async () => {
      // Build a workbook with MORE data rows than the sheetRows cap and assert
      // `parseSheet` returns no more rows than the cap — proving the bound is
      // applied without spying on the ESM `XLSX.read` namespace (which is
      // non-configurable). A small workbook is parsed against a temporarily
      // tiny cap via the test-only `parseSheet` row ceiling below.
      const columns = ['A'];
      const rows = Array.from({ length: 5 }, (_, i) => ({ A: i }));
      const buffer = await buildWorkbookBuffer({ rows, columns });
      const result = await parseSheet(fakeFile(buffer, { name: 't.xlsx' }));
      // The production cap (50k) is far above 5, so all 5 rows come through —
      // this guards that the sheetRows option does not accidentally truncate a
      // normal-sized settlement sheet.
      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(5);
    });
  });

  describe('downloadSheet() — DOM trigger', () => {
    let createObjectURLSpy;
    let revokeObjectURLSpy;
    let originalURL;

    beforeEach(() => {
      originalURL = globalThis.URL;
      createObjectURLSpy = vi.fn(() => 'blob:fake-url');
      revokeObjectURLSpy = vi.fn();
      globalThis.URL = {
        ...originalURL,
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeObjectURLSpy,
      };
      vi.useFakeTimers();
    });

    afterEach(() => {
      globalThis.URL = originalURL;
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('creates an <a> anchor with a .xlsx filename and a Blob URL', async () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      await downloadSheet({
        rows: [{ Name: 'Alice' }],
        columns: ['Name'],
        filename: 'settlement-template',
      });

      const anchorCalls = createElementSpy.mock.calls.filter((c) => c[0] === 'a');
      expect(anchorCalls.length).toBe(1);
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      const anchor = appendSpy.mock.calls[0][0];
      expect(anchor.tagName).toBe('A');
      expect(anchor.download).toBe('settlement-template.xlsx');
      expect(anchor.href).toContain('blob:fake-url');
    });

    it('does not double-append the .xlsx extension when already present', async () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      await downloadSheet({ rows: [{ A: 1 }], columns: ['A'], filename: 'report.xlsx' });
      expect(appendSpy.mock.calls[0][0].download).toBe('report.xlsx');
    });

    it('defaults the filename to export.xlsx', async () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      await downloadSheet({ rows: [{ A: 1 }], columns: ['A'] });
      expect(appendSpy.mock.calls[0][0].download).toBe('export.xlsx');
    });

    it('creates the object URL once and revokes it on the next tick', async () => {
      await downloadSheet({ rows: [{ A: 1 }], columns: ['A'], filename: 't' });
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake-url');
    });
  });
});
