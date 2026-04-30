import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact } from '../../../utils/finance';
import styles from './TopUpWidget.module.css';

const FREQ_LABEL = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  semiAnnually: 'Half-yearly',
  halfYearly: 'Half-yearly',
  annually: 'Annually',
  yearly: 'Annually',
};

const QUICK_AMOUNTS = [10000, 25000, 50000, 100000];

function formatDueDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' });
}

export default function TopUpWidget({ subscriber }) {
  const navigate = useNavigate();
  const schedule = subscriber?.contributionSchedule;
  const hasSchedule = Boolean(schedule?.amount);
  const dueLabel = formatDueDate(schedule?.nextDueDate);
  const freq = schedule?.frequency ? FREQ_LABEL[schedule.frequency] : null;

  function payScheduled() {
    if (!hasSchedule) return;
    navigate('/dashboard/save', { state: { prefillAmount: schedule.amount } });
  }
  function topUpWith(amount) {
    navigate('/dashboard/save', { state: { prefillAmount: amount } });
  }
  function topUpCustom() {
    navigate('/dashboard/save');
  }
  function setUpSchedule() {
    navigate('/dashboard/save/schedule');
  }

  return (
    <section className={styles.card} aria-labelledby="topup-title">
      <header className={styles.head}>
        <div className={styles.headStack}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Saving
          </span>
          <h3 id="topup-title" className={styles.title}>Make a contribution</h3>
        </div>
        {hasSchedule && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={setUpSchedule}
            aria-label="Change schedule"
            title="Change schedule"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
              <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </header>

      {/* ── Featured: pay scheduled OR set up schedule ── */}
      {hasSchedule ? (
        <motion.button
          type="button"
          className={styles.featured}
          onClick={payScheduled}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
        >
          <span className={styles.featuredMesh} aria-hidden="true" />
          <span className={styles.featuredGrain} aria-hidden="true" />
          <div className={styles.featuredText}>
            <span className={styles.featuredEyebrow}>
              <span className={styles.featuredPulse} aria-hidden="true" />
              Due {dueLabel || 'this cycle'}
            </span>
            <span className={styles.featuredAmount}>{formatUGXExact(schedule.amount)}</span>
            {freq && <span className={styles.featuredHint}>{freq} contribution</span>}
          </div>
          <span className={styles.featuredCta} aria-hidden="true">
            <span className={styles.featuredCtaText}>Pay now</span>
            <span className={styles.featuredCtaArrow}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </span>
        </motion.button>
      ) : (
        <motion.button
          type="button"
          className={styles.featured}
          data-empty="true"
          onClick={setUpSchedule}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.featuredText}>
            <span className={styles.featuredEyebrow}>Get started</span>
            <span className={styles.featuredEmptyTitle}>Set a schedule</span>
            <span className={styles.featuredHint}>Save regularly · auto-debit any cadence</span>
          </div>
          <span className={styles.featuredCta} aria-hidden="true" data-empty="true">
            <span className={styles.featuredCtaText}>Set up</span>
            <span className={styles.featuredCtaArrow}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </span>
        </motion.button>
      )}

      {/* ── Or top up extra: chip row ── */}
      <div className={styles.extra}>
        <span className={styles.extraLabel}>Or top up an extra</span>
        <div className={styles.chipRow}>
          {QUICK_AMOUNTS.map((amt) => (
            <button
              key={amt}
              type="button"
              className={styles.chip}
              onClick={() => topUpWith(amt)}
            >
              {formatUGX(amt)}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.chip} ${styles.chipCustom}`}
            onClick={topUpCustom}
          >
            Custom
            <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
