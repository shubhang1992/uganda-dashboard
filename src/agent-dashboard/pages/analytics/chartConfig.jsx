import { formatNumber } from '../../../utils/currency';
import styles from '../AnalyticsPage.module.css';

export const PALETTE = {
  indigo: '#292867',
  indigoSoft: '#5E63A8',
  lavender: '#D9DCF2',
  teal: '#2F8F9D',
  amber: '#FBBF24',
  positive: '#4ADE80',
  gridLine: 'rgba(41, 40, 103, 0.08)',
  text: '#2F3550',
  gray: '#8A90A6',
};

export const GENDER_COLORS = [PALETTE.indigo, PALETTE.teal, PALETTE.lavender];

export const axisTick = { fill: PALETTE.gray, fontSize: 11, fontFamily: 'var(--font-body)' };

export function chartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={styles.tooltip}>
      {label != null && <div className={styles.tooltipLabel}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color || p.fill }} />
          <span className={styles.tooltipName}>{p.name}</span>
          <span className={styles.tooltipValue}>
            {valueFormatter ? valueFormatter(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
