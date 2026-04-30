import { memo } from 'react';
import { formatUGX } from '../../utils/finance';
import styles from './MiniChart.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MiniChart({ data }) {
  const max = Math.max(...data, 1);
  const peakIdx = data.indexOf(max);
  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartBars}>
        {data.map((v, i) => (
          <div key={i} className={styles.chartBar} data-peak={i === peakIdx} style={{ height: `${Math.max((v / max) * 100, 4)}%` }} title={`${MONTHS[i]}: ${formatUGX(v)}`} />
        ))}
      </div>
      <div className={styles.chartLabels}>
        {MONTHS.map((m) => <span key={m} className={styles.chartLabel}>{m}</span>)}
      </div>
    </div>
  );
}

export default memo(MiniChart);
