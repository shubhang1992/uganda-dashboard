import styles from './TopBar.module.css';

export default function TopBar() {
  return (
    <div className={styles.topBar}>
      <button className={styles.btn}>
        <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
          <path d="M3 4h14M3 10h14M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Filters
      </button>
      <button className={styles.btn}>
        <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
          <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Download
      </button>
    </div>
  );
}
