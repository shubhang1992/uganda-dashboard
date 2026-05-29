import { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  EASE_OUT_EXPO,
  formatUGXExact,
  parseAmount,
  calcFV,
  FREQUENCY,
  normalizeFrequency,
  periodsPerYear,
} from '../../utils/finance';
import { formatNumber, formatUGXShort } from '../../utils/currency';
import { useCurrentSubscriber, useMakeContribution, useUpdateSchedule } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import {
  MIN_CONTRIBUTION,
  MOBILE_QUICK_CONTRIBUTION_AMOUNTS,
  RETIREMENT_AGE,
  INSURANCE_PREMIUM_MONTHLY,
  INSURANCE_COVER,
} from '../../constants/savings';
import PageHeader from '../../components/PageHeader';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import { goBackOrFallback } from '../shell/navigation';
import styles from './SavePage.module.css';

const PRESET_AMOUNTS = MOBILE_QUICK_CONTRIBUTION_AMOUNTS;

// Mode 'oneoff' routes through useMakeContribution; the recurring modes write a
// contribution schedule via useUpdateSchedule, mapped to canonical FREQUENCY ids.
const MODES = [
  { id: 'oneoff',             label: 'One-off',   recurring: false, cadence: 'One-off' },
  { id: FREQUENCY.WEEKLY,     label: 'Weekly',    recurring: true,  cadence: 'Weekly'    },
  { id: FREQUENCY.MONTHLY,    label: 'Monthly',   recurring: true,  cadence: 'Monthly'   },
  { id: FREQUENCY.QUARTERLY,  label: 'Quarterly', recurring: true,  cadence: 'Quarterly' },
];

// Mobile-money only per the redesign mockup. Bank transfer was dropped from the
// Save flow for product — flag left here so it can be reinstated if needed.
const METHODS = [
  { id: 'mtn',    label: 'MTN MoMo',     full: 'MTN Mobile Money', helper: '+256 71 100 0001' },
  { id: 'airtel', label: 'Airtel Money', full: 'Airtel Money',     helper: '+256 70 100 0001' },
];

const DEFAULT_RETIREMENT_PCT = 70;

// Hero opens on a valid preset (UGX 25K) so the amount reads as a real figure
// rather than "—" before any interaction — matches mockup 02.
const DEFAULT_AMOUNT = 25_000;

function modeById(id) {
  return MODES.find((m) => m.id === id) ?? MODES[2];
}

function methodById(id) {
  return METHODS.find((m) => m.id === id) ?? METHODS[0];
}

