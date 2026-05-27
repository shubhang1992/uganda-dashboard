import { describe, it, expect } from 'vitest';
import {
  CADENCES,
  cadenceLabel,
  cadenceShortLabel,
  nextCycleEnd,
  cycleWindow,
  formatCycleLabel,
  formatPayoutDate,
  groupCommissionsByPaidCycle,
} from '../settlementCycle';

/** Build a local-time Date so we never collide with TZ surprises in jsdom. */
function local(y, m /* 1-12 */, d, h = 12, min = 0, s = 0, ms = 0) {
  return new Date(y, m - 1, d, h, min, s, ms);
}

describe('settlementCycle utils', () => {
  describe('cadenceLabel() / cadenceShortLabel()', () => {
    it('returns the long human label for each known cadence', () => {
      expect(cadenceLabel(CADENCES.WEEKLY_FRIDAY)).toMatch(/Weekly/);
      expect(cadenceLabel(CADENCES.BIWEEKLY_FRIDAY)).toMatch(/Bi-weekly/);
      expect(cadenceLabel(CADENCES.MONTHLY_FIRST)).toMatch(/Monthly/);
    });

    it('returns short labels', () => {
      expect(cadenceShortLabel(CADENCES.WEEKLY_FRIDAY)).toBe('Weekly');
      expect(cadenceShortLabel(CADENCES.BIWEEKLY_FRIDAY)).toBe('Bi-weekly');
      expect(cadenceShortLabel(CADENCES.MONTHLY_FIRST)).toBe('Monthly');
    });

    it('falls back to the monthly default label for unknown cadence', () => {
      expect(cadenceLabel('mystery-cadence')).toBe(cadenceLabel(CADENCES.MONTHLY_FIRST));
      expect(cadenceShortLabel(undefined)).toBe('Monthly');
      expect(cadenceShortLabel(null)).toBe('Monthly');
    });
  });

  describe('nextCycleEnd() — monthly', () => {
    it('returns the last day of the current month at end-of-day', () => {
      const end = nextCycleEnd(CADENCES.MONTHLY_FIRST, local(2026, 5, 8));
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(4); // May
      expect(end.getDate()).toBe(31);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
      expect(end.getMilliseconds()).toBe(999);
    });

    it('handles February in a leap year (29 days)', () => {
      const end = nextCycleEnd(CADENCES.MONTHLY_FIRST, local(2024, 2, 10));
      expect(end.getMonth()).toBe(1); // February
      expect(end.getDate()).toBe(29);
    });

    it('handles February in a non-leap year (28 days)', () => {
      const end = nextCycleEnd(CADENCES.MONTHLY_FIRST, local(2025, 2, 10));
      expect(end.getMonth()).toBe(1);
      expect(end.getDate()).toBe(28);
    });

    it('handles the last second of a month rolling to the same month-end', () => {
      // 31 May 23:59:59 should still resolve to 31 May 23:59:59.999.
      const lastSecond = local(2026, 5, 31, 23, 59, 59, 0);
      const end = nextCycleEnd(CADENCES.MONTHLY_FIRST, lastSecond);
      expect(end.getMonth()).toBe(4);
      expect(end.getDate()).toBe(31);
    });

    it('handles the first second of a month — returns this month-end', () => {
      const firstSec = local(2026, 5, 1, 0, 0, 0, 0);
      const end = nextCycleEnd(CADENCES.MONTHLY_FIRST, firstSec);
      expect(end.getMonth()).toBe(4); // May
      expect(end.getDate()).toBe(31);
    });

    it('rolls year over correctly when called in December', () => {
      const end = nextCycleEnd(CADENCES.MONTHLY_FIRST, local(2026, 12, 15));
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(11);
      expect(end.getDate()).toBe(31);
    });
  });

  describe('nextCycleEnd() — weekly Friday', () => {
    it('returns the same Friday at end-of-day when called on a Friday', () => {
      const friday = local(2026, 5, 8); // Fri 8 May 2026
      const end = nextCycleEnd(CADENCES.WEEKLY_FRIDAY, friday);
      expect(end.getDay()).toBe(5);
      expect(end.getDate()).toBe(8);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
    });

    it('returns the upcoming Friday for any earlier weekday in the same week', () => {
      const monday = local(2026, 5, 4); // Mon
      const end = nextCycleEnd(CADENCES.WEEKLY_FRIDAY, monday);
      expect(end.getDay()).toBe(5);
      expect(end.getDate()).toBe(8);
    });

    it('returns the next Friday when called on a Saturday', () => {
      const sat = local(2026, 5, 9); // Sat after Fri 8 May
      const end = nextCycleEnd(CADENCES.WEEKLY_FRIDAY, sat);
      expect(end.getDay()).toBe(5);
      expect(end.getDate()).toBe(15);
    });
  });

  describe('nextCycleEnd() — biweekly Friday (even ISO weeks)', () => {
    it('lands on an even-ISO-week Friday', () => {
      // Fri 1 May 2026 is ISO week 18 (even) — returns same day.
      const end = nextCycleEnd(CADENCES.BIWEEKLY_FRIDAY, local(2026, 5, 1));
      expect(end.getDate()).toBe(1);
      expect(end.getDay()).toBe(5);
    });

    it('skips one Friday when the nearest Friday lands on an odd ISO week', () => {
      // Fri 8 May 2026 is ISO week 19 (odd) — jumps to 15 May (week 20).
      const end = nextCycleEnd(CADENCES.BIWEEKLY_FRIDAY, local(2026, 5, 4));
      expect(end.getDate()).toBe(15);
      expect(end.getDay()).toBe(5);
    });

    it('returns the same Friday when called on Friday of an even ISO week', () => {
      // Fri 15 May 2026 = ISO week 20 (even).
      const end = nextCycleEnd(CADENCES.BIWEEKLY_FRIDAY, local(2026, 5, 15));
      expect(end.getDate()).toBe(15);
    });
  });

  describe('nextCycleEnd() — fallback', () => {
    it('falls back to monthly for an unknown cadence', () => {
      const ref = local(2026, 5, 8);
      const fallback = nextCycleEnd('garbage', ref);
      const monthly = nextCycleEnd(CADENCES.MONTHLY_FIRST, ref);
      expect(fallback.getTime()).toBe(monthly.getTime());
    });
  });

  describe('cycleWindow() — boundary between consecutive cycles', () => {
    it('monthly: start is day 1 at 00:00 and end is last day at 23:59:59.999', () => {
      const { start, end } = cycleWindow(CADENCES.MONTHLY_FIRST, local(2026, 5, 8));
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(end.getDate()).toBe(31);
      expect(end.getMilliseconds()).toBe(999);
    });

    it('monthly: end-of-cycle and next cycle start are 1ms apart', () => {
      const may = cycleWindow(CADENCES.MONTHLY_FIRST, local(2026, 5, 15));
      // Compute the next cycle by stepping one ms past `end`.
      const justAfter = new Date(may.end.getTime() + 1);
      const june = cycleWindow(CADENCES.MONTHLY_FIRST, justAfter);
      expect(june.start.getMonth()).toBe(5); // June
      expect(june.start.getDate()).toBe(1);
      // Equality of "next start minus prev end" must be exactly 1ms.
      expect(june.start.getTime() - may.end.getTime()).toBe(1);
    });

    it('weekly: window spans 7 days inclusive (Sat→Fri local)', () => {
      const { start, end } = cycleWindow(CADENCES.WEEKLY_FRIDAY, local(2026, 5, 8));
      // Spec: start = startOfDay(end - 6 days).
      const diffDays = (end.getTime() - start.getTime()) / 86400000;
      // The diff is ~6.999 days (start 00:00, end 23:59:59.999).
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThan(7);
    });

    it('biweekly: window spans 14 days inclusive', () => {
      const { start, end } = cycleWindow(CADENCES.BIWEEKLY_FRIDAY, local(2026, 5, 1));
      const diffDays = (end.getTime() - start.getTime()) / 86400000;
      expect(diffDays).toBeGreaterThan(13.9);
      expect(diffDays).toBeLessThan(14);
    });

    it('unknown cadence falls back to monthly window', () => {
      const ref = local(2026, 5, 8);
      const fallback = cycleWindow('mystery', ref);
      const monthly = cycleWindow(CADENCES.MONTHLY_FIRST, ref);
      expect(fallback.start.getTime()).toBe(monthly.start.getTime());
      expect(fallback.end.getTime()).toBe(monthly.end.getTime());
    });
  });

  describe('formatCycleLabel()', () => {
    it('returns an em-dash for non-Date / invalid input', () => {
      expect(formatCycleLabel(null)).toBe('—');
      expect(formatCycleLabel(undefined)).toBe('—');
      expect(formatCycleLabel('not a date')).toBe('—');
      expect(formatCycleLabel(new Date('garbage'))).toBe('—');
    });

    it('monthly label includes the month name and year', () => {
      const out = formatCycleLabel(local(2026, 5, 31), CADENCES.MONTHLY_FIRST);
      expect(out).toMatch(/May/);
      expect(out).toMatch(/2026/);
    });

    it('weekly label starts with "Week of"', () => {
      const out = formatCycleLabel(local(2026, 5, 8), CADENCES.WEEKLY_FRIDAY);
      expect(out).toMatch(/Week of /);
    });

    it('biweekly label starts with "Two weeks ending"', () => {
      const out = formatCycleLabel(local(2026, 5, 15), CADENCES.BIWEEKLY_FRIDAY);
      expect(out).toMatch(/Two weeks ending /);
    });

    it('falls back to monthly format for unknown cadence', () => {
      const date = local(2026, 5, 31);
      const fallback = formatCycleLabel(date, 'mystery');
      const monthly = formatCycleLabel(date, CADENCES.MONTHLY_FIRST);
      expect(fallback).toBe(monthly);
    });
  });

  describe('formatPayoutDate()', () => {
    it('returns an em-dash for invalid input', () => {
      expect(formatPayoutDate(null)).toBe('—');
      expect(formatPayoutDate(undefined)).toBe('—');
      expect(formatPayoutDate('nope')).toBe('—');
      expect(formatPayoutDate(new Date('bad'))).toBe('—');
    });

    it('formats a valid Date with day, month, year', () => {
      const out = formatPayoutDate(local(2026, 5, 31));
      expect(out).toMatch(/2026/);
      expect(out).toMatch(/May/);
      expect(out).toMatch(/31/);
    });
  });

  describe('groupCommissionsByPaidCycle()', () => {
    it('returns [] for null / undefined / empty input', () => {
      expect(groupCommissionsByPaidCycle(null, CADENCES.MONTHLY_FIRST)).toEqual([]);
      expect(groupCommissionsByPaidCycle(undefined, CADENCES.MONTHLY_FIRST)).toEqual([]);
      expect(groupCommissionsByPaidCycle([], CADENCES.MONTHLY_FIRST)).toEqual([]);
    });

    it('skips entries without a parseable paidDate', () => {
      const groups = groupCommissionsByPaidCycle(
        [
          { id: 1, amount: 100 }, // no paidDate
          { id: 2, amount: 200, paidDate: null },
          { id: 3, amount: 300, paidDate: 'not a date' },
          { id: 4, amount: 400, paidDate: undefined },
        ],
        CADENCES.MONTHLY_FIRST,
      );
      expect(groups).toEqual([]);
    });

    it('buckets two commissions in the same month into one cycle', () => {
      const groups = groupCommissionsByPaidCycle(
        [
          { id: 1, amount: 100, paidDate: local(2026, 5, 3).toISOString() },
          { id: 2, amount: 250, paidDate: local(2026, 5, 28).toISOString() },
        ],
        CADENCES.MONTHLY_FIRST,
      );
      expect(groups.length).toBe(1);
      expect(groups[0].commissions.length).toBe(2);
      expect(groups[0].total).toBe(350);
    });

    it('sorts buckets newest-cycle-first', () => {
      const groups = groupCommissionsByPaidCycle(
        [
          { id: 1, amount: 1, paidDate: local(2026, 3, 10).toISOString() },
          { id: 2, amount: 1, paidDate: local(2026, 5, 10).toISOString() },
          { id: 3, amount: 1, paidDate: local(2026, 4, 10).toISOString() },
        ],
        CADENCES.MONTHLY_FIRST,
      );
      expect(groups.length).toBe(3);
      // Newest end-of-cycle first.
      expect(groups[0].end.getMonth()).toBe(4); // May
      expect(groups[1].end.getMonth()).toBe(3); // April
      expect(groups[2].end.getMonth()).toBe(2); // March
    });

    it('treats null amount as 0 when summing the bucket total', () => {
      const groups = groupCommissionsByPaidCycle(
        [
          { id: 1, paidDate: local(2026, 5, 3).toISOString() }, // no amount
          { id: 2, amount: null, paidDate: local(2026, 5, 4).toISOString() },
          { id: 3, amount: 75, paidDate: local(2026, 5, 5).toISOString() },
        ],
        CADENCES.MONTHLY_FIRST,
      );
      expect(groups.length).toBe(1);
      expect(groups[0].total).toBe(75);
    });
  });
});
