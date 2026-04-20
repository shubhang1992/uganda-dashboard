import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  const isComplete = stepId === 'done';
  const terminalLabel =
    stepId === AGENT_STEP ? 'Needs assistance'
    : stepId === PENDING_REVIEW_STEP ? 'Under review'
    : null;
  const label = terminalLabel || STEPS[idx]?.label;

  const mainRef = useRef(null);

  useEffect(() => {
    document.documentElement.scrollTo({ top: 0 });
    // Move focus to the step container on each transition so screen-reader
    // users land on the new content instead of a stale button that unmounted.
    // The element is programmatically focusable (tabIndex={-1}) so it doesn't
    // become part of the normal tab order.
    const el = mainRef.current;
    if (el) {
      const frame = requestAnimationFrame(() => el.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [stepId]);

  // Ring geometry — 28px box, 12px radius, 2.5px stroke.
  const RING_CIRCUMFERENCE = 2 * Math.PI * 12;
  const progress = isComplete ? 1 : (idx + 1) / STEPS.length;
  const ringDashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} aria-label="Universal Pensions home">
            <img src={logo} alt="" width={132} height={36} />
          </Link>

          {/* Compact step indicator — SVG progress ring with number inside,
              plus a label that crossfades on transition. Replaces the
              separate counter-pill + ladder-bar combo. */}
          <div
            className={styles.stepMeta}
            aria-live="polite"
            role="progressbar"
            aria-valuenow={idx + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuetext={`${label} — step ${idx + 1} of ${STEPS.length}`}
          >
            <div
              className={styles.ring}
              data-paused={isPaused || undefined}
              data-complete={isComplete || undefined}
            >
              <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={styles.ringTrack}
                />
                <motion.circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  initial={false}
                  animate={{ strokeDashoffset: ringDashOffset }}
                  transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                  className={styles.ringFill}
                  transform="rotate(-90 14 14)"
                />
              </svg>
              <div className={styles.ringCenter}>
                <AnimatePresence mode="wait" initial={false}>
                  {isComplete ? (
                    <motion.svg
                      key="check"
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      fill="none"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    >
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </motion.svg>
                  ) : (
                    <motion.span
                      key={`num-${idx}`}
                      className={styles.ringNum}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                    >
                      {idx + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.span
                key={displayStepId + (isPaused ? '-paused' : '')}
                className={styles.stepLabel}
                data-paused={isPaused || undefined}
                data-complete={isComplete || undefined}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
              >
                {label}
              </motion.span>
            </AnimatePresence>
          </div>

          <Link to="/" className={styles.exit} aria-label="Exit signup">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </Link>
        </div>
      </header>

      <main id="main" className={styles.body}>
        <div
          ref={mainRef}
          tabIndex={-1}
          className={styles.bodyInner}
          aria-label={terminalLabel ? `${terminalLabel}` : `Step ${idx + 1} of ${STEPS.length}: ${label}`}
        >
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
        <span>Protected under Uganda’s Data Protection and Privacy Act, 2019.</span>
      </footer>
    </div>
  );
}
