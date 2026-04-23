import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, calcFV } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber, useUpdateSchedule } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import styles from './ContributionSettingsPanel.module.css';

/* Mirrors ContributionSettings.jsx constants — kept in sync here intentionally
   so the subscriber can tune their plan without re-running onboarding. */
const MIN_CONTRIBUTION = 5000;
const RETIREMENT_AGE = 60;

const FREQUENCIES = [
  { id: 'weekly',      label: 'Weekly',      helper: 'every week',     cadence: 'every week',     perYear: 52 },
  { id: 'monthly',     label: 'Monthly',     helper: 'every month',    cadence: 'every month',    perYear: 12 },
  { id: 'quarterly',   label: 'Quarterly',   helper: 'every 3 months', cadence: 'every 3 months', perYear: 4  },
  { id: 'half-yearly', label: 'Half-Yearly', helper: 'every 6 months', cadence: 'every 6 months', perYear: 2  },
  { id: 'annually',    label: 'Annually',    helper: 'every year',     cadence: 'every year',     perYear: 1  },
];

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000, 250000];
const INSURANCE_PREMIUM_MONTHLY = 2000;
const INSURANCE_COVER = 1_000_000;

function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return Number.parseInt(cleaned, 10);
}

function getFreq(id) {
  return FREQUENCIES.find((f) => f.id === id) ?? FREQUENCIES[1];
}

function yearsToRetirement(age) {
  if (typeof age !== 'number') return 25;
  return Math.max(0, RETIREMENT_AGE - age);
}

