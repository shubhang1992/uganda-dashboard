import { useNavigate } from 'react-router-dom';
import PageHeader from '../shell/PageHeader';
import styles from './StubPage.module.css';

export default function StubPage({ title, fallback = '/dashboard/settings' }) {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <PageHeader title={title} fallback={fallback} />
      <div className={styles.body}>
        <div className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 className={styles.title}>Coming up next</h2>
        <p className={styles.text}>
          We&apos;re migrating <strong>{title}</strong> to the new dashboard. It&apos;ll land in the next phase.
        </p>
        <button type="button" className={styles.cta} onClick={() => navigate('/dashboard')}>
          Back to home
        </button>
      </div>
    </div>
  );
}
