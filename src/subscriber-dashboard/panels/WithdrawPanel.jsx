import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX, calcFV } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber, useRequestWithdrawal } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import styles from './WithdrawPanel.module.css';

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

const MIN_WITHDRAW = 5000;

function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return Number.parseInt(cleaned, 10);
}

export default function WithdrawPanel({ splitMode = false }) {
  const { withdrawOpen, setWithdrawOpen, setSubscriberReportsOpen, setReportContext, closeAllPanels } = useDashboard();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const requestWithdrawal = useRequestWithdrawal(sub?.id);

  const [view, setView] = useState('form'); // form → confirm → success
  const [bucket, setBucket] = useState('emergency');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('medical');
  const [method, setMethod] = useState('mtn');
  const [submitting, setSubmitting] = useState(false);
  const [resultWd, setResultWd] = useState(null);

  const emergencyBalance = sub?.emergencyBalance || 0;
  const retirementBalance = sub?.retirementBalance || 0;

  // Retirement lock gate — if we know age, lock until 60; otherwise default locked.
  const retirementEligible = useMemo(() => {
    if (typeof sub?.age === 'number') return sub.age >= 60;
    return false;
  }, [sub]);

  const max = bucket === 'emergency' ? emergencyBalance : retirementBalance;
  const amount = parseAmount(amountStr);
  const hasAmount = amount !== null && amount >= MIN_WITHDRAW && amount <= max;
  const belowMin = amount !== null && amount < MIN_WITHDRAW;
  const exceedsMax = amount !== null && amount > max;

  // Projected retirement-income impact (simple FV of UGX amount compounded over years-to-60)
  const retirementImpact = useMemo(() => {
    if (bucket !== 'retirement' || !hasAmount) return null;
    const age = sub?.age || 40;
    const yrs = Math.max(1, 60 - age);
    // Reduction in future value if this money wasn't withdrawn
    const perMonthIfInvested = amount / (yrs * 12);
    const foregone = calcFV(perMonthIfInvested, yrs);
    return foregone;
  }, [bucket, hasAmount, amount, sub]);

  useEffect(() => {
    if (withdrawOpen) return;
    const t = setTimeout(() => {
      setView('form');
      setBucket('emergency');
      setAmountStr('');
      setReason('medical');
      setMethod('mtn');
      setSubmitting(false);
      setResultWd(null);
    }, 400);
    return () => clearTimeout(t);
  }, [withdrawOpen]);

  useEffect(() => {
    if (!withdrawOpen) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (view === 'confirm') setView('form');
      else setWithdrawOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [withdrawOpen, setWithdrawOpen, view]);

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

  function openReports() {
    setWithdrawOpen(false);
    closeAllPanels();
    setReportContext('withdrawals-history');
    setSubscriberReportsOpen(true);
  }

  return (
    <>
      <AnimatePresence>
        {withdrawOpen && !splitMode && (
          <motion.div
            key="withdraw-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setWithdrawOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {withdrawOpen && (
          <motion.div
            key="withdraw-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="withdraw-title"
            aria-modal="true"
          >
            <header className={styles.header}>
              {view === 'confirm' ? (
                <button className={styles.backBtn} onClick={() => setView('form')} aria-label="Back">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <button className={styles.closeBtn} onClick={() => setWithdrawOpen(false)} aria-label="Close">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Withdraw</span>
                <h2 id="withdraw-title" className={styles.title}>
                  {view === 'form' && 'Access your savings'}
                  {view === 'confirm' && 'Confirm withdrawal'}
                  {view === 'success' && 'Request submitted'}
                </h2>
                <p className={styles.subtitle}>
                  {view === 'form' && 'Emergency withdrawals arrive within 2 business days'}
                  {view === 'confirm' && 'Review the details before submitting'}
                  {view === 'success' && 'We\u2019ll notify you when funds are released'}
                </p>
              </div>
            </header>

            <div className={styles.body}>
              <AnimatePresence mode="wait" initial={false}>
                {view === 'form' && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.step}
                  >
                    {/* Bucket picker */}
                    <section className={styles.section} aria-labelledby="bucket-heading">
                      <h3 id="bucket-heading" className={styles.sectionTitle}>From which bucket?</h3>
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
                            {retirementEligible ? 'Eligible' : 'Locked until age 60'}
                          </span>
                        </button>
                      </div>
                    </section>

                    {/* Amount */}
                    <section className={styles.section} aria-labelledby="wd-amt-heading">
                      <div className={styles.sectionHead}>
                        <h3 id="wd-amt-heading" className={styles.sectionTitle}>How much?</h3>
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
                          Retirement funds unlock at age 60. Use your Emergency bucket any time.
                        </p>
                      )}
                    </section>

                    {/* Reason */}
                    <section className={styles.section} aria-labelledby="wd-reason-heading">
                      <h3 id="wd-reason-heading" className={styles.sectionTitle}>Reason</h3>
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
                    <section className={styles.section} aria-labelledby="wd-method-heading">
                      <h3 id="wd-method-heading" className={styles.sectionTitle}>Payout to</h3>
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.step}
                  >
                    <section className={styles.confirmCard}>
                      <span className={styles.confirmEyebrow}>Withdrawing</span>
                      <div className={styles.confirmBig}>{formatUGXExact(amount)}</div>

                      <ul className={styles.summaryList}>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>From</span>
                          <span className={styles.summaryValue}>{bucket === 'emergency' ? 'Emergency savings' : 'Retirement savings'}</span>
                        </li>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>Reason</span>
                          <span className={styles.summaryValue}>{REASONS.find((r) => r.id === reason)?.label}</span>
                        </li>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>Payout method</span>
                          <span className={styles.summaryValue}>{METHODS.find((m) => m.id === method)?.label}</span>
                        </li>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>Expected settlement</span>
                          <span className={styles.summaryValue}>Within 2 business days</span>
                        </li>
                      </ul>

                      {bucket === 'retirement' && retirementImpact != null && (
                        <div className={styles.warnBox}>
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                            <path d="M12 3l10 18H2L12 3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                            <path d="M12 10v5M12 18v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          </svg>
                          <span>
                            This may reduce your projected retirement by approx <strong>{formatUGX(retirementImpact)}</strong>.
                          </span>
                        </div>
                      )}
                    </section>
                  </motion.div>
                )}

                {view === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                    className={styles.successStep}
                  >
                    <div className={styles.successCheck} aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
                        <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                        <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className={styles.successTitle}>Withdrawal requested</h3>
                    <p className={styles.successSubtitle}>
                      {formatUGXExact(amount)} will arrive via {METHODS.find((m) => m.id === method)?.label} within 2 business days.
                    </p>
                    {resultWd?.reference && (
                      <div className={styles.successRef}>Reference: <strong>{resultWd.reference}</strong></div>
                    )}
                    <button type="button" className={styles.trackLink} onClick={openReports}>
                      Track in Reports
                      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                        <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
                  Continue
                  {hasAmount && <span className={styles.primaryBtnAmt}>{formatUGXExact(amount)}</span>}
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
                <button type="button" className={styles.primaryBtn} onClick={() => setWithdrawOpen(false)}>Done</button>
              )}
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
