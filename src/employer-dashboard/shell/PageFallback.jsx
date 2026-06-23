import styles from './EmployerDesktopShell.module.css';

/** Suspense fallback for lazily-loaded desktop pages (shared by the page-gate
 *  wrappers in ../pages). Desktop-only — mobile pages render eagerly. */
export default function PageFallback() {
  return (
    <div className={styles.pageFallback}>
      <div className={styles.spinner} />
    </div>
  );
}
