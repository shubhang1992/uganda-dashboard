import { useNavigate } from 'react-router-dom';
import { formatUGX } from '../../../utils/finance';
import styles from './IfYouNeedItWidget.module.css';

export default function IfYouNeedItWidget({ subscriber }) {
  const navigate = useNavigate();
  const emergency = subscriber?.emergencyBalance || 0;
  const insurance = subscriber?.insurance || {};
  const cover = insurance?.cover || 0;
  const insuranceActive = insurance?.status === 'active';

  const claimValue = cover > 0 ? `${formatUGX(cover)} cover` : 'No cover yet';
  const claimHint = cover > 0
    ? insuranceActive ? 'Active · file in minutes' : 'Inactive · reactivate to claim'
    : 'Add insurance protection';

  return (
    <section className={styles.card} aria-labelledby="needit-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Safety net
        </span>
        <h3 id="needit-title" className={styles.title}>If you need it</h3>
      </header>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          onClick={() => navigate('/dashboard/withdraw/savings')}
          aria-label={`Withdraw — ${formatUGX(emergency)} ready in your emergency bucket`}
        >
          <span className={styles.ctaIcon} data-tone="withdraw" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={styles.ctaBody}>
            <span className={styles.ctaTitle}>Withdraw</span>
            <span className={styles.ctaMeta}>
              <strong className={styles.ctaValue}>{formatUGX(emergency)}</strong>
              <span className={styles.ctaSep} aria-hidden="true">·</span>
              <span className={styles.ctaHint}>From your emergency bucket</span>
            </span>
          </span>
          <span className={styles.ctaChevron} aria-hidden="true">
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>

        <button
          type="button"
          className={styles.cta}
          onClick={() => navigate('/dashboard/withdraw/claim')}
          aria-label={`File a claim — ${claimValue}, ${claimHint}`}
        >
          <span className={styles.ctaIcon} data-tone="claim" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
              <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className={styles.ctaBody}>
            <span className={styles.ctaTitle}>File a claim</span>
            <span className={styles.ctaMeta}>
              <strong className={styles.ctaValue} data-muted={cover === 0 || undefined}>
                {claimValue}
              </strong>
              <span className={styles.ctaSep} aria-hidden="true">·</span>
              <span className={styles.ctaHint}>{claimHint}</span>
            </span>
          </span>
          <span className={styles.ctaChevron} aria-hidden="true">
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      </div>
    </section>
  );
}
