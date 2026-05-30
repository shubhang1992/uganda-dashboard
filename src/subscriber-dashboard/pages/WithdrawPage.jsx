import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX, calcFV, parseAmount } from '../../utils/finance';
import { formatNumber } from '../../utils/currency';
import { useCurrentSubscriber, useRequestWithdrawal } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import { MIN_WITHDRAW, RETIREMENT_AGE } from '../../constants/savings';
import HeroCapsule from '../../components/HeroCapsule';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import { goBackOrFallback } from '../shell/navigation';
import styles from './WithdrawPage.module.css';

// Free-text reason labels. The default value stays "medical" (preserved from
// the prior form) — `value` is the lowercase id, `label` the free-text written
// into the withdrawal payload's `reason`.
const REASONS = [
  { id: 'medical',   value: 'medical',   label: 'Medical' },
  { id: 'education', value: 'education', label: 'Education' },
  { id: 'housing',   value: 'home',      label: 'Home' },
  { id: 'other',     value: 'other',     label: 'Other' },
];

// Payout methods — kept so the WithdrawalsHistory report's method column
// survives. The label is what's written to the payload (default "MTN Mobile
// Money", matching the service default).
const METHODS = [
  { id: 'mtn',    label: 'MTN Mobile Money' },
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'bank',   label: 'Bank transfer' },
];

