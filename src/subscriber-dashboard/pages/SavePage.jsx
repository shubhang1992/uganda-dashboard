import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useCurrentSubscriber, useMakeContribution } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import PageHeader from '../shell/PageHeader';
import styles from './SavePage.module.css';

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 250000];
const METHODS = [
  { id: 'mtn',    label: 'MTN Mobile Money', helper: '+256 7X XXX XXXX' },
  { id: 'airtel', label: 'Airtel Money',     helper: '+256 7X XXX XXXX' },
  { id: 'bank',   label: 'Bank transfer',    helper: 'Stanbic · ABSA · Centenary' },
];
const MIN_CONTRIBUTION = 5000;

function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return Number.parseInt(cleaned, 10);
}

export default function SavePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const makeContribution = useMakeContribution(sub?.id);

  const defaultRetPct = sub?.contributionSchedule?.retirementPct ?? 80;
  const prefillAmount = location.state?.prefillAmount;

  const [view, setView] = useState('form'); // form | confirm | success
  const [amountStr, setAmountStr] = useState(prefillAmount ? String(prefillAmount) : '');
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

  const newBalance = useMemo(() => {
    if (!sub) return 0;
    return (sub.netBalance || 0) + (hasAmount ? amount : 0);
  }, [sub, hasAmount, amount]);

  function handleBack() {
    if (view === 'confirm') return setView('form');
    navigate('/dashboard');
  }

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

  return (
    <div className={styles.page}>
      <PageHeader
        title={
          view === 'form' ? 'Top up'
          : view === 'confirm' ? 'Confirm'
          : 'All done'
        }
        subtitle={
          view === 'form' && sub ? `Current balance ${formatUGX(sub.netBalance || 0)}`
          : view === 'confirm' ? 'Review the details before paying'
          : null
        }
        onBack={handleBack}
      />

      <div className={styles.runningBalance}>
        <span className={styles.runningLabel}>After this top-up</span>
        <span className={styles.runningValue}>{formatUGXExact(newBalance)}</span>
      </div>

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
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>01</span>
                  <h2 className={styles.sectionTitle}>How much?</h2>
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
                  <p className={styles.errorLine}>Minimum {formatUGXExact(MIN_CONTRIBUTION)} required.</p>
                )}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>02</span>
                  <h2 className={styles.sectionTitle}>Allocation</h2>
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
                    <span className={styles.allocTitle}>Default split</span>
                    <span className={styles.allocSub}>{defaultRetPct}% retirement · {100 - defaultRetPct}% emergency</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={customSplit}
                    className={styles.allocOption}
                    data-active={customSplit}
                    onClick={() => setCustomSplit(true)}
                  >
                    <span className={styles.allocTitle}>Customise</span>
                    <span className={styles.allocSub}>Just for this top-up</span>
                  </button>
                </div>

                {customSplit && (
                  <div className={styles.allocSlider}>
                    <div className={styles.splitHead}>
                      <span><strong>Retirement</strong> {retirementPct}%</span>
                      <span data-tone="teal"><strong>Emergency</strong> {emergencyPct}%</span>
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
                      aria-label="Retirement percentage"
                    />
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>03</span>
                  <h2 className={styles.sectionTitle}>Pay with</h2>
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
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <section className={styles.confirmCard}>
                <span className={styles.confirmEyebrow}>You&apos;re paying</span>
                <div className={styles.confirmBig}>{formatUGXExact(amount)}</div>

                <ul className={styles.summaryList}>
                  <li className={styles.summaryRow}>
                    <span>
                      <span className={styles.summaryDot} data-tone="retirement" />
                      Retirement ({retirementPct}%)
                    </span>
                    <strong>{formatUGXExact(retAmt)}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>
                      <span className={styles.summaryDot} data-tone="emergency" />
                      Emergency ({emergencyPct}%)
                    </span>
                    <strong>{formatUGXExact(emgAmt)}</strong>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>Payment method</span>
                    <strong>{METHODS.find((m) => m.id === method)?.label}</strong>
                  </li>
                  <li className={styles.summaryRow} data-highlight="true">
                    <span>New balance</span>
                    <strong>{formatUGXExact(newBalance)}</strong>
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
              <h2 className={styles.successTitle}>Contribution added</h2>
              <p className={styles.successSubtitle}>
                {formatUGXExact(amount)} is now working for you. Your new balance is {formatUGXExact(newBalance)}.
              </p>
              {resultTx?.reference && (
                <div className={styles.successRef}>
                  Reference <strong>{resultTx.reference}</strong>
                </div>
              )}
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
              {submitting ? 'Processing…' : 'Confirm & pay'}
            </button>
          </div>
        )}
        {view === 'success' && (
          <button type="button" className={styles.primaryBtn} onClick={() => navigate('/dashboard')}>Back to home</button>
        )}
      </footer>
    </div>
  );
}
