import { useNavigate } from 'react-router-dom';
import { onboardIcon, subscribersIcon } from '../../shell/agentNav';
import styles from './QuickActions.module.css';

/**
 * QuickActions — the two primary agent CTAs on mobile Home, sitting between the
 * MonthlyDataCard and the Co-Pilot: onboard a new subscriber (the primary,
 * filled-indigo action) and view the existing book (secondary). These mirror the
 * bottom-tab destinations but surface them as prominent, thumb-reachable cards on
 * the home surface. Glyphs reuse the shared agentNav icon factories so they match
 * the nav rail; routes match the agent router (/dashboard/onboard, /subscribers).
 */
export default function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={`${styles.cta} ${styles.primary}`}
        onClick={() => navigate('/dashboard/onboard')}
      >
        <span className={styles.icon} aria-hidden="true">{onboardIcon(22)}</span>
        <span className={styles.label}>Onboard a new subscriber</span>
      </button>

      <button
        type="button"
        className={`${styles.cta} ${styles.secondary}`}
        onClick={() => navigate('/dashboard/subscribers')}
      >
        <span className={styles.icon} aria-hidden="true">{subscribersIcon(22)}</span>
        <span className={styles.label}>View existing subscribers</span>
      </button>
    </div>
  );
}
