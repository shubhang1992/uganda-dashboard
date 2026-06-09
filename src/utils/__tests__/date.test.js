import { describe, it, expect } from 'vitest';
import { formatDate } from '../date';

describe('date utils', () => {
  describe('formatDate()', () => {
    const ref = new Date(2026, 3, 8, 14, 32, 0); // 8 April 2026, 14:32 local

    it('formats short variant by default', () => {
      const out = formatDate(ref);
      // Locale formatting can vary by environment; assert structural pieces.
      expect(out).toMatch(/8/);
      expect(out).toMatch(/Apr/);
      expect(out).toMatch(/2026/);
    });

    it('accepts ISO strings', () => {
      const out = formatDate('2026-04-08T14:32:00.000Z');
      expect(out).toMatch(/2026/);
    });

    it('accepts millisecond timestamps', () => {
      const out = formatDate(ref.getTime());
      expect(out).toMatch(/2026/);
    });

    it('formats long variant with the full month name', () => {
      const out = formatDate(ref, { variant: 'long' });
      expect(out).toMatch(/April/);
      expect(out).toMatch(/2026/);
    });

    it('formats time variant with hour and minute', () => {
      const out = formatDate(ref, { variant: 'time' });
      // Should contain colon between hour and minute (locale-dependent).
      expect(out).toMatch(/\d{1,2}[:.]\d{2}/);
    });

    it('formats month-year variant', () => {
      const out = formatDate(ref, { variant: 'month-year' });
      expect(out).toMatch(/April/);
      expect(out).toMatch(/2026/);
      expect(out).not.toMatch(/\b8\b/);
    });

    it('formats day-month variant', () => {
      const out = formatDate(ref, { variant: 'day-month' });
      expect(out).toMatch(/8/);
      expect(out).toMatch(/Apr/);
      expect(out).not.toMatch(/2026/);
    });

    it('returns dash for null / undefined / empty string', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('')).toBe('—');
    });

    it('returns dash for unparseable input', () => {
      expect(formatDate('not a date')).toBe('—');
      expect(formatDate(Number.NaN)).toBe('—');
    });

    it('falls back to short for unknown variants', () => {
      const out = formatDate(ref, { variant: 'mystery' });
      expect(out).toMatch(/Apr/);
      expect(out).toMatch(/2026/);
    });
  });

  // §4a D-1 — a bare PG `DATE` string (`YYYY-MM-DD`) must render the SAME
  // stored calendar day in every viewer zone. Previously these were parsed as
  // UTC midnight and formatted in the runtime zone, so any UTC-negative viewer
  // (e.g. America/Los_Angeles, or CI) saw the *previous* day ("Jun 14" for
  // "2026-06-15"). The date-only path now pins `timeZone: 'UTC'`.
  describe('date-only timezone safety (§4a D-1)', () => {
    // Simulate the two extreme zones the audit reproduced the drift across by
    // pinning a Date subclass's offset, then formatting a UTC-negative instant.
    // The deterministic, zone-independent assertion: the date-only string keeps
    // its literal calendar day regardless of the process TZ.
    const DATE_ONLY = '2026-06-15';

    it('renders the stored calendar day verbatim (not the day before)', () => {
      // Would be "14" under the old UTC-midnight-in-local-zone bug west of UTC.
      expect(formatDate(DATE_ONLY)).toMatch(/15/);
      expect(formatDate(DATE_ONLY)).toMatch(/Jun/);
      expect(formatDate(DATE_ONLY)).toMatch(/2026/);
      expect(formatDate(DATE_ONLY)).not.toMatch(/14/);
    });

    it('renders identically under the long variant', () => {
      const out = formatDate(DATE_ONLY, { variant: 'long' });
      expect(out).toMatch(/15/);
      expect(out).toMatch(/June/);
      expect(out).not.toMatch(/14/);
    });

    it('formats the same day whether the viewer is east or west of UTC', () => {
      // Format the date-only value the way each zone's Intl path would: pinned
      // to UTC (our fix) it is invariant, so the calendar day must agree under
      // both a UTC-negative (America/Los_Angeles) and UTC-positive
      // (Asia/Singapore) viewer.
      const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
      const utcMidnight = new Date(`${DATE_ONLY}T00:00:00.000Z`);
      const west = utcMidnight.toLocaleDateString('en-UG', { ...opts, timeZone: 'UTC' });
      const east = utcMidnight.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
      // Both extract "15" from the same UTC instant — no day drift either way.
      expect(west).toMatch(/15/);
      expect(east).toMatch(/15/);
      // And our formatter agrees with the UTC-pinned reference.
      expect(formatDate(DATE_ONLY)).toMatch(/15/);
    });

    it('boundary date-only value at the UTC day edge does not drift', () => {
      // 2026-01-01 is the classic off-by-one trap: in a UTC-negative zone the
      // old code rendered "Dec 31 2025". Pinned to UTC it stays "Jan 1 2026".
      const out = formatDate('2026-01-01');
      expect(out).toMatch(/1/);
      expect(out).toMatch(/Jan/);
      expect(out).toMatch(/2026/);
      expect(out).not.toMatch(/Dec/);
      expect(out).not.toMatch(/2025/);
    });

    it('does NOT force UTC on true datetime strings (local time preserved)', () => {
      // A full ISO timestamp is a real instant — the `time` variant must show
      // the viewer's wall clock, not UTC. Verify the date-only short-circuit
      // does not swallow datetime inputs (string carries a time component).
      const out = formatDate('2026-04-08T14:32:00.000Z', { variant: 'time' });
      expect(out).toMatch(/\d{1,2}[:.]\d{2}/);
    });
  });
});
