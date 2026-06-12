import { memo } from 'react';
import styles from './MetricTile.module.css';

/**
 * MetricTile — desktop dashboard metric surface (subscriber + agent Home only).
 *
 * Gives the desktop metric rows the hierarchy the shared KpiCard deliberately
 * doesn't carry. Two variants:
 *   • variant="primary"   — filled-indigo focal metric: white text, a large
 *     value (the caller animates the count-up), and an arbitrary statRow
 *     (units · invested · growth, or subscribers · active).
 *   • default (secondary) — elevated glass tile with an explicit accent rail, a
 *     tinted icon chip, and a muted context sub-line pinned to the bottom edge.
 *
 * Tint is driven by the explicit `accent` prop (indigo | teal | lavender |
 * green), NOT a :nth-child rule. The agent Home wraps each tile in a <Link>,
 * which reset KpiCard's :nth-child tinting so every icon rendered indigo; an
 * explicit prop is wrap-order-independent and fixes that.
 *
 * Presentational only — callers that navigate wrap the tile in a <Link>; the
 * tile fills its wrapper (height:100%) so the whole cell is the hit target.
 *
 * Scoped to the two desktop Home roots; every other dashboard still uses the
 * shared KpiCard, which this component does not modify.
 */
function MetricTile({
  variant = 'secondary',
  accent = 'indigo',
  icon,
  label,
  value,
  context,   // secondary: muted sub-line (string or node)
  statRow,   // primary: arbitrary node rendered under the value
  className = '',
}) {
  const isPrimary = variant === 'primary';
  const root = [
    styles.tile,
    isPrimary ? styles.primary : styles.secondary,
    isPrimary ? '' : styles[`accent_${accent}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={root}>
      {isPrimary && <span className={styles.glow} aria-hidden="true" />}
      {icon && <div className={styles.iconChip}>{icon}</div>}
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {statRow && <div className={styles.statRow}>{statRow}</div>}
      {context != null && <div className={styles.context}>{context}</div>}
    </div>
  );
}

export default memo(MetricTile);
