import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  EASE_OUT_EXPO,
  formatUGXExact,
  calcFV,
  parseAmount,
  FREQUENCY,
  periodsPerYear,
  normalizeFrequency,
} from '../../utils/finance';
import { formatNumber } from '../../utils/currency';
import {
  RETIREMENT_AGE,
  MIN_CONTRIBUTION,
  INSURANCE_PREMIUM_MONTHLY,
  INSURANCE_COVER,
  QUICK_CONTRIBUTION_AMOUNTS,
} from '../../constants/savings';
import styles from './ContributionSettingsForm.module.css';

const FREQUENCIES = [
  { id: FREQUENCY.WEEKLY,      label: 'Weekly',      helper: 'every week',     cadence: 'every week'     },
  { id: FREQUENCY.MONTHLY,     label: 'Monthly',     helper: 'every month',    cadence: 'every month'    },
  { id: FREQUENCY.QUARTERLY,   label: 'Quarterly',   helper: 'every 3 months', cadence: 'every 3 months' },
  { id: FREQUENCY.HALF_YEARLY, label: 'Half-yearly', helper: 'every 6 months', cadence: 'every 6 months' },
  { id: FREQUENCY.ANNUALLY,    label: 'Annually',    helper: 'every year',     cadence: 'every year'     },
];

function getFreq(id) {
  return FREQUENCIES.find((f) => f.id === id) ?? FREQUENCIES[1];
}

function yearsToRetirement({ age, dob }) {
  if (typeof age === 'number') return Math.max(0, RETIREMENT_AGE - age);
  if (dob) {
    const ageYears = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (Number.isFinite(ageYears) && ageYears >= 0 && ageYears <= 120) {
      return Math.max(0, RETIREMENT_AGE - ageYears);
    }
  }
  return 25;
}

/**
 * Reusable contribution-schedule form. Used by subscriber's SchedulePage,
 * agent's SubscriberSchedulePage, and agent's onboarding schedule step.
 *
 * Owns its internal state. Calls `onSave` with the schedule object. Renders
 * a sticky footer with primary (and optional secondary) buttons.
 */
export default function ContributionSettingsForm({
  initial,
  age,
  dob,
  onSave,
  onCancel,
  submitting = false,
  submitLabel,
  cancelLabel = 'Cancel',
  showProjection = true,
}) {
  // State is initialized from `initial` once at mount. If the parent is
  // waiting on async data (e.g., a React Query fetch), it should pass a
  // stable `key` so the form remounts when `initial` first becomes available.
  const [frequency, setFrequency] = useState(normalizeFrequency(initial?.frequency));
  const [amountStr, setAmountStr] = useState(initial?.amount ? String(initial.amount) : '');
  const [retirementPct, setRetirementPct] = useState(initial?.retirementPct ?? 80);
  const [includeInsurance, setIncludeInsurance] = useState(Boolean(initial?.includeInsurance));
  const [touched, setTouched] = useState(Boolean(initial?.amount));

  const amount = parseAmount(amountStr);
  const freq = getFreq(frequency);
  const freqPerYear = periodsPerYear(freq.id);
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;
  const emergencyPct = 100 - retirementPct;

  const insurancePremium = includeInsurance
    ? Math.round((INSURANCE_PREMIUM_MONTHLY * 12) / freqPerYear)
    : 0;
  const totalPerPeriod = hasAmount ? amount + insurancePremium : 0;
  const annualTotal = hasAmount ? totalPerPeriod * freqPerYear : 0;
  const retirementPerPeriod = hasAmount ? Math.round(amount * (retirementPct / 100)) : 0;
  const emergencyPerPeriod = hasAmount ? amount - retirementPerPeriod : 0;

  const years = yearsToRetirement({ age, dob });
  const contribMonthly = hasAmount ? (amount * freqPerYear) / 12 : 0;
  const retMonthly = contribMonthly * (retirementPct / 100);
  const retirementFV = useMemo(
    () => (years > 0 && retMonthly > 0 ? calcFV(retMonthly, years) : 0),
    [years, retMonthly],
  );

  const isNew = !initial;
  const dirty = !isNew && (
    frequency !== normalizeFrequency(initial.frequency) ||
    amount !== initial.amount ||
    retirementPct !== initial.retirementPct ||
    includeInsurance !== Boolean(initial.includeInsurance)
  );
  const canSave = hasAmount && (isNew || dirty);

  const defaultLabel = isNew ? 'Set up schedule' : (dirty ? 'Save changes' : 'No changes to save');
  const buttonLabel = submitting ? 'Saving…' : (submitLabel ?? defaultLabel);

  function handleSave() {
    setTouched(true);
    if (!canSave || submitting) return;
    const payload = {
      frequency,
      amount,
      retirementPct,
      emergencyPct,
      includeInsurance,
    };
    if (initial?.nextDueDate) payload.nextDueDate = initial.nextDueDate;
    onSave(payload);
  }

  return (
    <>
      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {/* 01 Frequency */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIdx}>01</span>
              <h2 className={styles.sectionTitle}>How often?</h2>
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
              <h2 className={styles.sectionTitle}>How much {freq.cadence}?</h2>
              <span className={styles.sectionAside}>Min {formatUGXExact(MIN_CONTRIBUTION)}</span>
            </div>
            <label className={styles.amountField} data-error={(touched && belowMin) || undefined}>
              <span className={styles.amountPrefix} aria-hidden="true">UGX</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={amountStr ? formatNumber(Number.parseInt(amountStr, 10)) : ''}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => setTouched(true)}
                placeholder="Enter amount"
                className={styles.amountInput}
                aria-label="Contribution amount"
                aria-invalid={touched && belowMin}
              />
            </label>
            <div className={styles.presetRow}>
              {QUICK_CONTRIBUTION_AMOUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={styles.presetChip}
                  data-active={amount === v}
                  onClick={() => { setAmountStr(String(v)); setTouched(true); }}
                >
                  {formatUGXExact(v)}
                </button>
              ))}
            </div>
            {touched && belowMin && (
              <p className={styles.errorLine}>Minimum {formatUGXExact(MIN_CONTRIBUTION)}.</p>
            )}
          </section>

          {/* 03 Split */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionIdx}>03</span>
              <h2 className={styles.sectionTitle}>Split your savings</h2>
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
              <strong>Emergency</strong> any time
            </p>
          </section>

          {/* Insurance opt-in */}
          <section className={styles.section} data-compact="true">
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
                    : 'UGX 2,000 / mo · UGX 1M cover'}
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
            {showProjection && retirementFV > 0 && (
              <div className={styles.projection}>
                <span className={styles.projLabel}>Projected at age {RETIREMENT_AGE}</span>
                <span className={styles.projValue}>{formatUGXExact(Math.round(retirementFV))}</span>
                <span className={styles.projNote}>Retirement bucket, compounded over {Math.round(years)} years.</span>
              </div>
            )}
          </section>
        </motion.div>
      </div>

      <footer className={styles.footer}>
        {onCancel && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSave || submitting}
          onClick={handleSave}
        >
          {buttonLabel}
        </button>
      </footer>
    </>
  );
}
