// Unit tests for `src/utils/csv.js`.
//
// Coverage:
//   * RFC-4180 escape behaviour (quotes, commas, newlines).
//   * UTF-8 BOM presence on the synchronous `toCsv` output and the first
//     chunk emitted by `toCsvStream`.
//   * Hard row cap on `toCsv` (5,000 rows).
//   * Async streaming through `toCsvStream`: yields header, then each row,
//     then an empty EOF marker.
//   * Formula-injection defence on cells whose first character would be
//     interpreted as a formula by Excel/Sheets/LibreOffice.

import { describe, it, expect } from 'vitest';
import { toCsv, toCsvStream, MAX_ROWS } from './csv';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'amount', label: 'Amount (UGX)' },
];

const UTF8_BOM = '﻿';

describe('toCsv()', () => {
  it('prepends a UTF-8 BOM', () => {
    const csv = toCsv([], COLUMNS);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
  });

  it('emits the header row in column order', () => {
    const csv = toCsv([], COLUMNS);
    expect(csv).toBe(`${UTF8_BOM}ID,Name,Amount (UGX)`);
  });

  it('serialises a simple row', () => {
    const csv = toCsv([{ id: 'a-001', name: 'Alice', amount: 5000 }], COLUMNS);
    expect(csv).toBe(`${UTF8_BOM}ID,Name,Amount (UGX)\r\na-001,Alice,5000`);
  });

  it('quote-wraps cells containing a comma (RFC 4180)', () => {
    const csv = toCsv([{ id: '1', name: 'Doe, John', amount: 100 }], COLUMNS);
    expect(csv).toContain('"Doe, John"');
  });

  it('doubles internal quotes inside a quote-wrapped cell', () => {
    const csv = toCsv([{ id: '1', name: 'Brian "Boss" Akello', amount: 0 }], COLUMNS);
    // Wrapped because the cell contains a quote; inner `"` doubled to `""`.
    expect(csv).toContain('"Brian ""Boss"" Akello"');
  });

  it('quote-wraps cells containing newlines', () => {
    const csv = toCsv([{ id: '1', name: 'Line A\nLine B', amount: 0 }], COLUMNS);
    expect(csv).toContain('"Line A\nLine B"');
  });

  it('coerces null / undefined cells to empty string', () => {
    const csv = toCsv([{ id: 'x', name: null, amount: undefined }], COLUMNS);
    expect(csv).toBe(`${UTF8_BOM}ID,Name,Amount (UGX)\r\nx,,`);
  });

  it('defuses Excel formula injection on `=`, `+`, `-`, `@`', () => {
    const rows = [
      { id: '1', name: '=SUM(A1:A2)', amount: 0 },
      { id: '2', name: '+CMD()', amount: 0 },
      { id: '3', name: '-1+1', amount: 0 },
      { id: '4', name: '@evil', amount: 0 },
    ];
    const csv = toCsv(rows, COLUMNS);
    expect(csv).toContain(`"'=SUM(A1:A2)"`);
    expect(csv).toContain(`"'+CMD()"`);
    expect(csv).toContain(`"'-1+1"`);
    expect(csv).toContain(`"'@evil"`);
  });

  it('separates rows with CRLF (RFC 4180)', () => {
    const csv = toCsv(
      [
        { id: '1', name: 'A', amount: 1 },
        { id: '2', name: 'B', amount: 2 },
      ],
      COLUMNS,
    );
    // Header + 2 data rows = 3 lines, joined by `\r\n`.
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
  });

  it('exposes MAX_ROWS = 5000', () => {
    expect(MAX_ROWS).toBe(5_000);
  });

  it('accepts exactly MAX_ROWS rows without throwing', () => {
    const rows = Array.from({ length: MAX_ROWS }, (_, i) => ({ id: i, name: `n${i}`, amount: i }));
    expect(() => toCsv(rows, COLUMNS)).not.toThrow();
  });

  it('throws CSV_ROW_CAP_EXCEEDED when rows exceeds MAX_ROWS', () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ id: i, name: `n${i}`, amount: i }));
    expect(() => toCsv(rows, COLUMNS)).toThrow('CSV_ROW_CAP_EXCEEDED');
  });

  it('rejects a non-array rows argument', () => {
    expect(() => toCsv(null, COLUMNS)).toThrow(TypeError);
    expect(() => toCsv('not-an-array', COLUMNS)).toThrow(TypeError);
  });

  it('rejects an empty columns argument', () => {
    expect(() => toCsv([], [])).toThrow(TypeError);
  });
});

describe('toCsvStream()', () => {
  it('yields the header (with BOM) as the first chunk', async () => {
    const chunks = [];
    for await (const chunk of toCsvStream([], COLUMNS)) chunks.push(chunk);
    // Header + EOF marker.
    expect(chunks[0]).toBe(`${UTF8_BOM}ID,Name,Amount (UGX)\r\n`);
    expect(chunks.at(-1)).toBe('');
  });

  it('streams each row as its own chunk after the header', async () => {
    const rows = [
      { id: '1', name: 'A', amount: 1 },
      { id: '2', name: 'B', amount: 2 },
      { id: '3', name: 'C', amount: 3 },
    ];
    const chunks = [];
    for await (const chunk of toCsvStream(rows, COLUMNS)) chunks.push(chunk);
    // header + 3 rows + EOF marker = 5 chunks.
    expect(chunks).toHaveLength(5);
    expect(chunks[1]).toBe('1,A,1\r\n');
    expect(chunks[2]).toBe('2,B,2\r\n');
    expect(chunks[3]).toBe('3,C,3\r\n');
  });

  it('accepts a synchronous iterable', async () => {
    function* sync() {
      yield { id: '1', name: 'A', amount: 1 };
    }
    const chunks = [];
    for await (const chunk of toCsvStream(sync(), COLUMNS)) chunks.push(chunk);
    expect(chunks[1]).toBe('1,A,1\r\n');
  });

  it('accepts an async iterable (large dataset, no row cap)', async () => {
    async function* asyncRows() {
      for (let i = 0; i < MAX_ROWS + 5; i++) {
        yield { id: String(i), name: `n${i}`, amount: i };
      }
    }
    const chunks = [];
    for await (const chunk of toCsvStream(asyncRows(), COLUMNS)) chunks.push(chunk);
    // 1 header + MAX_ROWS+5 rows + 1 EOF = MAX_ROWS + 7.
    expect(chunks).toHaveLength(MAX_ROWS + 7);
  });

  it('quote-wraps streamed cells the same way as toCsv', async () => {
    const rows = [{ id: '1', name: 'Doe, John', amount: 100 }];
    const chunks = [];
    for await (const chunk of toCsvStream(rows, COLUMNS)) chunks.push(chunk);
    expect(chunks[1]).toBe('1,"Doe, John",100\r\n');
  });

  it('rejects non-iterable rows', async () => {
    await expect(async () => {
      for await (const _chunk of toCsvStream(123, COLUMNS)) { /* drain */ }
    }).rejects.toThrow(TypeError);
  });
});