export default function ContributionSettingsPanel({ splitMode = false }) {
  const { contributionSettingsOpen, setContributionSettingsOpen } = useDashboard();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateSchedule = useUpdateSchedule(sub?.id);

  const existing = sub?.contributionSchedule;

  const [frequency, setFrequency] = useState(existing?.frequency ?? 'monthly');
  const [amountStr, setAmountStr] = useState('');
  const [retirementPct, setRetirementPct] = useState(existing?.retirementPct ?? 80);
  const [includeInsurance, setIncludeInsurance] = useState(existing?.includeInsurance ?? false);
  const [submitting, setSubmitting] = useState(false);

  /* Sync from subscriber data when panel opens */
  useEffect(() => {
    if (contributionSettingsOpen && existing) {
      setFrequency(existing.frequency ?? 'monthly');
      setAmountStr(existing.amount ? String(existing.amount) : '');
      setRetirementPct(existing.retirementPct ?? 80);
      setIncludeInsurance(existing.includeInsurance ?? false);
    }
  }, [contributionSettingsOpen, existing]);

  /* Escape */
  useEffect(() => {
    if (!contributionSettingsOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') setContributionSettingsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contributionSettingsOpen, setContributionSettingsOpen]);

  const amount = parseAmount(amountStr);
  const freq = getFreq(frequency);
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;
  const emergencyPct = 100 - retirementPct;

  const insurancePremium = includeInsurance
    ? Math.round((INSURANCE_PREMIUM_MONTHLY * 12) / freq.perYear)
    : 0;
  const totalPerPeriod = hasAmount ? amount + insurancePremium : 0;
  const annualTotal = hasAmount ? totalPerPeriod * freq.perYear : 0;

  const retirementPerPeriod = hasAmount ? Math.round(amount * (retirementPct / 100)) : 0;
  const emergencyPerPeriod = hasAmount ? amount - retirementPerPeriod : 0;

  const years = yearsToRetirement(sub?.age);
  const contribMonthly = hasAmount ? (amount * freq.perYear) / 12 : 0;
  const retMonthly = contribMonthly * (retirementPct / 100);
  const retirementFV = useMemo(
    () => (years > 0 && retMonthly > 0 ? calcFV(retMonthly, years) : 0),
    [years, retMonthly]
  );

  const dirty = !!existing && (
    frequency !== existing.frequency ||
    amount !== existing.amount ||
    retirementPct !== existing.retirementPct ||
    includeInsurance !== existing.includeInsurance
  );

  async function handleSave() {
    if (!hasAmount || !sub || !dirty) return;
    setSubmitting(true);
    try {
      await updateSchedule.mutateAsync({
        frequency,
        amount,
        retirementPct,
        emergencyPct,
        includeInsurance,
        nextDueDate: existing?.nextDueDate,
      });
      addToast('success', 'Contribution schedule updated.');
      setContributionSettingsOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {contributionSettingsOpen && !splitMode && (
          <motion.div
            key="cs-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setContributionSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {contributionSettingsOpen && (
          <motion.div
            key="cs-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="cs-title"
            aria-modal="true"
          >
            <header className={styles.header}>
              <button className={styles.closeBtn} onClick={() => setContributionSettingsOpen(false)} aria-label="Close">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Contribution schedule</span>
                <h2 id="cs-title" className={styles.title}>Tune your savings rhythm</h2>
                <p className={styles.subtitle}>Change frequency, amount, and the retirement/emergency split.</p>
              </div>
            </header>

            <div className={styles.body}>
              {/* 01 Frequency */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>01</span>
                  <h3 className={styles.sectionTitle}>How often?</h3>
                </div>
                <div className={styles.freqGrid} role="radiogroup" aria-label="Frequency">
                  {FREQUENCIES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={frequency === f.id}
                      className={styles.freqCard}
                      data-active={frequency === f.id}
                      onClick={() => setFrequency(f.id)}
                    >
                      <span className={styles.freqLabel}>{f.label}</span>
                      <span className={styles.freqHelper}>{f.helper}</span>
                      {frequency === f.id && (
                        <span className={styles.freqCheck} aria-hidden="true">
                          <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                            <path d="M3 8.5l3.2 3 6.3-7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* 02 Amount */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>02</span>
                  <h3 className={styles.sectionTitle}>How much {freq.cadence}?</h3>
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
                    aria-label="Contribution amount"
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
                  <p className={styles.errorLine}>Minimum {formatUGXExact(MIN_CONTRIBUTION)}.</p>
                )}
              </section>

              {/* 03 Split */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIdx}>03</span>
                  <h3 className={styles.sectionTitle}>Split your savings</h3>
                </div>
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
                  aria-label="Retirement percentage"
                />
                <div className={styles.splitBar}>
                  <span className={styles.splitFillR} style={{ flexBasis: `${retirementPct}%` }} />
                  <span className={styles.splitFillE} style={{ flexBasis: `${emergencyPct}%` }} />
                </div>
                <p className={styles.bucketHelp}>
                  <span className={styles.bucketDot} data-tone="retirement" aria-hidden="true" />
                  <strong>Retirement</strong> locked until age {RETIREMENT_AGE}
                  <span className={styles.bucketSep} aria-hidden="true">·</span>
                  <span className={styles.bucketDot} data-tone="emergency" aria-hidden="true" />
                  <strong>Emergency</strong> accessible any time
                </p>
              </section>

              {/* Insurance opt-in */}
              <section className={styles.insuranceSection}>
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
                      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                      <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span className={styles.insuranceCopy}>
                    <span className={styles.insuranceTitle}>Add life insurance</span>
                    <span className={styles.insuranceDetail}>
                      {includeInsurance
                        ? `+${formatUGXExact(insurancePremium)} · ${formatUGXExact(INSURANCE_COVER)} cover`
                        : `UGX 2,000 / mo · UGX 1M cover`}
                    </span>
                  </span>
                  <span className={styles.insuranceToggle} aria-hidden="true">
                    <span className={styles.insuranceToggleKnob} />
                  </span>
                </button>
              </section>

              {/* Summary */}
              <section className={styles.summarySection}>
                <div className={styles.summaryHead}>
                  <span className={styles.summaryEyebrow}>What you&apos;ll pay</span>
                  <span className={styles.summaryCadence}>{freq.cadence[0].toUpperCase() + freq.cadence.slice(1)}</span>
                </div>
                <div className={styles.summaryBig}>
                  {hasAmount ? formatUGXExact(totalPerPeriod) : 'UGX —'}
                </div>
                <ul className={styles.summaryList}>
                  <li className={styles.summaryRow}>
                    <span>Per year</span>
                    <span>{hasAmount ? formatUGXExact(annualTotal) : '—'}</span>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>
                      <span className={styles.summaryDot} data-tone="retirement" /> Retirement ({retirementPct}%)
                    </span>
                    <span>{hasAmount ? formatUGXExact(retirementPerPeriod) : '—'}</span>
                  </li>
                  <li className={styles.summaryRow}>
                    <span>
                      <span className={styles.summaryDot} data-tone="emergency" /> Emergency ({emergencyPct}%)
                    </span>
                    <span>{hasAmount ? formatUGXExact(emergencyPerPeriod) : '—'}</span>
                  </li>
                  {includeInsurance && (
                    <li className={styles.summaryRow}>
                      <span>
                        <span className={styles.summaryDot} data-tone="insurance" /> Life insurance
                      </span>
                      <span>+{formatUGXExact(insurancePremium)}</span>
                    </li>
                  )}
                </ul>
                {retirementFV > 0 && (
                  <div className={styles.projection}>
                    <span className={styles.projLabel}>Projected at age {RETIREMENT_AGE}</span>
                    <span className={styles.projValue}>{formatUGXExact(Math.round(retirementFV))}</span>
                    <span className={styles.projNote}>Retirement bucket, compounded at 10% annually for {years} years.</span>
                  </div>
                )}
              </section>
            </div>

            <footer className={styles.footer}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!hasAmount || !dirty || submitting}
                onClick={handleSave}
              >
                {submitting ? 'Saving…' : dirty ? 'Save changes' : 'No changes to save'}
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
