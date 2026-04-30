import { useNavigate } from 'react-router-dom';
import { formatUGX } from '../../../utils/finance';
import styles from './IfYouNeedItWidget.module.css';

export default function IfYouNeedItWidget({ subscriber }) {
  const navigate = useNavigate();
  const emergency = subscriber?.emergencyBalance || 0;
  const insurance = subscriber?.insurance || {};
  const cover = insurance?.cover || 0;
  const insuranceActive = insurance?.status === 'active';

  return (
    <section className={styles.card} aria-labelledby="needit-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Safety net
        </span>
        <h3 id="needit-title" className={styles.title}>If you need it</h3>
      </header>

      <div className={styles.halves}>
        <button
          type="button"
          className={styles.half}
          onClick={() => navigate('/dashboard/withdraw/savings')}
          aria-label={`Withdraw — ${formatUGX(emergency)} ready in your emergency bucket`}
        >
          <span className={styles.halfIcon} data-tone="withdraw" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={styles.halfStack}>
            <span className={styles.halfLabel}>Withdraw</span>
            <span className={styles.halfValue}>{formatUGX(emergency)} ready</span>
            <span className={styles.halfHint}>From emergency bucket</span>
          </span>
        </button>

        <span className={styles.divider} aria-hidden="true" />

        <button
          type="button"
          className={styles.half}
          onClick={() => navigate('/dashboard/withdraw/claim')}
          aria-label={`File a claim — ${formatUGX(cover)} cover ${insuranceActive ? 'active' : 'inactive'}`}
        >
          <span className={styles.halfIcon} data-tone="claim" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
              <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className={styles.halfStack}>
            <span className={styles.halfLabel}>File a claim</span>
            <span className={styles.halfValue}>
              {cover > 0 ? `${formatUGX(cover)} cover` : 'No cover yet'}
            </span>
            <span className={styles.halfHint} data-tone={insuranceActive ? 'ok' : 'muted'}>
              {cover > 0 ? (insuranceActive ? 'Active' : 'Inactive') : 'Add cover'}
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}
