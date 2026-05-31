/**
 * Group an agent's paid commission transactions by the calendar month they were
 * paid in. Replaces the old cadence-driven cycle grouping now that the
 * commission flow is a flat `due → paid` (no settlement runs / cadences).
 *
 * Buckets by `YYYY-MM` of each line's `transactionDate` (the paid date),
 * returns the groups newest-month-first, and sums each group's `amount`.
 *
 * @param {Array<{ id, transactionDate, amount }>} paidTransactions
 * @returns {Array<{ key: string, label: string, total: number, lines: object[] }>}
 *   `key` is the `YYYY-MM` bucket; `label` is a human month, e.g. "April 2026".
 */
export function groupByPaidMonth(paidTransactions = []) {
  const buckets = new Map();

  for (const line of paidTransactions) {
    const d = line?.transactionDate ? new Date(line.transactionDate) : null;
    const valid = d && !Number.isNaN(d.getTime());
    // Lines without a parseable paid date fall into an "Unknown" bucket sorted
    // last (its key sorts below any real YYYY-MM string).
    const key = valid
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : '0000-00';
    const label = valid
      ? d.toLocaleDateString('en-UG', { month: 'long', year: 'numeric' })
      : 'Undated';

    let group = buckets.get(key);
    if (!group) {
      group = { key, label, total: 0, lines: [] };
      buckets.set(key, group);
    }
    group.total += line?.amount || 0;
    group.lines.push(line);
  }

  return Array.from(buckets.values()).sort((a, b) => b.key.localeCompare(a.key));
}
