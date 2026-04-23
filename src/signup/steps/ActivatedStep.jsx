import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import logoWhite from '../../assets/logo-white.png';
import styles from './Step.module.css';
import own from './ActivatedStep.module.css';

/**
 * Build a credit-card-style member ID from the phone number.
 * Format: UPU 2026 · 1234 5678  (year + last 8 digits, grouped 4-4).
 */
function formatMemberId(phone) {
  const year = new Date().getFullYear();
  const tail = (phone || '').slice(-8).padStart(8, '0');
  const grouped = `${tail.slice(0, 4)} ${tail.slice(4)}`;
  return `UPU ${year} · ${grouped}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const GENDER_LABEL = { male: 'Male', female: 'Female', other: 'Other' };
const FREQ_CADENCE = {
  weekly: 'every week',
  monthly: 'every month',
  quarterly: 'every 3 months',
  'half-yearly': 'every 6 months',
  annually: 'every year',
};

export default function ActivatedStep({ onFinish }) {
  const navigate = useNavigate();
  const { fullName, phone, dob, gender, contributionSchedule } = useSignup();

  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const memberId = formatMemberId(phone);
  const enrolmentDate = new Date();
  const hasSchedule = Boolean(contributionSchedule);

  function handleOpenSetup() {
    navigate('/signup/contribution');
  }

  return (
    <div className={styles.card}>
      <motion.div
        className={own.successIcon}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
      >
        <svg viewBox="0 0 72 72" width="72" height="72" fill="none" aria-hidden="true">
          <motion.circle
            cx="36" cy="36" r="34"
            stroke="currentColor" strokeWidth="2.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            fill="none"
          />
          <motion.path
            d="M22 37l10 10 19-21"
            stroke="currentColor" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          />
        </svg>
      </motion.div>

      <motion.h2
        className={styles.heading}
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: EASE_OUT_EXPO }}
      >
        You’re all set, {firstName}
      </motion.h2>
      <motion.p
        className={styles.subtext}
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65, ease: EASE_OUT_EXPO }}
      >
        Here’s your Universal Pensions member card. Keep it handy — you’ll need the Member&nbsp;ID when contacting support or topping up through agents.
      </motion.p>

      {/* ── Member card ────────────────────────────────────────────────── */}
      <motion.section
        className={own.memberCard}
        aria-label="Your Universal Pensions member card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.85, ease: EASE_OUT_EXPO }}
      >
        {/* Ambient mesh — one soft indigo glow + one teal glow for depth */}
        <span className={own.cardMesh} aria-hidden="true" />
        <span className={own.cardGrain} aria-hidden="true" />

        <header className={own.cardHeader}>
          <img src={logoWhite} alt="Universal Pensions" width={132} height={28} className={own.cardLogo} />
          <span className={own.cardTierBadge}>Tier 1 · Active</span>
        </header>

        <div className={own.cardBody}>
          <span className={own.cardFieldLabel}>Member</span>
          <h3 className={own.cardName}>{fullName || 'New Member'}</h3>

          <span className={own.cardFieldLabel} style={{ marginTop: '0.9rem' }}>Member ID</span>
          <p className={own.cardMemberId} translate="no">{memberId}</p>
        </div>

        <footer className={own.cardFooter}>
          <div className={own.cardFooterCol}>
            <span className={own.cardFootLabel}>Enrolled</span>
            <span className={own.cardFootValue}>{formatDate(enrolmentDate)}</span>
          </div>
          <div className={own.cardFooterCol}>
            <span className={own.cardFootLabel}>Date of birth</span>
            <span className={own.cardFootValue}>{formatDate(dob)}</span>
          </div>
          <div className={own.cardFooterCol}>
            <span className={own.cardFootLabel}>Gender</span>
            <span className={own.cardFootValue}>{GENDER_LABEL[gender] || '—'}</span>
          </div>
        </footer>
      </motion.section>

      {/* ── Next-up / summary swap ─────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {hasSchedule ? (
          <motion.div
            key="summary"
            className={own.scheduleCard}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
          >
            <div className={own.scheduleHead}>
              <span className={own.nextEyebrow}>Your contribution plan</span>
              <button
                type="button"
                className={own.scheduleEdit}
                onClick={handleOpenSetup}
              >
                Edit
              </button>
            </div>
            <strong className={own.scheduleAmount}>
              {formatUGXExact(contributionSchedule.amount)}
              <span className={own.scheduleCadence}> {FREQ_CADENCE[contributionSchedule.frequency]}</span>
            </strong>
            <div className={own.scheduleSplit} aria-label={`${contributionSchedule.retirementPct} percent retirement, ${contributionSchedule.emergencyPct} percent emergency`}>
              <span className={own.scheduleChip} data-tone="retirement">
                <span className={own.scheduleDot} data-tone="retirement" aria-hidden="true" />
                {contributionSchedule.retirementPct}% Retirement
              </span>
              <span className={own.scheduleChip} data-tone="emergency">
                <span className={own.scheduleDot} data-tone="emergency" aria-hidden="true" />
                {contributionSchedule.emergencyPct}% Emergency
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="next-up"
            className={own.nextBox}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.5, delay: 1.05, ease: EASE_OUT_EXPO }}
          >
            <span className={own.nextEyebrow}>Next up</span>
            <strong className={own.nextTitle}>Make your first contribution</strong>
            <p className={own.nextBody}>
              Set how often, how much, and how to split between retirement and emergency savings. Takes about a minute.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2 }}
      >
        {hasSchedule ? (
          <button type="button" className={styles.submit} onClick={onFinish}>
            Continue
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          <>
            <button type="button" className={styles.submit} onClick={handleOpenSetup}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
                <circle cx="17" cy="15" r="1.5" fill="currentColor"/>
              </svg>
              Make your first contribution
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={onFinish}>
              I’ll do this later
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
