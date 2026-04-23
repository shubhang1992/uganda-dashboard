import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber, useMakeContribution } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import styles from './ContributePanel.module.css';

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 250000];
const METHODS = [
  { id: 'mtn',    label: 'MTN Mobile Money', helper: '+256 7X XXX XXXX' },
  { id: 'airtel', label: 'Airtel Money',     helper: '+256 7X XXX XXXX' },
  { id: 'bank',   label: 'Bank transfer',    helper: 'Stanbic • ABSA • Centenary' },
];
const MIN_CONTRIBUTION = 5000;

function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return Number.parseInt(cleaned, 10);
}

export default function ContributePanel({ splitMode = false }) {
  const { contributeOpen, setContributeOpen } = useDashboard();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const makeContribution = useMakeContribution(sub?.id);

  const defaultRetPct = sub?.contributionSchedule?.retirementPct ?? 80;

  const [view, setView] = useState('form'); // 'form' | 'confirm' | 'success'
  const [amountStr, setAmountStr] = useState('');
  const [customSplit, setCustomSplit] = useState(false);
  const [retirementPct, setRetirementPct] = useState(defaultRetPct);
  const [method, setMethod] = useState('mtn');
  const [submitting, setSubmitting] = useState(false);
  const [resultTx, setResultTx] = useState(null);

  const amount = parseAmount(amountStr);
  const emergencyPct = 100 - retirementPct;
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;

  const retAmt = hasAmount ? Math.round(amount * (retirementPct / 100)) : 0;
  const emgAmt = hasAmount ? amount - retAmt : 0;

  /* Reset on close after 400ms */
  useEffect(() => {
    if (contributeOpen) return;
    const t = setTimeout(() => {
      setView('form');
      setAmountStr('');
      setCustomSplit(false);
      setRetirementPct(defaultRetPct);
      setMethod('mtn');
      setSubmitting(false);
      setResultTx(null);
    }, 400);
    return () => clearTimeout(t);
  }, [contributeOpen, defaultRetPct]);

  /* Escape key */
  useEffect(() => {
    if (!contributeOpen) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (view === 'confirm') setView('form');
      else setContributeOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contributeOpen, setContributeOpen, view]);

  function handleContinue() {
    if (!hasAmount) return;
    setView('confirm');
  }

  async function handleConfirm() {
    if (!hasAmount || !sub) return;
    setSubmitting(true);
    try {
      const tx = await makeContribution.mutateAsync({
        amount,
        retirementPct,
        method: METHODS.find((m) => m.id === method)?.label || method,
      });
      setResultTx(tx);
      setView('success');
      addToast('success', `${formatUGXExact(amount)} added to your savings.`);
    } finally {
      setSubmitting(false);
    }
  }

  const newBalance = useMemo(() => {
    if (!sub) return 0;
    return (sub.netBalance || 0) + (hasAmount ? amount : 0);
  }, [sub, hasAmount, amount]);

  return (
    <>
      <AnimatePresence>
        {contributeOpen && !splitMode && (
          <motion.div
            key="contribute-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setContributeOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {contributeOpen && (
          <motion.div
            key="contribute-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="contribute-title"
            aria-modal="true"
          >
            {/* Header */}
            <header className={styles.header}>
              <button className={styles.closeBtn} onClick={() => setContributeOpen(false)} aria-label="Close">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Make a contribution</span>
                <h2 id="contribute-title" className={styles.title}>Top up your savings</h2>
                <p className={styles.subtitle}>Current balance {formatUGX(sub?.netBalance || 0)}</p>
              </div>
            </header>

            {/* Hero strip showing the running balance */}
            <div className={styles.heroStrip}>
              <span className={styles.heroStripLabel}>After this top-up</span>
              <span className={styles.heroStripValue}>{formatUGXExact(newBalance)}</span>
            </div>

            {/* Body */}
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
                    {/* Amount */}
                    <section className={styles.section} aria-labelledby="amt-heading">
                      <div className={styles.sectionHead}>
                        <span className={styles.sectionIdx}>01</span>
                        <h3 id="amt-heading" className={styles.sectionTitle}>How much?</h3>
                        <span className={styles.sectionAside}>Min {formatUGXExact(MIN_CONTRIBUTION)}</span>
                      </div>

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

                      <div className={styles.presetRow}>
                        {PRESET_AMOUNTS.map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={styles.presetChip}
                            data-active={amount === v}
                            onClick={() => setAmountStr(String(v))}
                          >
                            {formatUGXExact(v)}
                          </button>
                        ))}
                      </div>

                      {belowMin && (
                        <p className={styles.errorLine}>
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="14" height="14">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75"/>
                            <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          </svg>
                          Minimum {formatUGXExact(MIN_CONTRIBUTION)} required.
                        </p>
                      )}
                    </section>

                    {/* Allocation */}
                    <section className={styles.section} aria-labelledby="alloc-heading">
                      <div className={styles.sectionHead}>
                        <span className={styles.sectionIdx}>02</span>
                        <h3 id="alloc-heading" className={styles.sectionTitle}>Allocation</h3>
                      </div>

                      <div className={styles.allocToggle} role="radiogroup" aria-label="Allocation choice">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={!customSplit}
                          className={styles.allocOption}
                          data-active={!customSplit}
                          onClick={() => { setCustomSplit(false); setRetirementPct(defaultRetPct); }}
                        >
                          <span className={styles.allocOptionTitle}>Use my default split</span>
                          <span className={styles.allocOptionSub}>{defaultRetPct}% retirement · {100 - defaultRetPct}% emergency</span>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={customSplit}
                          className={styles.allocOption}
                          data-active={customSplit}
                          onClick={() => setCustomSplit(true)}
                        >
                          <span className={styles.allocOptionTitle}>Customise this top-up</span>
                          <span className={styles.allocOptionSub}>Just for this contribution</span>
                        </button>
                      </div>

                      {customSplit && (
                        <div className={styles.allocSlider}>
                          <div className={styles.splitHead}>
                            <div className={styles.splitSide}>
                              <span className={styles.splitLabel}>Retirement</span>
                              <span className={styles.splitPct}>{retirementPct}%</span>
                            </div>
                            <div className={styles.splitSide} data-align="right">
                              <span className={styles.splitLabel} data-tone="teal">Emergency</span>
                              <span className={styles.splitPct} data-tone="teal">{emergencyPct}%</span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={retirementPct}
                            onChange={(e) => setRetirementPct(Number.parseInt(e.target.value, 10))}
                            className={styles.slider}
                            style={{ '--pct': `${retirementPct}%` }}
                            aria-label="Retirement percentage for this contribution"
                          />
                          <div className={styles.splitBar}>
                            <span className={styles.splitFillR} style={{ flexBasis: `${retirementPct}%` }} />
                            <span className={styles.splitFillE} style={{ flexBasis: `${emergencyPct}%` }} />
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Payment method */}
                    <section className={styles.section} aria-labelledby="method-heading">
                      <div className={styles.sectionHead}>
                        <span className={styles.sectionIdx}>03</span>
                        <h3 id="method-heading" className={styles.sectionTitle}>Payment method</h3>
                      </div>
                      <div className={styles.methodList} role="radiogroup" aria-label="Payment method">
                        {METHODS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={method === m.id}
                            className={styles.methodItem}
                            data-active={method === m.id}
                            onClick={() => setMethod(m.id)}
                          >
                            <span className={styles.methodRadio} aria-hidden="true">
                              <span className={styles.methodRadioDot} />
                            </span>
                            <span className={styles.methodText}>
                              <span className={styles.methodName}>{m.label}</span>
                              <span className={styles.methodHelper}>{m.helper}</span>
                            </span>
                          </button>
                        ))}
                      </div>
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
                    <section className={styles.confirmCard} aria-labelledby="confirm-heading">
                      <h3 id="confirm-heading" className={styles.confirmTitle}>Confirm contribution</h3>
                      <div className={styles.confirmBig}>{formatUGXExact(amount)}</div>

                      <ul className={styles.summaryList}>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>
                            <span className={styles.summaryDot} data-tone="retirement" />
                            Retirement ({retirementPct}%)
                          </span>
                          <span className={styles.summaryValue}>{formatUGXExact(retAmt)}</span>
                        </li>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>
                            <span className={styles.summaryDot} data-tone="emergency" />
                            Emergency ({emergencyPct}%)
                          </span>
                          <span className={styles.summaryValue}>{formatUGXExact(emgAmt)}</span>
                        </li>
                        <li className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>Payment method</span>
                          <span className={styles.summaryValue}>{METHODS.find((m) => m.id === method)?.label}</span>
                        </li>
                        <li className={styles.summaryRow} data-highlight="true">
                          <span className={styles.summaryLabel}>New balance</span>
                          <span className={styles.summaryValue}>{formatUGXExact(newBalance)}</span>
                        </li>
                      </ul>
                      <p className={styles.confirmNote}>
                        You&apos;ll receive an SMS prompt to authorise the payment on your mobile money account.
                      </p>
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
                    <h3 className={styles.successTitle}>Contribution added</h3>
                    <p className={styles.successSubtitle}>
                      {formatUGXExact(amount)} is now working for you. Your new balance is {formatUGXExact(newBalance)}.
                    </p>
                    {resultTx?.reference && (
                      <div className={styles.successRef}>Reference: <strong>{resultTx.reference}</strong></div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <footer className={styles.footer}>
              {view === 'form' && (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={!hasAmount}
                  onClick={handleContinue}
                >
                  Continue to pay
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
                    {submitting ? 'Processing…' : 'Confirm & pay'}
                  </button>
                </div>
              )}
              {view === 'success' && (
                <button type="button" className={styles.primaryBtn} onClick={() => setContributeOpen(false)}>Done</button>
              )}
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
