// Subscriber-local copy of the chart presentation config (palette + axis tick +
// custom tooltip), kept inside the subscriber dashboard so the analytics view
// doesn't import across dashboards. Recharts needs concrete colours (not CSS
// vars) for SVG fills, so the brand tokens from src/index.css are mirrored here
// as hex. Copied/adapted from employer-dashboard/reports/chartConfig.jsx.
// (A future refactor could lift this to a shared src/components/charts/.)

import { formatNumber } from '../../utils/currency';
import styles from './chartConfig.module.css';

export const PALETTE = {
  indigo: '#292867',
  indigoSoft: '#5E63A8',
  lavender: '#D9DCF2',
  teal: '#2F8F9D',
  amber: '#FBBF24',
  positive: '#2E8B57',
  alert: '#DC3545',
  gridLine: 'rgba(41, 40, 103, 0.08)',
  text: '#2F3550',
  gray: '#646A80',
};

export const axisTick = { fill: PALETTE.gray, fontSize: 11, fontFamily: 'var(--font-body)' };

/**
 * Custom Recharts `<Tooltip content>` — a small branded card. Pass a
 * `valueFormatter(value, payload)` to format the figure (count, UGX…).
 */
export function chartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={styles.tooltip}>
      {label != null && <div className={styles.tooltipLabel}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color || p.fill || p.payload?.fill }} />
          <span className={styles.tooltipName}>{p.name}</span>
          <span className={styles.tooltipValue}>
            {valueFormatter ? valueFormatter(p.value, p.payload) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
