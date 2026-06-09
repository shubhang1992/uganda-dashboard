import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { formatUGX } from '../../utils/currency';

import { formatMemberId } from '../../utils/memberId';
import { useSignup } from '../SignupContext';
import { openPolicyCertificate } from '../contribution/insurancePolicyCertificate';
import logoWhite from '../../assets/logo-white.png';
import styles from './Step.module.css';
import own from './ActivatedStep.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const GENDER_LABEL = { male: 'Male', female: 'Female', other: 'Other' };

function addYears(date, n) {
  const r = new Date(date);
  r.setFullYear(r.getFullYear() + n);
  return r;
}

export default function ActivatedStep({ onFinish, snapshot }) {
  const ctx = useSignup();
  const data = snapshot ?? ctx;
  const { fullName, phone, dob, gender, contributionSchedule } = data;

  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const memberId = formatMemberId(phone);
  const enrolmentDate = new Date();
  const hasInsurance = Boolean(contributionSchedule?.includeInsurance);

  function handleDownloadPolicy() {
    const ok = openPolicyCertificate({
      holderName: fullName,
      memberId,
      dob,
      cover: contributionSchedule.insuranceCover,
      premiumPerPeriod: contributionSchedule.insurancePremium,
      frequency: contributionSchedule.frequency,
      policyStart: enrolmentDate,
      renewalDate: addYears(enrolmentDate, 1),
      beneficiaries: data.insuranceBeneficiaries ?? [],
    });
    if (!ok) {
      // Pop-up blocked. Demo-level fallback — no toast context here.
      window.alert('Please allow pop-ups for this site and try again to download your certificate.');
    }
  }

  return (
    <div className={styles.card}>
      <motion.div
        className={own.successIcon}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
      >
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none" aria-hidden="true">
          <motion.circle
            cx="24" cy="24" r="22"
            stroke="currentColor" strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            fill="none"
          />
          <motion.path
            d="M15 24.5l6.5 6.5L33 17.5"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          />
        </svg>
      </motion.div>

      <motion.h2
        className={`${styles.heading} textCenter`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: EASE_OUT_EXPO }}
      >
        You’re all set, {firstName}
      </motion.h2>
      <motion.p
        className={`${styles.subtext} textCenter`}
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

      {/* ── Insurance policy: compact single-row download affordance ────── */}
      {hasInsurance && (
        <motion.button
          type="button"
          className={own.policyBar}
          onClick={handleDownloadPolicy}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: EASE_OUT_EXPO }}
        >
          <span className={own.policyShield} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className={own.policyText}>
            Life insurance · {formatUGX(contributionSchedule.insuranceCover, { compact: false })} cover
          </span>
          <span className={own.policyAction}>
            Download
            <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none">
              <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </motion.button>
      )}

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2 }}
      >
        <button type="button" className={styles.submit} onClick={onFinish}>
          Continue
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </motion.div>
    </div>
  );
}
