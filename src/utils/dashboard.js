export function getInitials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function getTrend(today, weekAvg) {
  const avg = weekAvg / 7;
  if (today > avg * 1.15) return 'up';
  if (today < avg * 0.85) return 'down';
  return 'flat';
}

export function perfLevel(pct) {
  if (pct >= 75) return 'high';
  if (pct >= 55) return 'mid';
  return 'low';
}