export default function WithdrawPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const requestWithdrawal = useRequestWithdrawal(sub?.id);

  const [bucket, setBucket] = useState('emergency');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('medical');
  const [method, setMethod] = useState('mtn');
  const [sheetView, setSheetView] = useState(null); // null | 'confirm' | 'success'
  const [submitting, setSubmitting] = useState(false);
  const [resultWd, setResultWd] = useState(null);

  const emergencyBalance = sub?.emergencyBalance || 0;
  const retirementBalance = sub?.retirementBalance || 0;

  const retirementEligible = useMemo(() => {
    if (typeof sub?.age === 'number') return sub.age >= RETIREMENT_AGE;
    return false;
  }, [sub]);

  const max = bucket === 'emergency' ? emergencyBalance : retirementBalance;
  const locked = bucket === 'retirement' && !retirementEligible;
  // The slider can only operate when the pot holds at least the minimum.
  const sliderDisabled = locked || max < MIN_WITHDRAW;

  // amountStr is the source of truth. Clamp the parsed amount to the slider
  // range so the hero/CTA always reflect a withdrawable figure.
  const rawAmount = parseAmount(amountStr);
  const amount = rawAmount == null ? 0 : Math.min(Math.max(rawAmount, MIN_WITHDRAW), Math.max(max, MIN_WITHDRAW));
  const hasAmount = !sliderDisabled && rawAmount != null && amount >= MIN_WITHDRAW && amount <= max;

  // Reset the amount when the pot changes or when the active pot can't be
  // withdrawn from (locked / below minimum) so a stale figure never lingers.
  useEffect(() => {
    setAmountStr('');
  }, [bucket]);

  const remainingAfter = Math.max(0, max - (hasAmount ? amount : 0));

  const retirementImpact = useMemo(() => {
    if (bucket !== 'retirement' || !hasAmount) return null;
    const age = sub?.age || 40;
    const yrs = Math.max(1, RETIREMENT_AGE - age);
    const perMonthIfInvested = amount / (yrs * 12);
    return calcFV(perMonthIfInvested, yrs);
  }, [bucket, hasAmount, amount, sub]);

  const reasonLabel = REASONS.find((r) => r.value === reason)?.label || reason;
  const methodLabel = METHODS.find((m) => m.id === method)?.label || method;

  function handleBack() {
    goBackOrFallback(navigate, '/dashboard/withdraw');
  }

  function handleSliderChange(e) {
    setAmountStr(String(Number.parseInt(e.target.value, 10)));
  }

  function handleReview() {
    if (!hasAmount) return;
    setSheetView('confirm');
  }

  function closeSheet() {
    if (submitting) return;
    setSheetView(null);
  }

  async function handleConfirm() {
    if (!hasAmount || !sub) return;
    setSubmitting(true);
    try {
      const wd = await requestWithdrawal.mutateAsync({
        amount,
        bucket,
        reason: reasonLabel,
        method: methodLabel,
      });
      setResultWd(wd);
      setSheetView('success');
      addToast('success', `Withdrawal of ${formatUGXExact(amount)} requested.`);
    } catch (err) {
      addToast('error', err?.message || 'Could not request withdrawal.');
    } finally {
      setSubmitting(false);
    }
  }

  const sliderValue = hasAmount ? amount : MIN_WITHDRAW;
  const sliderPct = max > MIN_WITHDRAW
    ? ((sliderValue - MIN_WITHDRAW) / (max - MIN_WITHDRAW)) * 100
    : 0;

  return (
    <div className={styles.page}>
      <PageHeaderHero
        amount={hasAmount ? amount : 0}
        bucket={bucket}
        remainingAfter={hasAmount ? remainingAfter : max}
        onBack={handleBack}
      />

      <div className={styles.body}>
        {/* Amount slider */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionLabel}>Amount</h2>
          </div>
          <input
            type="range"
            min={MIN_WITHDRAW}
            max={Math.max(max, MIN_WITHDRAW)}
            step={1000}
            value={sliderValue}
            onChange={handleSliderChange}
            disabled={sliderDisabled}
            className={styles.slider}
            style={{ '--pct': `${sliderPct}%` }}
            aria-label={`Withdrawal amount from your ${bucket === 'emergency' ? 'Savings' : 'Retirement'} pot in UGX`}
            aria-valuetext={`${formatUGXExact(sliderValue)} of ${formatUGXExact(Math.max(max, MIN_WITHDRAW))}`}
          />
          <div className={styles.sliderEnds}>
            <span>{formatUGXExact(MIN_WITHDRAW)}</span>
            <span className={styles.sliderMax}>{formatUGXExact(Math.max(max, MIN_WITHDRAW))}</span>
          </div>
          {sliderDisabled && !locked && (
            <p className={styles.helperLine}>
              This pot is below the {formatUGXExact(MIN_WITHDRAW)} minimum.
            </p>
          )}
        </section>

        {/* Pot picker */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionLabel}>Withdraw from</h2>
          </div>
          <div className={styles.bucketGrid}>
            <button
              type="button"
              className={styles.bucket}
              data-active={bucket === 'emergency'}
              data-tone="emergency"
              onClick={() => setBucket('emergency')}
            >
              <span className={styles.bucketName}>
                <span className={styles.bucketDot} data-tone="emergency" />
                Savings
              </span>
              <span className={styles.bucketBal}>{formatUGXExact(emergencyBalance)}</span>
            </button>
            <button
              type="button"
              className={styles.bucket}
              data-active={bucket === 'retirement'}
              data-tone="retirement"
              data-locked={!retirementEligible || undefined}
              onClick={() => setBucket('retirement')}
            >
              <span className={styles.bucketName}>
                <span className={styles.bucketDot} data-tone="retirement" />
                Retirement
              </span>
              <span className={styles.bucketBal}>{formatUGXExact(retirementBalance)}</span>
              {!retirementEligible && (
                <span className={styles.lockPill}>
                  <svg aria-hidden="true" viewBox="0 0 12 12" width="9" height="9">
                    <rect x="3" y="5.5" width="6" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.2" fill="none" />
                    <path d="M4 5.5V4a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  </svg>
                  Locked until {RETIREMENT_AGE}
                </span>
              )}
            </button>
          </div>
          {locked && (
            <p className={styles.helperLine}>
              Retirement funds unlock at age {RETIREMENT_AGE}. Use your Savings pot any time.
            </p>
          )}
        </section>

        {/* Reason */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionLabel}>Reason</h2>
          </div>
          <PillChipGroup label="Withdrawal reason" layout="row">
            {REASONS.map((r) => (
              <PillChip
                key={r.id}
                selected={reason === r.value}
                onClick={() => setReason(r.value)}
              >
                {r.label}
              </PillChip>
            ))}
          </PillChipGroup>
        </section>

        {/* Payout method */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionLabel}>Payout to</h2>
          </div>
          <PillChipGroup label="Payout method" layout="row">
            {METHODS.map((m) => (
              <PillChip
                key={m.id}
                selected={method === m.id}
                onClick={() => setMethod(m.id)}
              >
                {m.label}
              </PillChip>
            ))}
          </PillChipGroup>
          <p className={styles.helperLine}>
            Funds reach your registered account ({sub?.phone || 'your number'}) within 2 business days.
          </p>
        </section>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!hasAmount}
          onClick={handleReview}
        >
          {hasAmount ? `Withdraw ${formatUGXExact(amount)}` : 'Withdraw'}
        </button>
      </footer>

      {/* Confirm → success sheet — portaled to <body> so it escapes the page's
          animated (transformed) ancestor and layers ABOVE the fixed BottomTabBar
          instead of being trapped beneath it (z-index then works against root). */}
      {createPortal(
        <AnimatePresence>
        {sheetView && (
          <motion.div
            className={styles.sheetScrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT_EXPO }}
            onClick={closeSheet}
          >
            <motion.div
              className={styles.sheet}
              role="dialog"
              aria-modal="true"
              aria-label={sheetView === 'confirm' ? 'Confirm withdrawal' : 'Withdrawal requested'}
              initial={reduceMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
              transition={{ duration: reduceMotion ? 0 : 0.34, ease: EASE_OUT_EXPO }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className={styles.sheetGrip} aria-hidden="true" />

              <AnimatePresence mode="wait" initial={false}>
                {sheetView === 'confirm' && (
                  <motion.div
                    key="confirm"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT_EXPO }}
                    className={styles.sheetInner}
                  >
                    <span className={styles.confirmEyebrow}>You&apos;re taking out</span>
                    <div className={styles.confirmBig}>{formatUGXExact(amount)}</div>

                    <ul className={styles.summaryList}>
                      <li className={styles.summaryRow}>
                        <span>From</span>
                        <strong>{bucket === 'emergency' ? 'Savings' : 'Retirement'}</strong>
                      </li>
                      <li className={styles.summaryRow}>
                        <span>Reason</span>
                        <strong>{reasonLabel}</strong>
                      </li>
                      <li className={styles.summaryRow}>
                        <span>Payout method</span>
                        <strong>{methodLabel}</strong>
                      </li>
                      <li className={styles.summaryRow}>
                        <span>Remaining in pot</span>
                        <strong>{formatUGXExact(remainingAfter)}</strong>
                      </li>
                    </ul>

                    {bucket === 'retirement' && retirementImpact != null && (
                      <div className={styles.warnBox}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <path d="M12 3l10 18H2L12 3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                          <path d="M12 10v5M12 18v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                        </svg>
                        <span>
                          May reduce your projected retirement by approx <strong>{formatUGX(retirementImpact)}</strong>.
                        </span>
                      </div>
                    )}

                    <div className={styles.sheetActions}>
                      <button type="button" className={styles.secondaryBtn} onClick={closeSheet} disabled={submitting}>
                        Back
                      </button>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        disabled={submitting}
                        onClick={handleConfirm}
                      >
                        {submitting ? 'Submitting…' : 'Confirm withdrawal'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {sheetView === 'success' && (
                  <motion.div
                    key="success"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE_OUT_EXPO }}
                    className={styles.successInner}
                  >
                    <div className={styles.successCheck} aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="38" height="38" fill="none">
                        <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                        <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className={styles.successTitle}>Withdrawal requested</h2>
                    <p className={styles.successSubtitle}>
                      {formatUGXExact(amount)} will arrive via {methodLabel} within 2 business days.
                    </p>
                    {resultWd?.reference && (
                      <div className={styles.successRef}>Reference <strong>{resultWd.reference}</strong></div>
                    )}
                    <button
                      type="button"
                      className={styles.trackLink}
                      onClick={() => navigate('/dashboard/reports')}
                    >
                      Track in Reports
                      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                        <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </button>
                    <button type="button" className={styles.primaryBtn} onClick={() => navigate('/dashboard')}>
                      Back to home
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/**
 * Hero dome for the withdraw form. Title "Withdraw", eyebrow "YOU'RE TAKING
 * OUT", the live amount, and a subtitle that names the source pot plus the
 * balance remaining after this withdrawal. The pot label mirrors the pot-card
 * wording ("Savings" / "Retirement") so the two never disagree.
 */
function PageHeaderHero({ amount, bucket, remainingAfter, onBack }) {
  const potLabel = bucket === 'emergency' ? 'Savings' : 'Retirement';
  return (
    <HeroCapsule
      title="Withdraw"
      eyebrow="YOU'RE TAKING OUT"
      prefix="UGX"
      amount={amount > 0 ? formatNumber(amount) : '0'}
      subtitle={`From your ${potLabel} pot · ${formatUGXExact(remainingAfter)} remaining`}
      onBack={onBack}
    />
  );
}
