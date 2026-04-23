import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact } from '../../utils/finance';
import { useCurrentSubscriber, useMakeContribution } from '../../hooks/useSubscriber';
import { useDashboard } from '../../contexts/DashboardContext';
import { useToast } from '../../contexts/ToastContext';
import styles from './ContributeCard.module.css';

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 250000];
const MIN_CONTRIBUTION = 5000;

function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return Number.parseInt(cleaned, 10);
}

export default function ContributeCard() {
  const { data: subscriber } = useCurrentSubscriber();
  const { addToast } = useToast();
  const makeContribution = useMakeContribution(subscriber?.id);

  const {
    setWithdrawOpen,
    setInsuranceOpen,
    setInsuranceTab,
    closeAllPanels,
  } = useDashboard();

  const [amountStr, setAmountStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justContributed, setJustContributed] = useState(null);

  const amount = parseAmount(amountStr);
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;

  const newBalance = useMemo(() => {
    if (!subscriber) return 0;
    return (subscriber.netBalance || 0) + (hasAmount ? amount : 0);
  }, [subscriber, hasAmount, amount]);

  useEffect(() => {
    if (!justContributed) return;
    const t = setTimeout(() => setJustContributed(null), 4000);
    return () => clearTimeout(t);
  }, [justContributed]);

  async function handleContribute() {
    if (!hasAmount || !subscriber) return;
    setSubmitting(true);
    try {
      await makeContribution.mutateAsync({
        amount,
        retirementPct: subscriber?.contributionSchedule?.retirementPct ?? 80,
        method: 'MTN Mobile Money',
      });
      addToast('success', `${formatUGXExact(amount)} added to your savings.`);
      setJustContributed(amount);
      setAmountStr('');
    } finally {
      setSubmitting(false);
    }
  }

  function openWithdraw() {
    closeAllPanels();
    setWithdrawOpen(true);
  }
  function openClaim() {
    closeAllPanels();
    setInsuranceTab('claims');
    setInsuranceOpen(true);
  }

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: EASE_OUT_EXPO }}
    >
      <div className={styles.header}>
        <span className={styles.eyebrow}>Quick actions</span>
        <h2 className={styles.title}>Top up your savings</h2>
        <p className={styles.subtitle}>Add funds now, or jump to a withdrawal or claim.</p>
      </div>

      <div className={styles.body}>
        {/* ── Amount ─────────────────────────────────────────────── */}
        <label className={styles.amountField} data-error={belowMin || undefined}>
          <span className={styles.amountPrefix} aria-hidden="true">UGX</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={amountStr ? Number.parseInt(amountStr, 10).toLocaleString('en-UG') : ''}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Enter amount"
            className={styles.amountInput}
            aria-label="Contribution amount in UGX"
            aria-invalid={belowMin}
          />
        </label>

        <div className={styles.presetRow} role="group" aria-label="Quick amount selection">
          {PRESET_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              className={styles.presetChip}
              data-active={amount === v}
              aria-pressed={amount === v}
              onClick={() => setAmountStr(String(v))}
            >
              {formatUGX(v)}
            </button>
          ))}
        </div>

        <div role="alert" aria-live="polite" className={styles.errorSlot}>
          {belowMin && (
            <p className={styles.errorLine}>
              Minimum {formatUGXExact(MIN_CONTRIBUTION)} required.
            </p>
          )}
        </div>

        {hasAmount && (
          <div className={styles.projection}>
            <span className={styles.projectionLabel}>After this top-up</span>
            <span className={styles.projectionValue}>{formatUGXExact(newBalance)}</span>
          </div>
        )}
      </div>

      {/* ── Primary CTA ─────────────────────────────────────────── */}
      <div className={styles.primaryRow}>
        <AnimatePresence mode="wait">
          {justContributed ? (
            <motion.div
              key="success"
              className={styles.successBanner}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <path d="M5 8l2 2 4-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span>{formatUGXExact(justContributed)} added to your savings.</span>
            </motion.div>
          ) : (
            <motion.button
              key="cta"
              type="button"
              className={styles.primaryBtn}
              disabled={!hasAmount || submitting}
              onClick={handleContribute}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {submitting ? 'Processing…' : hasAmount ? `Contribute ${formatUGXExact(amount)}` : 'Enter an amount to continue'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Secondary actions ───────────────────────────────────── */}
      <div className={styles.secondaryRow}>
        <button type="button" className={styles.secondaryBtn} onClick={openWithdraw}>
          <span className={styles.secondaryIcon} data-tone="teal" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={styles.secondaryText}>
            <span className={styles.secondaryLabel}>Withdraw</span>
            <span className={styles.secondaryHelper}>Access your savings</span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.secondaryArrow}>
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </button>

        <button type="button" className={styles.secondaryBtn} onClick={openClaim}>
          <span className={styles.secondaryIcon} data-tone="amber" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
              <path d="M12 9v4M12 16v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={styles.secondaryText}>
            <span className={styles.secondaryLabel}>File a claim</span>
            <span className={styles.secondaryHelper}>Insurance payout</span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.secondaryArrow}>
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
