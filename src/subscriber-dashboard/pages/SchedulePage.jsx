import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, calcFV, parseAmount, FREQUENCY, periodsPerYear } from '../../utils/finance';
import { useCurrentSubscriber, useUpdateSchedule } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import {
  RETIREMENT_AGE,
  MIN_CONTRIBUTION,
  INSURANCE_PREMIUM_MONTHLY,
  INSURANCE_COVER,
  QUICK_CONTRIBUTION_AMOUNTS,
} from '../../constants/savings';
import PageHeader from '../shell/PageHeader';
import styles from './SchedulePage.module.css';

const FREQUENCIES = [
  { id: FREQUENCY.WEEKLY,      label: 'Weekly',      helper: 'every week',     cadence: 'every week'     },
  { id: FREQUENCY.MONTHLY,     label: 'Monthly',     helper: 'every month',    cadence: 'every month'    },
  { id: FREQUENCY.QUARTERLY,   label: 'Quarterly',   helper: 'every 3 months', cadence: 'every 3 months' },
  { id: FREQUENCY.HALF_YEARLY, label: 'Half-yearly', helper: 'every 6 months', cadence: 'every 6 months' },
  { id: FREQUENCY.ANNUALLY,    label: 'Annually',    helper: 'every year',     cadence: 'every year'     },
];

const PRESET_AMOUNTS = QUICK_CONTRIBUTION_AMOUNTS;

function getFreq(id) {
  return FREQUENCIES.find((f) => f.id === id) ?? FREQUENCIES[1];
}

function yearsToRetirement(age) {
  if (typeof age !== 'number') return 25;
  return Math.max(0, RETIREMENT_AGE - age);
}

export default function SchedulePage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateSchedule = useUpdateSchedule(sub?.id);

  const existing = sub?.contributionSchedule;

  const [frequency, setFrequency] = useState(existing?.frequency ?? 'monthly');
  const [amountStr, setAmountStr] = useState(existing?.amount ? String(existing.amount) : '');
  const [retirementPct, setRetirementPct] = useState(existing?.retirementPct ?? 80);
  const [includeInsurance, setIncludeInsurance] = useState(existing?.includeInsurance ?? false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setFrequency(existing.frequency ?? 'monthly');
    setAmountStr(existing.amount ? String(existing.amount) : '');
    setRetirementPct(existing.retirementPct ?? 80);
    setIncludeInsurance(existing.includeInsurance ?? false);
  }, [existing]);

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

  const years = yearsToRetirement(sub?.age);
  const contribMonthly = hasAmount ? (amount * freqPerYear) / 12 : 0;
  const retMonthly = contribMonthly * (retirementPct / 100);
  const retirementFV = useMemo(
    () => (years > 0 && retMonthly > 0 ? calcFV(retMonthly, years) : 0),
    [years, retMonthly],
  );

  const isNew = !existing;
  const dirty = !isNew && (
    frequency !== existing.frequency ||
    amount !== existing.amount ||
    retirementPct !== existing.retirementPct ||
    includeInsurance !== existing.includeInsurance
  );
  const canSave = hasAmount && (isNew || dirty);

  async function handleSave() {
    if (!canSave || !sub) return;
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
      addToast('success', isNew ? 'Schedule set up.' : 'Contribution schedule updated.');
      navigate('/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={isNew ? 'Set a schedule' : 'Tune your schedule'}
        subtitle="Frequency, amount, and the retirement/emergency split"
        fallback="/dashboard/save"
      />

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
            {retirementFV > 0 && (
              <div className={styles.projection}>
                <span className={styles.projLabel}>Projected at age {RETIREMENT_AGE}</span>
                <span className={styles.projValue}>{formatUGXExact(Math.round(retirementFV))}</span>
                <span className={styles.projNote}>Retirement bucket, compounded over {years} years.</span>
              </div>
            )}
          </section>
        </motion.div>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSave || submitting}
          onClick={handleSave}
        >
          {submitting ? 'Saving…' : isNew ? 'Set up schedule' : dirty ? 'Save changes' : 'No changes to save'}
        </button>
      </footer>
    </div>
  );
}
