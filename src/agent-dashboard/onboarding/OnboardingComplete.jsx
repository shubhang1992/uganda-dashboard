import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, normalizeFrequency, FREQUENCY_LABEL } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useSignup } from '../../signup/SignupContext';
import * as subscriberService from '../../services/subscriber';
import { toCanonicalUGPhone } from '../../utils/phone';
import styles from './OnboardingComplete.module.css';

function formatSchedule(schedule) {
  if (!schedule || !schedule.amount) return null;
  const freq = FREQUENCY_LABEL[normalizeFrequency(schedule.frequency)] || 'Monthly';
  const split = `${schedule.retirementPct ?? 80}% retirement / ${100 - (schedule.retirementPct ?? 80)}% emergency`;
  return `${freq} · ${formatUGXExact(schedule.amount)} · ${split}`;
}

/**
 * Build the payload `create_subscriber_from_agent_onboard` expects from the
 * SignupContext snapshot + the locally-collected contribution schedule. Same
 * shape as the subscriber path — the RPC distinguishes by validating
 * `calling_agent_id` against the auth JWT.
 */
function buildPayload(signup) {
  const schedule = signup.contributionSchedule || {};
  return {
    phone: toCanonicalUGPhone(signup.phone) || signup.phone,
    fullName: signup.fullName,
    dob: signup.dob,
    gender: signup.gender,
    nin: signup.nin,
    email: signup.email?.trim() ? signup.email.trim() : null,
    occupation: signup.occupation || null,
    districtId: signup.districtId,
    consent: !!signup.consent,
    consentTimestamp: signup.consentTimestamp,
    contributionSchedule: {
      frequency: schedule.frequency,
      amount: schedule.amount,
      retirementPct: schedule.retirementPct,
      emergencyPct: schedule.emergencyPct,
      includeInsurance: schedule.includeInsurance ?? false,
    },
    pensionBeneficiaries: signup.pensionBeneficiaries ?? [],
    insuranceBeneficiaries: signup.insuranceBeneficiaries ?? [],
    insuranceSameAsPension: !!signup.insuranceSameAsPension,
    insuranceChoiceMade: !!signup.insuranceChoiceMade,
    paymentMethod: schedule.paymentMethod,
  };
}

export default function OnboardingComplete({ subscriberName, awareness, schedule, onAnother, onClose }) {
  const { user } = useAuth();
  const signup = useSignup();
  const agentId = user?.agentId;

  // Persistence status — drives whether the success copy / actions are
  // available, or an inline error retry surface is shown instead.
  // 'pending' on first paint, 'success' once the RPC returns, 'error' on
  // failure. The fire-on-mount effect runs once per Onboarding success card.
  const [status, setStatus] = useState('pending');
  const [errorMessage, setErrorMessage] = useState('');
  const attemptedRef = useRef(false);

  const persist = useCallback(async () => {
    if (!agentId) {
      setStatus('error');
      setErrorMessage('Your agent profile is missing — please sign in again.');
      return;
    }
    setStatus('pending');
    setErrorMessage('');
    try {
      const payload = buildPayload(signup);
      await subscriberService.createFromAgentOnboard(payload, agentId);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err?.message || "Couldn't create the subscriber. Please retry.");
    }
  }, [agentId, signup]);

  // Fire on mount: by the time the agent sees this success card, the row is
  // persisted (or an inline retry is shown). The Onboard another / Close
  // actions only become available once status === 'success' so the agent
  // can't move on with an orphan UI state. Defer to a microtask so we don't
  // call setState synchronously inside the effect body.
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    Promise.resolve().then(persist);
  }, [persist]);

  const correctCount = Object.values(awareness?.answers || {}).filter((v) => v === true).length;
  const firstName = subscriberName.trim().split(/\s+/)[0] || 'New subscriber';
  const scheduleSummary = formatSchedule(schedule);

  return (
    <div className={styles.wrap}>
      <motion.div
        className={styles.successIcon}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 56 56" width="56" height="56" fill="none">
          <motion.circle
            cx="28" cy="28" r="26"
            stroke="currentColor" strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
            fill="none"
          />
          <motion.path
            d="M16 29l8 8 16-18"
            stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.5, ease: EASE_OUT_EXPO }}
          />
        </svg>
      </motion.div>

      <motion.h3
        className={styles.title}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5, ease: EASE_OUT_EXPO }}
      >
        {firstName} is enrolled
      </motion.h3>

      <motion.p
        className={styles.lead}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6, ease: EASE_OUT_EXPO }}
      >
        The subscriber&apos;s record is created and KYC has been submitted. They&apos;ll receive a welcome SMS with their member ID and next steps shortly.
      </motion.p>

      <motion.dl
        className={styles.summary}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.7, ease: EASE_OUT_EXPO }}
      >
        <div className={styles.summaryRow}>
          <dt>Subscriber</dt>
          <dd>{subscriberName || 'New Subscriber'}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Awareness check</dt>
          <dd>{correctCount}/5 answered correctly</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>KYC status</dt>
          <dd>
            <span className={styles.kycPill}>Submitted</span>
          </dd>
        </div>
        {scheduleSummary && (
          <div className={styles.summaryRow}>
            <dt>Contribution schedule</dt>
            <dd>{scheduleSummary}</dd>
          </div>
        )}
        <div className={styles.summaryRow}>
          <dt>Record</dt>
          <dd aria-live="polite">
            {status === 'pending' && <span className={styles.statusPending}>Saving…</span>}
            {status === 'success' && <span className={styles.statusSaved}>Saved</span>}
            {status === 'error' && <span className={styles.statusError}>Not saved</span>}
          </dd>
        </div>
      </motion.dl>

      {status === 'error' && (
        <motion.div
          className={styles.errorBox}
          role="alert"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
        >
          <p className={styles.errorMessage}>{errorMessage}</p>
          <button type="button" className={styles.retryBtn} onClick={persist}>
            Try again
          </button>
        </motion.div>
      )}

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.85, ease: EASE_OUT_EXPO }}
      >
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onAnother}
          disabled={status !== 'success'}
          aria-disabled={status !== 'success'}
        >
          Onboard another subscriber
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onClose}
          disabled={status !== 'success'}
          aria-disabled={status !== 'success'}
        >
          Close
        </button>
      </motion.div>
    </div>
  );
}
