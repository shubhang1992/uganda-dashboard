import { describe, it, expect } from 'vitest';
import { getInitials, getTrend, perfLevel } from '../dashboard';

describe('dashboard utils', () => {
  describe('getInitials()', () => {
    it('returns two-letter initials for a two-word name', () => {
      expect(getInitials('James Okello')).toBe('JO');
    });

    it('returns two-letter initials for a single-word name', () => {
      expect(getInitials('James')).toBe('J');
    });

    it('returns first two initials for a three-word name', () => {
      expect(getInitials('Mary Grace Atuhaire')).toBe('MG');
    });

    it('returns uppercase initials', () => {
      expect(getInitials('john doe')).toBe('JD');
    });
  });

  describe('getTrend()', () => {
    it('returns "up" when today exceeds 115% of the daily average', () => {
      // weekAvg = 700, daily avg = 100, threshold = 115
      expect(getTrend(120, 700)).toBe('up');
    });

    it('returns "down" when today is below 85% of the daily average', () => {
      // weekAvg = 700, daily avg = 100, threshold = 85
      expect(getTrend(80, 700)).toBe('down');
    });

    it('returns "flat" when today is within the 85%-115% range', () => {
      // weekAvg = 700, daily avg = 100, range = 85-115
      expect(getTrend(100, 700)).toBe('flat');
    });

    it('returns "flat" at exactly the daily average', () => {
      expect(getTrend(100, 700)).toBe('flat');
    });

    it('returns "up" at the boundary (just above 115%)', () => {
      // weekAvg = 700, daily avg = 100, 115.1 > 115
      expect(getTrend(115.1, 700)).toBe('up');
    });

    it('returns "down" at the boundary (just below 85%)', () => {
      // weekAvg = 700, daily avg = 100, 84.9 < 85
      expect(getTrend(84.9, 700)).toBe('down');
    });
  });

  describe('perfLevel()', () => {
    it('returns "high" for 75% and above', () => {
      expect(perfLevel(75)).toBe('high');
      expect(perfLevel(100)).toBe('high');
      expect(perfLevel(90)).toBe('high');
    });

    it('returns "mid" for 55% to 74%', () => {
      expect(perfLevel(55)).toBe('mid');
      expect(perfLevel(65)).toBe('mid');
      expect(perfLevel(74)).toBe('mid');
    });

    it('returns "low" for below 55%', () => {
      expect(perfLevel(54)).toBe('low');
      expect(perfLevel(0)).toBe('low');
      expect(perfLevel(30)).toBe('low');
    });
  });
});
