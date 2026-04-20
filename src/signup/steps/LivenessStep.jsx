import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import { faceMatch } from '../../services/kyc';
import styles from './Step.module.css';
import own from './LivenessStep.module.css';

const PHASES = {
  idle: 'idle',
  capturing: 'capturing',
  analyzing: 'analyzing',
  ok: 'ok',
  livenessFail: 'liveness-fail',
  faceFail: 'face-fail',
};

export default function LivenessStep({ onNext, onAgentFallback }) {
  const signup = useSignup();
  const [phase, setPhase] = useState(PHASES.idle);
  const autoAdvanceTimer = useRef(null);

  const livenessRetryUsed = signup.livenessRetryUsed;

  // Auto-advance once the face match succeeds — give the user ~1.1s to see
  // the checkmark + "All good" status before moving to the next step.
  useEffect(() => {
    if (phase !== PHASES.ok) return undefined;
    autoAdvanceTimer.current = setTimeout(() => onNext(), 1100);
    return () => clearTimeout(autoAdvanceTimer.current);
  }, [phase, onNext]);

  async function startCapture() {
    setPhase(PHASES.capturing);
    await wait(700);
    setPhase(PHASES.analyzing);
    try {
      const result = await faceMatch({ selfieFile: null, nin: signup.nin });
      if (result.outcome === 'ok') {
        signup.patch({ faceMatchOutcome: 'ok' });
        setPhase(PHASES.ok);
      } else if (result.outcome === 'liveness-fail') {
        signup.patch({ faceMatchOutcome: 'liveness-fail' });
        setPhase(PHASES.livenessFail);
      } else {
        signup.patch({ faceMatchOutcome: 'no-match' });
        setPhase(PHASES.faceFail);
      }
    } catch (e) {
      signup.patch({ faceMatchOutcome: 'no-match' });
      setPhase(PHASES.faceFail);
      void e;
    }
  }

  function retry() {
    signup.patch({ livenessRetryUsed: true, faceMatchOutcome: null });
    setPhase(PHASES.idle);
  }

  const busy = phase === PHASES.capturing || phase === PHASES.analyzing;

  /* ── Liveness failure: allow one retry, then block → agent ──────────── */
  if (phase === PHASES.livenessFail) {
    if (!livenessRetryUsed) {
      return (
        <div className={styles.card}>
          <motion.div
            className={own.resultIcon}
            data-kind="warn"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
          >
            <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
              <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M28 16v14M28 38v2" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </motion.div>
          <h2 className={styles.heading} style={{ textAlign: 'center' }}>Let’s try that again</h2>
          <p className={styles.subtext} style={{ textAlign: 'center' }}>
            We couldn’t confirm that was a live person. Face the camera directly in good lighting — no hats or glasses.
          </p>
          <p className={own.retryNotice} role="status">
            You have <strong>1 retry</strong> remaining. If it fails again, an agent will help you in person.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.submit} onClick={retry}>
              Retake selfie
            </button>
          </div>
        </div>
      );
    }
    // Already used the one retry → route to agent
    return <TerminalBlock onAgentFallback={onAgentFallback} kind="liveness" />;
  }

  if (phase === PHASES.faceFail) {
    return <TerminalBlock onAgentFallback={onAgentFallback} kind="face" />;
  }

  /* ── Main capture UI ────────────────────────────────────────────────── */
  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 5 · Selfie</span>
      <h2 className={styles.heading}>Take a quick selfie</h2>
      <p className={styles.subtext}>
        A live-person check matches your face to your NIRA photo. Takes under 30&nbsp;seconds.
      </p>

      <div className={own.frame} data-phase={phase}>
        <div className={own.frameInner}>
          <svg aria-hidden="true" viewBox="0 0 200 200" className={own.silhouette}>
            <circle cx="100" cy="78" r="32" fill="currentColor" opacity="0.35"/>
            <path d="M40 180c0-33 27-54 60-54s60 21 60 54" fill="currentColor" opacity="0.35"/>
          </svg>
          <div className={own.oval} />

          <AnimatePresence>
            {phase === PHASES.analyzing && (
              <motion.div
                className={own.scanTrack}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.span
                  className={own.scanSweep}
                  initial={{ y: '-40%' }}
                  animate={{ y: ['-40%', '40%', '-40%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === PHASES.capturing && (
              <motion.div
                className={own.flash}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.6, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === PHASES.ok && (
              <motion.div
                className={own.checkIcon}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
              >
                <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
                  <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.5"/>
                  <path d="M17 28l7 7 15-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={own.cornerGuides} aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </div>

      <div className={own.statusLine} aria-live="polite">
        {phase === PHASES.idle && 'Face the camera when you’re ready'}
        {phase === PHASES.capturing && 'Hold steady…'}
        {phase === PHASES.analyzing && 'Checking live-person match…'}
        {phase === PHASES.ok && 'All good — face matched. Taking you to the next step…'}
      </div>

      <div className={styles.actions}>
        {phase === PHASES.idle && (
          <button type="button" className={styles.submit} onClick={startCapture}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path d="M5 7h3l2-2h4l2 2h3a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.75"/>
            </svg>
            Take selfie
          </button>
        )}

        {busy && (
          <button type="button" className={styles.submit} disabled data-loading>
            <span className={own.btnSpinner} aria-hidden="true" />
            {phase === PHASES.capturing ? 'Capturing…' : 'Checking…'}
          </button>
        )}

        {phase === PHASES.ok && (
          <button type="button" className={styles.submit} disabled data-loading>
            <span className={own.btnSpinner} aria-hidden="true" />
            Continuing…
          </button>
        )}
      </div>
    </div>
  );
}

function TerminalBlock({ onAgentFallback, kind }) {
  const copy = kind === 'liveness'
    ? 'We still couldn’t confirm a live person. An agent can verify you in person.'
    : 'Your selfie didn’t match the photo on your ID. An agent will help you finish this in person.';
  return (
    <div className={styles.card}>
      <motion.div
        className={own.resultIcon}
        data-kind="error"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      >
        <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
          <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.5"/>
          <path d="M19 19l18 18M37 19L19 37" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      </motion.div>

      <h2 className={styles.heading} style={{ textAlign: 'center' }}>
        {kind === 'liveness' ? 'Verification paused' : 'Selfie didn’t match'}
      </h2>
      <p className={styles.subtext} style={{ textAlign: 'center' }}>{copy}</p>

      <div className={styles.actions}>
        <button type="button" className={styles.submit} onClick={onAgentFallback}>
          Get help from an agent
        </button>
      </div>
    </div>
  );
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
