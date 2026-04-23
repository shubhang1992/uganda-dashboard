/**
 * Extract up to 2 initials from a name string.
 * @param {string} name - Full name
 * @returns {string} Uppercase initials (e.g. "JD")
 */
export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Determine trend direction by comparing today's value to a weekly average.
 * @param {number} today - Today's metric value
 * @param {number} weekAvg - Cumulative weekly value (divided by 7 internally)
 * @returns {'up'|'down'|'flat'} Trend direction
 */
export function getTrend(today, weekAvg) {
  const avg = weekAvg / 7;
  if (today > avg * 1.15) return 'up';
  if (today < avg * 0.85) return 'down';
  return 'flat';
}

/**
 * Classify a percentage into a performance tier.
 * @param {number} pct - Percentage value (0-100)
 * @returns {'high'|'mid'|'low'} Performance level
 */
export function perfLevel(pct) {
  if (pct >= 75) return 'high';
  if (pct >= 55) return 'mid';
  return 'low';
}
