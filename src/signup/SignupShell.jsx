import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../utils/finance';
import logo from '../assets/logo.png';
import styles from './SignupShell.module.css';

export const STEPS = [
  { id: 'id-upload',     label: 'Scan your ID' },
  { id: 'review',        label: 'Review details' },
  { id: 'nira',          label: 'NIRA check' },
  { id: 'otp',           label: 'Verify phone' },
  { id: 'liveness',      label: 'Selfie' },
  { id: 'aml',           label: 'Background check' },
  { id: 'beneficiaries', label: 'Beneficiaries' },
  { id: 'consent',       label: 'Consent' },
  { id: 'done',          label: 'All set' },
];

// Terminal states sit outside the numbered flow — the progress indicator
// freezes at the step that triggered the terminal and the bar shifts colour.
export const AGENT_STEP = 'agent';
export const PENDING_REVIEW_STEP = 'pending-review';

export function getStepIndex(stepId) {
  return STEPS.findIndex((s) => s.id === stepId);
}

export default function SignupShell({ stepId, onBack, canBack = true, pinnedStageId, children }) {
  const isPaused = stepId === AGENT_STEP || stepId === PENDING_REVIEW_STEP;
  // When on a terminal state, freeze the progress indicator at the step that
  // triggered it (so the user sees where they are in the journey, not a
  // default "step 1").
  const displayStepId = isPaused && pinnedStageId ? pinnedStageId : stepId;
  const idx = Math.max(0, getStepIndex(displayStepId));
  const pct = Math.round(((idx + 1) / STEPS.length) * 100);
  const terminalLabel =
    stepId === AGENT_STEP ? 'Needs assistance'
    : stepId === PENDING_REVIEW_STEP ? 'Under review'
    : null;
  const label = terminalLabel || STEPS[idx]?.label;
  const stepCounter = isPaused
    ? `Paused at step ${idx + 1}`
    : `Step ${idx + 1} of ${STEPS.length}`;

  useEffect(() => {
    document.documentElement.scrollTo({ top: 0 });
  }, [stepId]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} aria-label="Universal Pensions home">
            <img src={logo} alt="" width={132} height={36} />
          </Link>
          <div className={styles.stepMeta} aria-live="polite">
            <span className={styles.stepCount}>{stepCounter}</span>
            <span className={styles.stepSep} aria-hidden="true">·</span>
            <span className={styles.stepLabel} data-paused={isPaused || undefined}>{label}</span>
          </div>
          <Link to="/" className={styles.exit} aria-label="Exit signup">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </Link>
        </div>

        <div className={styles.progressTrack} data-paused={isPaused || undefined}>
          <motion.div
            className={styles.progressFill}
            data-paused={isPaused || undefined}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
          />
        </div>
      </header>

      <main id="main" className={styles.body}>
        <div className={styles.bodyInner}>
          {canBack && onBack && (
            <button type="button" onClick={onBack} className={styles.back}>
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
          )}
          {children}
        </div>
      </main>

      <footer className={styles.footer}>
        <span>Protected under Uganda's Data Protection and Privacy Act, 2019.</span>
      </footer>
    </div>
  );
}