export default function SavePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const makeContribution = useMakeContribution(sub?.id);
  const updateSchedule = useUpdateSchedule(sub?.id);

  const existing = sub?.contributionSchedule;
  const defaultRetPct = existing?.retirementPct ?? DEFAULT_RETIREMENT_PCT;
  const prefillAmount = location.state?.prefillAmount;

  const [view, setView] = useState('form'); // form | confirm | success
  const [amountStr, setAmountStr] = useState(String(prefillAmount ?? DEFAULT_AMOUNT));
  const [modeId, setModeId] = useState('oneoff');
  const [retirementPct, setRetirementPct] = useState(defaultRetPct);
  const [includeInsurance, setIncludeInsurance] = useState(Boolean(existing?.includeInsurance));
  const [method, setMethod] = useState('mtn');
  const [submitting, setSubmitting] = useState(false);
  const [resultTx, setResultTx] = useState(null);

  const amount = parseAmount(amountStr);
  const emergencyPct = 100 - retirementPct;
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;

  const mode = modeById(modeId);
  const isRecurring = mode.recurring;

  const retAmt = hasAmount ? Math.round(amount * (retirementPct / 100)) : 0;
  const emgAmt = hasAmount ? amount - retAmt : 0;

  const newBalance = useMemo(() => {
    if (!sub) return 0;
    return (sub.netBalance || 0) + (hasAmount ? amount : 0);
  }, [sub, hasAmount, amount]);

  // Recurring projection — what you'll pay per period + the retirement bucket's
  // future value at age 60. Only meaningful for the recurring modes.
  const projection = useMemo(() => {
    if (!isRecurring || !hasAmount) return null;
    const freqPerYear = periodsPerYear(mode.id);
    const premiumPerPeriod = includeInsurance
      ? Math.round((INSURANCE_PREMIUM_MONTHLY * 12) / freqPerYear)
      : 0;
    const totalPerPeriod = amount + premiumPerPeriod;
    const annualTotal = totalPerPeriod * freqPerYear;
    const age = typeof sub?.age === 'number' ? sub.age : 35;
    const years = Math.max(0, RETIREMENT_AGE - age);
    const contribMonthly = (amount * freqPerYear) / 12;
    const retMonthly = contribMonthly * (retirementPct / 100);
    const retirementFV = years > 0 && retMonthly > 0 ? calcFV(retMonthly, years) : 0;
    return { freqPerYear, premiumPerPeriod, totalPerPeriod, annualTotal, years, retirementFV };
  }, [isRecurring, hasAmount, mode.id, includeInsurance, amount, retirementPct, sub]);

  const heroSubtitle = `${mode.cadence} · ${retirementPct}% retirement · ${emergencyPct}% emergency`;

  function resetSplit() {
    setRetirementPct(defaultRetPct);
  }

  function handleBack() {
    if (view === 'confirm') return setView('form');
    // Outermost step — honour browser back, fall back to home for deep-links.
    goBackOrFallback(navigate, '/dashboard');
  }

  function handleContinue() {
    if (!hasAmount) return;
    setView('confirm');
  }

  async function handleConfirm() {
    if (!hasAmount || !sub) return;
    setSubmitting(true);
    try {
      if (isRecurring) {
        // Recurring: write a contribution schedule. Frequency normalised; the
        // existing nextDueDate is preserved if present (schema honours partial
        // patches), insurance opt-in flows through includeInsurance.
        const schedulePayload = {
          frequency: normalizeFrequency(mode.id),
          amount,
          retirementPct,
          emergencyPct,
          includeInsurance,
        };
        if (existing?.nextDueDate) schedulePayload.nextDueDate = existing.nextDueDate;
        await updateSchedule.mutateAsync(schedulePayload);
        setResultTx(null);
        setView('success');
        addToast('success', `${mode.cadence} top-up of ${formatUGXExact(amount)} scheduled.`);
      } else {
        // One-off: ad-hoc contribution. Payload shape unchanged.
        const tx = await makeContribution.mutateAsync({
          amount,
          retirementPct,
          method: methodById(method).full,
        });
        setResultTx(tx);
        setView('success');
        addToast('success', `${formatUGXExact(amount)} added to your savings.`);
      }
    } catch (err) {
      addToast('error', err?.message || 'Could not complete the top-up.');
    } finally {
      setSubmitting(false);
    }
  }

  const heroAmount = hasAmount ? formatUGXShort(amount) : '—';

  return (
    <div className={styles.page}>
      <PageHeader
        variant="hero"
        title="Save"
        eyebrow="TOP UP AMOUNT"
        prefix="UGX"
        amount={heroAmount}
        subtitle={heroSubtitle}
        onBack={handleBack}
        showBack
      />

      <div className={styles.body}>
        <section className={styles.section} aria-labelledby="save-amount-label">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="save-amount-label">How much?</h2>
            <span className={styles.sectionAside}>Min {formatUGXExact(MIN_CONTRIBUTION)}</span>
          </div>

          <PillChipGroup label="Quick top-up amount" layout="grid" columns={3}>
            {PRESET_AMOUNTS.map((v) => (
              <PillChip key={v} selected={amount === v} onClick={() => setAmountStr(String(v))}>
                {formatUGXShort(v)}
              </PillChip>
            ))}
          </PillChipGroup>

          <label className={styles.amountField} data-error={belowMin || undefined}>
            <span className={styles.amountPrefix} aria-hidden="true">UGX</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={amountStr ? formatNumber(Number.parseInt(amountStr, 10)) : ''}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Enter another amount"
              className={styles.amountInput}
              aria-label="Contribution amount in UGX"
              aria-invalid={belowMin || undefined}
              aria-describedby={belowMin ? 'save-amount-error' : undefined}
            />
          </label>

          {belowMin && (
            <p id="save-amount-error" className={styles.errorLine} role="alert">Minimum {formatUGXExact(MIN_CONTRIBUTION)} required.</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="save-mode-label">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="save-mode-label">How often?</h2>
          </div>
          <PillChipGroup label="Top-up frequency" layout="row">
            {MODES.map((m) => (
              <PillChip key={m.id} selected={modeId === m.id} onClick={() => setModeId(m.id)}>
                {m.label}
              </PillChip>
            ))}
          </PillChipGroup>
          <p className={styles.modeNote}>
            {isRecurring
              ? 'Recurring top-ups update your savings schedule.'
              : 'A single top-up, paid now.'}
          </p>
        </section>

        <section className={styles.section} aria-labelledby="save-split-label">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="save-split-label">Retirement vs Emergency</h2>
            {retirementPct !== defaultRetPct && (
              <button type="button" className={styles.resetBtn} onClick={resetSplit}>
                Reset to default
              </button>
            )}
          </div>

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
            aria-label="Retirement vs emergency allocation"
            aria-valuetext={`${retirementPct}% retirement, ${emergencyPct}% emergency`}
          />
          <p className={styles.bucketHelp}>
            <span className={styles.bucketDot} data-tone="retirement" aria-hidden="true" />
            <strong>Retirement</strong> locked until age {RETIREMENT_AGE}
            <span className={styles.bucketSep} aria-hidden="true">·</span>
            <span className={styles.bucketDot} data-tone="emergency" aria-hidden="true" />
            <strong>Emergency</strong> any time
          </p>
        </section>

        {/* Insurance opt-in — recurring only (writes includeInsurance on the schedule). */}
        <AnimatePresence initial={false}>
          {isRecurring && (
            <motion.section
              key="insurance"
              className={styles.section}
              data-compact="true"
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE_OUT_EXPO }}
            >
              <button
                type="button"
                role="switch"
                aria-checked={includeInsurance}
                className={styles.insuranceRow}
                data-active={includeInsurance}
                onClick={() => setIncludeInsurance((v) => !v)}
              >
                <span className={styles.insuranceIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className={styles.insuranceCopy}>
                  <span className={styles.insuranceTitle}>Add life insurance</span>
                  <span className={styles.insuranceDetail}>
                    {includeInsurance && projection
                      ? `+${formatUGXExact(projection.premiumPerPeriod)} · ${formatUGXExact(INSURANCE_COVER)} cover`
                      : 'UGX 2,000 / mo · UGX 1M cover'}
                  </span>
                </span>
                <span className={styles.insuranceToggle} aria-hidden="true">
                  <span className={styles.insuranceToggleKnob} />
                </span>
              </button>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Recurring summary — "what you'll pay" + projected balance at 60. */}
        <AnimatePresence initial={false}>
          {projection && (
            <motion.section
              key="summary"
              className={styles.summarySection}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.summaryHead}>
                <span className={styles.summaryEyebrow}>What you&apos;ll pay</span>
                <span className={styles.summaryCadence}>{mode.cadence}</span>
              </div>
              <div className={styles.summaryBig}>{formatUGXExact(projection.totalPerPeriod)}</div>
              <ul className={styles.summaryList}>
                <li className={styles.summaryRow}>
                  <span>Per year</span>
                  <span>{formatUGXExact(projection.annualTotal)}</span>
                </li>
                {includeInsurance && (
                  <li className={styles.summaryRow}>
                    <span>
                      <span className={styles.summaryDot} data-tone="insurance" /> Life insurance
                    </span>
                    <span>+{formatUGXExact(projection.premiumPerPeriod)}</span>
                  </li>
                )}
              </ul>
              {projection.retirementFV > 0 && (
                <div className={styles.projection}>
                  <span className={styles.projLabel}>Projected at age {RETIREMENT_AGE}</span>
                  <span className={styles.projValue}>{formatUGXExact(Math.round(projection.retirementFV))}</span>
                  <span className={styles.projNote}>
                    Retirement bucket, compounded over {Math.round(projection.years)} years.
                  </span>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Payout / pay-with method — mobile money only (Bank dropped per mockup). */}
        <section className={styles.section} aria-labelledby="save-method-label">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="save-method-label">Pay with</h2>
          </div>
          <PillChipGroup label="Payment method" layout="row">
            {METHODS.map((m) => (
              <PillChip key={m.id} selected={method === m.id} onClick={() => setMethod(m.id)}>
                {m.label}
              </PillChip>
            ))}
          </PillChipGroup>
          <p className={styles.methodHelper}>{methodById(method).helper}</p>
        </section>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!hasAmount}
          onClick={handleContinue}
        >
          <span>Top up</span>
          {hasAmount && <span className={styles.primaryAmt}>{formatUGXExact(amount)}</span>}
        </button>
      </footer>

      {/* Confirm → success sheet (state-based, not routed). */}
      <AnimatePresence>
        {(view === 'confirm' || view === 'success') && (
          <motion.div
            className={styles.sheetScrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={() => { if (view === 'confirm' && !submitting) setView('form'); }}
          >
            <motion.div
              className={styles.sheet}
              role="dialog"
              aria-modal="true"
              aria-label={view === 'confirm' ? 'Confirm top-up' : 'Top-up complete'}
              initial={reduceMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
              transition={{ duration: reduceMotion ? 0 : 0.34, ease: EASE_OUT_EXPO }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className={styles.sheetGrip} aria-hidden="true" />

              {view === 'confirm' && (
                <div className={styles.sheetBody}>
                  <span className={styles.confirmEyebrow}>
                    {isRecurring ? `You'll pay ${mode.cadence.toLowerCase()}` : 'You’re paying'}
                  </span>
                  <div className={styles.confirmBig}>{formatUGXExact(amount)}</div>

                  <ul className={styles.confirmList}>
                    <li className={styles.confirmRow}>
                      <span>
                        <span className={styles.summaryDot} data-tone="retirement" />
                        Retirement ({retirementPct}%)
                      </span>
                      <strong>{formatUGXExact(retAmt)}</strong>
                    </li>
                    <li className={styles.confirmRow}>
                      <span>
                        <span className={styles.summaryDot} data-tone="emergency" />
                        Emergency ({emergencyPct}%)
                      </span>
                      <strong>{formatUGXExact(emgAmt)}</strong>
                    </li>
                    {isRecurring && includeInsurance && projection && (
                      <li className={styles.confirmRow}>
                        <span>
                          <span className={styles.summaryDot} data-tone="insurance" />
                          Life insurance
                        </span>
                        <strong>+{formatUGXExact(projection.premiumPerPeriod)}</strong>
                      </li>
                    )}
                    <li className={styles.confirmRow}>
                      <span>Payment method</span>
                      <strong>{methodById(method).full}</strong>
                    </li>
                    {!isRecurring && (
                      <li className={styles.confirmRow} data-highlight="true">
                        <span>New balance</span>
                        <strong>{formatUGXExact(newBalance)}</strong>
                      </li>
                    )}
                    {isRecurring && projection && (
                      <li className={styles.confirmRow} data-highlight="true">
                        <span>Projected at age {RETIREMENT_AGE}</span>
                        <strong>{formatUGXExact(Math.round(projection.retirementFV))}</strong>
                      </li>
                    )}
                  </ul>
                  <p className={styles.confirmNote}>
                    You&apos;ll receive an SMS prompt to authorise the payment on your mobile money account.
                  </p>

                  <div className={styles.sheetActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setView('form')}
                      disabled={submitting}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={submitting}
                      onClick={handleConfirm}
                    >
                      {submitting ? 'Processing…' : 'Confirm & pay'}
                    </button>
                  </div>
                </div>
              )}

              {view === 'success' && (
                <div className={styles.sheetBody} data-center="true">
                  <div className={styles.successCheck} aria-hidden="true">
                    <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
                      <path d="M14 24l7 7 14-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className={styles.successTitle}>
                    {isRecurring ? 'Schedule updated' : 'Contribution added'}
                  </h2>
                  <p className={styles.successSubtitle}>
                    {isRecurring
                      ? `Your ${mode.cadence.toLowerCase()} top-up of ${formatUGXExact(amount)} is set. We'll prompt you each time it's due.`
                      : `${formatUGXExact(amount)} is now working for you. Your new balance is ${formatUGXExact(newBalance)}.`}
                  </p>
                  {resultTx?.reference && (
                    <div className={styles.successRef}>
                      Reference <strong>{resultTx.reference}</strong>
                    </div>
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
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
