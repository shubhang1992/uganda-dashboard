import { memo } from 'react';
import styles from './KpiCard.module.css';

function KpiCard({ icon, label, value, suffix, className }) {
  return (
    <div className={className ? `${styles.kpiCard} ${className}` : styles.kpiCard}>
      <div className={styles.kpiIcon}>{icon}</div>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}{suffix && <span className={styles.kpiSuffix}>{suffix}</span>}</div>
    </div>
  );
}

export default memo(KpiCard);
