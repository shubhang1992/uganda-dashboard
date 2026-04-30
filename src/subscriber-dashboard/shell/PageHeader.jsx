import { useNavigate } from 'react-router-dom';
import { goBackOrFallback } from './navigation';
import styles from './PageHeader.module.css';

export default function PageHeader({ title, subtitle, backTo, onBack, fallback = '/dashboard' }) {
  const navigate = useNavigate();
  function handleBack() {
    if (onBack) return onBack();
    if (backTo !== undefined) return navigate(backTo);
    goBackOrFallback(navigate, fallback);
  }
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={handleBack}
        aria-label="Back"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className={styles.titleStack}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  );
}
