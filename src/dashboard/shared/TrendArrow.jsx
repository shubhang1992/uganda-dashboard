import { memo } from 'react';
import styles from './TrendArrow.module.css';

const TrendArrow = ({ trend }) => (
  <span className={styles.trendBadge} data-trend={trend}>
    {trend === 'up' && (
      <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10">
        <path d="M6 9V3M6 3L3 6M6 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
    {trend === 'down' && (
      <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10">
        <path d="M6 3v6M6 9L3 6M6 9l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
    {trend === 'flat' && (
      <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10">
        <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )}
  </span>
);

export default memo(TrendArrow);
