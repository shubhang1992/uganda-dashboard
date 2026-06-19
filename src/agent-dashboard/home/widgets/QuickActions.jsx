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
export default function QuickActions({ variant = 'mobile' }) {
  const navigate = useNavigate();
  const desktop = variant === 'desktop';

  return (
    <div className={`${styles.row} ${desktop ? styles.desktop : ''}`}>
      <button
        type="button"
        className={`${styles.cta} ${styles.primary}`}
        onClick={() => navigate('/dashboard/onboard')}
      >
        <span className={styles.icon} aria-hidden="true">{onboardIcon(22)}</span>
        <span className={styles.body}>
          <span className={styles.label}>
            {desktop ? 'Sign up a new member' : 'Onboard a new subscriber'}
          </span>
          {desktop && (
            <span className={styles.help}>Add someone new — we&rsquo;ll guide you</span>
          )}
        </span>
      </button>

      <button
        type="button"
        className={`${styles.cta} ${styles.secondary}`}
        onClick={() => navigate('/dashboard/subscribers')}
      >
        <span className={styles.icon} aria-hidden="true">{subscribersIcon(22)}</span>
        <span className={styles.body}>
          <span className={styles.label}>
            {desktop ? 'See your members' : 'View existing subscribers'}
          </span>
          {desktop && (
            <span className={styles.help}>Browse everyone you&rsquo;ve signed up</span>
          )}
        </span>
      </button>
    </div>
  );
}
