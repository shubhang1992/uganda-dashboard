import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX, calcFV, parseAmount } from '../../utils/finance';
import { useCurrentSubscriber, useRequestWithdrawal } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import { MIN_WITHDRAW, RETIREMENT_AGE } from '../../constants/savings';
import PageHeader from '../shell/PageHeader';
import { goBackOrFallback } from '../shell/navigation';
import styles from './WithdrawPage.module.css';

const REASONS = [
  { id: 'medical',   label: 'Medical',   helper: 'Hospital bills, treatment, emergencies' },
  { id: 'education', label: 'Education', helper: 'School fees, tuition, learning' },
  { id: 'housing',   label: 'Housing',   helper: 'Rent deposit, repairs, land' },
  { id: 'business',  label: 'Business',  helper: 'Stock, tools, operating costs' },
  { id: 'other',     label: 'Other',     helper: 'Something else' },
];

const METHODS = [
  { id: 'mtn',    label: 'MTN Mobile Money' },
  { id: 'airtel', label: 'Airtel Money' },
  { id: 'bank',   label: 'Bank transfer' },
];

export default function WithdrawPage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const requestWithdrawal = useRequestWithdrawal(sub?.id);

  const [view, setView] = useState('form');
  const [bucket, setBucket] = useState('emergency');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('medical');
  const [method, setMethod] = useState('mtn');
  const [submitting, setSubmitting] = useState(false);
  const [resultWd, setResultWd] = useState(null);

  const emergencyBalance = sub?.emergencyBalance || 0;
  const retirementBalance = sub?.retirementBalance || 0;

  const retirementEligible = useMemo(() => {
    if (typeof sub?.age === 'number') return sub.age >= RETIREMENT_AGE;
    return false;
  }, [sub]);

  const max = bucket === 'emergency' ? emergencyBalance : retirementBalance;
  const amount = parseAmount(amountStr);
  const hasAmount = amount !== null && amount >= MIN_WITHDRAW && amount <= max;
  const belowMin = amount !== null && amount < MIN_WITHDRAW;
  const exceedsMax = amount !== null && amount > max;

  const retirementImpact = useMemo(() => {
    if (bucket !== 'retirement' || !hasAmount) return null;
    const age = sub?.age || 40;
    const yrs = Math.max(1, RETIREMENT_AGE - age);
    const perMonthIfInvested = amount / (yrs * 12);
    return calcFV(perMonthIfInvested, yrs);
  }, [bucket, hasAmount, amount, sub]);

  function handleBack() {
    if (view === 'confirm') return setView('form');
    goBackOrFallback(navigate, '/dashboard/withdraw');
  }

  function handleContinue() {
    if (!hasAmount) return;
    setView('confirm');
  }

  async function handleConfirm() {
    if (!hasAmount || !sub) return;
    setSubmitting(true);
    try {
      const wd = await requestWithdrawal.mutateAsync({
        amount,
        bucket,
        reason: REASONS.find((r) => r.id === reason)?.label || reason,
        method: METHODS.find((m) => m.id === method)?.label || method,
      });
      setResultWd(wd);
      setView('success');
      addToast('success', `Withdrawal of ${formatUGXExact(amount)} requested.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={
          view === 'form' ? 'Withdraw'
          : view === 'confirm' ? 'Confirm'
          : 'Submitted'
        }
        subtitle={
          view === 'form' ? 'Funds arrive within 2 business days'
          : view === 'confirm' ? 'Review before submitting'
          : null
        }
        onBack={handleBack}
      />

      <div className={styles.body}>
        <AnimatePresence mode="wait" initial={false}>
          {view === 'form' && (
            <motion.div
              key="form"
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              {/* Bucket picker */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>01</span>
                  <h2 className={styles.sectionTitle}>From which bucket?</h2>
                </div>
                <div className={styles.bucketGrid}>
                  <button
                    type="button"
                    className={styles.bucket}
                    data-active={bucket === 'emergency'}
                    data-tone="emergency"
                    onClick={() => { setBucket('emergency'); setAmountStr(''); }}
                  >
                    <div className={styles.bucketHead}>
                      <span className={styles.bucketDot} data-tone="emergency" />
                      <span className={styles.bucketName}>Emergency</span>
                    </div>
                    <div className={styles.bucketBal}>{formatUGXExact(emergencyBalance)}</div>
                    <span className={styles.bucketPill}>
                      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                        <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      Available any time
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.bucket}
                    data-active={bucket === 'retirement'}
                    data-tone="retirement"
                    data-locked={!retirementEligible || undefined}
                    onClick={() => { setBucket('retirement'); setAmountStr(''); }}
                  >
                    <div className={styles.bucketHead}>
                      <span className={styles.bucketDot} data-tone="retirement" />
                      <span className={styles.bucketName}>Retirement</span>
                    </div>
                    <div className={styles.bucketBal}>{formatUGXExact(retirementBalance)}</div>
                    <span className={styles.bucketPill} data-tone={retirementEligible ? 'ok' : 'locked'}>
                      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                        {retirementEligible ? (
                          <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                        ) : (
                          <>
                            <rect x="3" y="5.5" width="6" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                            <path d="M4 5.5V4a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                          </>
                        )}
                      </svg>
                      {retirementEligible ? 'Eligible' : `Locked until ${RETIREMENT_AGE}`}
                    </span>
                  </button>
                </div>
              </section>

              {/* Amount */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>02</span>
                  <h2 className={styles.sectionTitle}>How much?</h2>
                  <span className={styles.sectionAside}>Max {formatUGXExact(max)}</span>
                </div>
                <label className={styles.amountField} data-error={(belowMin || exceedsMax) || undefined}>
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
                    aria-label="Withdrawal amount in UGX"
                    aria-invalid={belowMin || exceedsMax}
                    disabled={bucket === 'retirement' && !retirementEligible}
                  />
                  {max > 0 && (
                    <button
                      type="button"
                      className={styles.maxBtn}
                      onClick={() => setAmountStr(String(max))}
                      disabled={bucket === 'retirement' && !retirementEligible}
                    >
                      Max
                    </button>
                  )}
                </label>
                {belowMin && (
                  <p className={styles.errorLine}>Minimum {formatUGXExact(MIN_WITHDRAW)}.</p>
                )}
                {exceedsMax && (
                  <p className={styles.errorLine}>Amount exceeds {bucket} balance.</p>
                )}
                {bucket === 'retirement' && !retirementEligible && (
                  <p className={styles.helperLine}>
                    Retirement funds unlock at age {RETIREMENT_AGE}. Use your Emergency bucket any time.
                  </p>
                )}
              </section>

              {/* Reason */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>03</span>
                  <h2 className={styles.sectionTitle}>Reason</h2>
                </div>
                <div className={styles.reasonList} role="radiogroup" aria-label="Withdrawal reason">
                  {REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={reason === r.id}
                      className={styles.reasonItem}
                      data-active={reason === r.id}
                      onClick={() => setReason(r.id)}
                    >
                      <span className={styles.reasonRadio} aria-hidden="true">
                        <span className={styles.reasonRadioDot} />
                      </span>
                      <span className={styles.reasonText}>
                        <span className={styles.reasonName}>{r.label}</span>
                        <span className={styles.reasonHelper}>{r.helper}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Method */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>04</span>
                  <h2 className={styles.sectionTitle}>Payout to</h2>
                </div>
                <div className={styles.methodRow} role="radiogroup" aria-label="Payout method">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={method === m.id}
                      className={styles.methodChip}
                      data-active={method === m.id}
                      onClick={() => setMethod(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className={styles.helperLine}>
                  Funds will be sent to your registered account ({sub?.phone || 'your number'}).
                </p>
              </section>
            </motion.div>
          )}

          {view === 'confirm' && (
            <motion.div
              key="confirm"
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <section className={styles.confirmCard}>
                <span className={styles.confirmEyebrow}>Withdrawing</span>
                <div className={styles.confirmBig}>{formatUGXExact(amount)}</div>

                <ul className={styles.summaryList}>
                  <li className={styles.summaryRow}>
                    <span>From</span>
                    <strong>{bucket === 'emergency' ? 'Emergency savings' : 'Retirement savings'}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>Reason</span>
                    <strong>{REASONS.find((r) => r.id === reason)?.label}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>Payout method</span>
                    <strong>{METHODS.find((m) => m.id === method)?.label}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>Expected settlement</span>
                    <strong>Within 2 business days</strong>
                  </li>
                </ul>

                {bucket === 'retirement' && retirementImpact != null && (
                  <div className={styles.warnBox}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                      <path d="M12 3l10 18H2L12 3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                      <path d="M12 10v5M12 18v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                    </svg>
                    <span>
                      May reduce your projected retirement by approx <strong>{formatUGX(retirementImpact)}</strong>.
                    </span>
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div
              key="success"
              className={styles.successStep}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.successCheck} aria-hidden="true">
                <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                  <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                  <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className={styles.successTitle}>Withdrawal requested</h2>
              <p className={styles.successSubtitle}>
                {formatUGXExact(amount)} will arrive via {METHODS.find((m) => m.id === method)?.label} within 2 business days.
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
                  <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className={styles.footer}>
        {view === 'form' && (
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!hasAmount}
            onClick={handleContinue}
          >
            <span>Continue</span>
            {hasAmount && <span className={styles.primaryAmt}>{formatUGXExact(amount)}</span>}
          </button>
        )}
        {view === 'confirm' && (
          <div className={styles.footerRow}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setView('form')}>Back</button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={submitting}
              onClick={handleConfirm}
            >
              {submitting ? 'Submitting…' : 'Submit withdrawal'}
            </button>
          </div>
        )}
        {view === 'success' && (
          <button type="button" className={styles.primaryBtn} onClick={() => navigate('/dashboard')}>
            Back to home
          </button>
        )}
      </footer>
    </div>
  );
}
