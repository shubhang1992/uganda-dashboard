import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import { referToAgent } from '../../services/kyc';
import styles from './Step.module.css';
import own from './AgentFallbackStep.module.css';

export default function AgentFallbackStep({ onExit }) {
  const { phone, failureReason, failureStage } = useSignup();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    referToAgent({
      phone,
      reason: failureReason || 'Onboarding could not complete automatically',
      stage: failureStage,
    }).then((res) => {
      if (!cancelled) {
        setTicket(res);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [phone, failureReason, failureStage]);

  return (
    <div className={styles.card}>
      <motion.div
        className={own.icon}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      >
        <svg viewBox="0 0 72 72" width="72" height="72" fill="none" aria-hidden="true">
          <circle cx="36" cy="36" r="34" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="30" cy="30" r="4" fill="currentColor" />
          <circle cx="42" cy="30" r="4" fill="currentColor" />
          <path d="M24 44c3 4 7.5 6 12 6s9-2 12-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
      </motion.div>

      <h2 className={styles.heading} style={{ textAlign: 'center' }}>
        We’ll finish this with an agent
      </h2>
      <p className={styles.subtext} style={{ textAlign: 'center' }}>
        {failureReason
          ? failureReason
          : 'Your onboarding needs a quick in-person check.'} A field agent will contact you shortly to complete verification.
      </p>

      <div className={own.ticket} data-loading={loading || undefined}>
        {loading ? (
          <div className={own.ticketLoading}>
            <span className={own.spinner} aria-hidden="true" />
            <span>Booking an agent for you…</span>
          </div>
        ) : ticket ? (
          <>
            <div className={own.ticketRow}>
              <span className={own.ticketLabel}>Reference</span>
              <span className={own.ticketValue}>{ticket.ticketId}</span>
            </div>
            <div className={own.ticketRow}>
              <span className={own.ticketLabel}>Expected callback</span>
              <span className={own.ticketValue}>{ticket.eta}</span>
            </div>
            <div className={own.ticketRow}>
              <span className={own.ticketLabel}>Contact number</span>
              <span className={own.ticketValue}>+256 {phone || '—'}</span>
            </div>
          </>
        ) : (
          <p className={own.ticketFallback}>
            We couldn’t automatically book an agent. Please call <strong>+256 700 123 456</strong> to finish signing up.
          </p>
        )}
      </div>

      <div className={own.checklist}>
        <span className={own.checklistLabel}>Keep these ready for the agent</span>
        <ul>
          <li>Your National ID (Ndaga Muntu) — original card, not a photocopy</li>
          <li>Your mobile phone with this number active</li>
          <li>A letter from your LC1 or employer if available (optional, speeds things up)</li>
        </ul>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.submit} onClick={onExit}>
          Back to home
        </button>
      </div>
    </div>
  );
}
