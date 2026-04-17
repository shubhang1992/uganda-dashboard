import styles from './Demographics.module.css';

export default function Demographics({ metrics }) {
  const m = metrics;
  const ageTotal = Object.values(m.ageDistribution).reduce((s, x) => s + x, 0);
  return (
    <div className={styles.demoRow}>
      <div className={styles.demoCard}>
        <div className={styles.demoTitle}>Gender</div>
        {['male', 'female', 'other'].map((g) => (
          <div key={g} className={styles.demoItem}>
            <span className={styles.demoItemLabel} style={{ textTransform: 'capitalize' }}>{g}</span>
            <div className={styles.demoBar}><div className={styles.demoBarFill} style={{ width: `${m.genderRatio[g]}%` }} /></div>
            <span className={styles.demoItemValue}>{m.genderRatio[g]}%</span>
          </div>
        ))}
      </div>
      <div className={styles.demoCard}>
        <div className={styles.demoTitle}>Age</div>
        {Object.entries(m.ageDistribution).map(([k, v]) => {
          const pct = ageTotal ? Math.round((v / ageTotal) * 100) : 0;
          return (
            <div key={k} className={styles.demoItem}>
              <span className={styles.demoItemLabel}>{k}</span>
              <div className={styles.demoBar}><div className={styles.demoBarFill} style={{ width: `${pct}%` }} /></div>
              <span className={styles.demoItemValue}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
