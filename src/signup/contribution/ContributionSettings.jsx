import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calcFV, EASE_OUT_EXPO } from '../../utils/finance';
import logo from '../../assets/logo.png';
import PaymentStep from './PaymentStep';
import styles from './ContributionSettings.module.css';

export const MIN_CONTRIBUTION = 5000;
const RETIREMENT_AGE = 60;

const FREQUENCIES = [
  { id: 'weekly',      label: 'Weekly',      helper: 'every week',     cadence: 'every week',     perYear: 52 },
  { id: 'monthly',     label: 'Monthly',     helper: 'every month',    cadence: 'every month',    perYear: 12 },
  { id: 'quarterly',   label: 'Quarterly',   helper: 'every 3 months', cadence: 'every 3 months', perYear: 4  },
  { id: 'half-yearly', label: 'Half-Yearly', helper: 'every 6 months', cadence: 'every 6 months', perYear: 2  },
  { id: 'annually',    label: 'Annually',    helper: 'every year',     cadence: 'every year',     perYear: 1  },
];

const PRESET_AMOUNTS = [10000, 25000, 50000, 100000];

/** Flat insurance baseline — scales to chosen frequency. */
const INSURANCE_PREMIUM_MONTHLY = 2000;
const INSURANCE_COVER = 1_000_000;

/** Relatable Ugandan milestones — shown at retirement. */
const MILESTONES = [
  { id: 'land',    cost: 8_000_000, one: 'plot of land',        many: 'plots of land' },
  { id: 'tuition', cost: 4_000_000, one: 'year of university',  many: 'years of university' },
  { id: 'income',  cost: 1_000_000, one: 'month of income',     many: 'months of retirement income' },
];

function formatUGXExact(n) {
  if (!Number.isFinite(n) || n <= 0) return 'UGX 0';
  return `UGX ${Math.round(n).toLocaleString('en-UG')}`;
}

function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  return Number.parseInt(cleaned, 10);
}

function getFreq(frequencyId) {
  return FREQUENCIES.find((f) => f.id === frequencyId) ?? FREQUENCIES[1];
}

function formatUGXShort(n) {
  if (!Number.isFinite(n) || n <= 0) return 'UGX 0';
  if (n >= 1e9) return `UGX ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `UGX ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e5) return `UGX ${(n / 1e3).toFixed(0)}K`;
  return `UGX ${Math.round(n).toLocaleString('en-UG')}`;
}

/** Years until age 60, floor 0. Returns null if dob is missing/invalid. */
function yearsToRetirement(dob) {
  if (!dob) return null;
  const then = new Date(dob).getTime();
  if (!Number.isFinite(then)) return null;
  const ageYears = (Date.now() - then) / (365.25 * 24 * 3600 * 1000);
  if (ageYears < 0 || ageYears > 120) return null;
  return Math.max(0, RETIREMENT_AGE - ageYears);
}

/**
 * Full page for /signup/contribution — renders a single indigo-hero card
 * over a white canvas. Everything fits without scrolling the card.
 */
export default function ContributionSettings({ initial, dob, phone, onClose, onConfirm }) {
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'monthly');
  const [amountStr, setAmountStr] = useState(initial?.amount ? String(initial.amount) : '');
  const [retirementPct, setRetirementPct] = useState(initial?.retirementPct ?? 80);
  const [includeInsurance, setIncludeInsurance] = useState(initial?.includeInsurance ?? false);
  const [touched, setTouched] = useState(Boolean(initial?.amount));
  const [view, setView] = useState('setup');

  const amountInputRef = useRef(null);

  // Escape returns without saving (from setup view). In the payment view,
  // Escape backs out to setup so the user does not lose their work.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (view === 'payment') setView('setup');
      else onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, view]);

  const amount = parseAmount(amountStr);
  const emergencyPct = 100 - retirementPct;
  const freq = getFreq(frequency);
  const cadence = freq.cadence;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const canConfirm = hasAmount;

  // ── Projections ────────────────────────────────────────────────
  const insurancePremium = includeInsurance
    ? Math.round((INSURANCE_PREMIUM_MONTHLY * 12) / freq.perYear)
    : 0;
  const totalPerPeriod   = hasAmount ? amount + insurancePremium : 0;
  const annualTotal      = hasAmount ? totalPerPeriod * freq.perYear : 0;

  const contribAnnual       = hasAmount ? amount * freq.perYear : 0;
  const contribMonthly      = contribAnnual / 12;
  const retirementPerPeriod = hasAmount ? Math.round(amount * (retirementPct / 100)) : 0;
  const emergencyPerPeriod  = hasAmount ? amount - retirementPerPeriod : 0;

  const yrs = yearsToRetirement(dob);
  const retirementMonthly = contribMonthly * (retirementPct / 100);
  const retirementFV = yrs && yrs > 0 ? calcFV(retirementMonthly, yrs) : 0;
  const retirementYears = yrs != null ? Math.round(yrs) : null;
  const retirementYear  = retirementYears && retirementYears > 0
    ? new Date().getFullYear() + retirementYears
    : null;

  const milestones = useMemo(() => {
    if (!hasAmount || retirementFV <= 0) return [];
    return MILESTONES
      .map((m) => ({ ...m, count: Math.floor(retirementFV / m.cost) }))
      .filter((m) => m.count >= 1);
  }, [hasAmount, retirementFV]);

  function handlePresetClick(value) {
    setAmountStr(String(value));
    setTouched(true);
    amountInputRef.current?.focus();
  }

  function handleAmountChange(e) {
    const digitsOnly = e.target.value.replace(/[^\d]/g, '');
    setAmountStr(digitsOnly);
  }

  function handleGoToPayment() {
    setTouched(true);
    if (!canConfirm) return;
    setView('payment');
  }

  function handlePaymentComplete({ paymentMethod, paymentDetails }) {
    onConfirm({
      frequency,
      amount,
      retirementPct,
      emergencyPct,
      includeInsurance,
      paymentMethod,
      paymentDetails,
    });
  }

  return (
    <main className={styles.page} aria-labelledby="contrib-title">
      {/* Landing-page-style backdrop: subtle indigo grid + two radial orbs */}
      <div className={styles.pageBg} aria-hidden="true">
        <span className={styles.pageOrb1} />
        <span className={styles.pageOrb2} />
        <span className={styles.pageGrid} />
      </div>

      <div className={styles.pageHeader}>
        <img
          src={logo}
          alt="Universal Pensions"
          className={styles.logo}
          width={160}
          height={34}
        />
      </div>

      <div className={styles.shell}>
      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      >
        {/* ambient light + grain — purely decorative, lives behind content */}
        <span className={styles.cardMesh} aria-hidden="true" />
        <span className={styles.cardGrain} aria-hidden="true" />

        {/* ── Header ──────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.eyebrow}>Contribution setup</span>
            <h1 id="contrib-title" className={styles.title}>
              <span className={styles.shimmerText}>Design your savings rhythm</span>
            </h1>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close contribution setup"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* ── Section 1 — Frequency ─────────────────────────────── */}
        <section className={styles.section} aria-labelledby="freq-heading">
          <div className={styles.sectionHead}>
            <span className={styles.sectionIndex}>01</span>
            <h2 id="freq-heading" className={styles.sectionTitle}>How often?</h2>
          </div>
          <div className={styles.freqGrid} role="radiogroup" aria-label="Contribution frequency">
            {FREQUENCIES.map((f) => {
              const active = frequency === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-active={active}
                  className={styles.freqCard}
                  onClick={() => setFrequency(f.id)}
                >
                  <span className={styles.freqLabel}>{f.label}</span>
                  <span className={styles.freqHelper}>{f.helper}</span>
                  <span className={styles.freqCheck} aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                      <path d="M3 8.5l3.2 3 6.3-7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Section 2 — Amount ────────────────────────────────── */}
        <section className={styles.section} aria-labelledby="amt-heading">
          <div className={styles.sectionHead}>
            <span className={styles.sectionIndex}>02</span>
            <h2 id="amt-heading" className={styles.sectionTitle}>How much each time?</h2>
            <span className={styles.sectionAside}>Min {formatUGXExact(MIN_CONTRIBUTION)}</span>
          </div>

          <label className={styles.amountField} data-error={belowMin && touched}>
            <span className={styles.amountPrefix} aria-hidden="true">UGX</span>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="Enter amount"
              aria-label="Contribution amount in UGX"
              aria-invalid={belowMin && touched}
              aria-describedby="amt-helper"
              className={styles.amountInput}
              value={amountStr ? Number.parseInt(amountStr, 10).toLocaleString('en-UG') : ''}
              onChange={handleAmountChange}
              onBlur={() => setTouched(true)}
            />
            <span className={styles.amountCadence} aria-hidden="true">{cadence}</span>
          </label>

          <div className={styles.presetRow} role="group" aria-label="Quick-select amounts">
            {PRESET_AMOUNTS.map((v) => {
              const active = amount === v;
              return (
                <button
                  key={v}
                  type="button"
                  className={styles.presetChip}
                  data-active={active}
                  onClick={() => handlePresetClick(v)}
                >
                  {formatUGXExact(v)}
                </button>
              );
            })}
          </div>

          {belowMin && touched && (
            <p id="amt-helper" className={styles.errorLine}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
              Enter at least {formatUGXExact(MIN_CONTRIBUTION)} to continue.
            </p>
          )}
        </section>

        {/* ── Section 3 — Allocation ────────────────────────────── */}
        <section className={styles.section} aria-labelledby="alloc-heading">
          <div className={styles.sectionHead}>
            <span className={styles.sectionIndex}>03</span>
            <h2 id="alloc-heading" className={styles.sectionTitle}>Split your savings</h2>
          </div>

          <div className={styles.splitHead}>
            <div className={styles.splitSide}>
              <span className={styles.splitLabel}>Retirement</span>
              <span className={styles.splitPct}>{retirementPct}<em>%</em></span>
            </div>
            <div className={styles.splitSide} data-align="right">
              <span className={styles.splitLabel} data-tone="teal">Emergency</span>
              <span className={styles.splitPct} data-tone="teal">{emergencyPct}<em>%</em></span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={retirementPct}
            onChange={(e) => setRetirementPct(Number.parseInt(e.target.value, 10))}
            aria-label="Retirement savings percentage"
            aria-valuetext={`${retirementPct} percent to retirement, ${emergencyPct} percent to emergency`}
            className={styles.slider}
            style={{ '--pct': `${retirementPct}%` }}
          />

          <div
            className={styles.allocBar}
            role="img"
            aria-label={`${retirementPct}% retirement, ${emergencyPct}% emergency`}
          >
            <span className={styles.allocFillRetirement} style={{ flexBasis: `${retirementPct}%` }} />
            <span className={styles.allocFillEmergency} style={{ flexBasis: `${emergencyPct}%` }} />
          </div>

          <p className={styles.bucketHelp}>
            <span className={styles.bucketDot} data-tone="retirement" aria-hidden="true" />
            <strong>Retirement</strong> is locked until retirement age
            <span className={styles.bucketSep} aria-hidden="true">·</span>
            <span className={styles.bucketDot} data-tone="emergency" aria-hidden="true" />
            <strong>Emergency</strong> is accessible in cases of hardship
          </p>
        </section>

        {/* ── Insurance opt-in ─────────────────────────────────── */}
        <section className={styles.insuranceSection} aria-labelledby="ins-heading">
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
                <path
                  d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12l2.2 2 3.8-4"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.insuranceCopy}>
              <span id="ins-heading" className={styles.insuranceTitle}>
                Add life insurance
              </span>
              <span className={styles.insuranceDetail}>
                {includeInsurance
                  ? `+${formatUGXExact(insurancePremium)} · ${formatUGXExact(INSURANCE_COVER)} cover`
                  : `from UGX 500 · UGX ${(INSURANCE_COVER / 1_000_000).toFixed(0)}M cover`}
              </span>
            </span>
            <span className={styles.insuranceToggle} aria-hidden="true">
              <span className={styles.insuranceToggleKnob} />
            </span>
          </button>
        </section>
      </motion.div>

      {/* ── Summary / checkout card ──────────────────────────────── */}
      <motion.aside
        className={styles.summaryCard}
        aria-label="Your plan summary"
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT_EXPO, delay: 0.08 }}
      >
        <header className={styles.summaryHeader}>
          <span className={styles.summaryEyebrow}>Your plan</span>
          <h2 className={styles.summaryTitle}>What you’ll pay</h2>
        </header>

        <div className={styles.summaryHero}>
          <span className={styles.summaryHeroLabel}>{cadence[0].toUpperCase() + cadence.slice(1)}</span>
          <span className={styles.summaryHeroValue}>
            {hasAmount ? formatUGXExact(totalPerPeriod) : 'UGX —'}
          </span>
        </div>

        <ul className={styles.summaryList}>
          <li className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>Per year</span>
            <span className={styles.summaryRowValue}>
              {hasAmount ? formatUGXExact(annualTotal) : '—'}
            </span>
          </li>
          <li className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>
              <span className={styles.summaryDot} data-tone="retirement" aria-hidden="true" />
              Retirement <em>{retirementPct}%</em>
            </span>
            <span className={styles.summaryRowValue}>
              {hasAmount ? formatUGXExact(retirementPerPeriod) : '—'}
            </span>
          </li>
          <li className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>
              <span className={styles.summaryDot} data-tone="emergency" aria-hidden="true" />
              Emergency <em>{emergencyPct}%</em>
            </span>
            <span className={styles.summaryRowValue}>
              {hasAmount ? formatUGXExact(emergencyPerPeriod) : '—'}
            </span>
          </li>
          {includeInsurance && (
            <li className={styles.summaryRow}>
              <span className={styles.summaryRowLabel}>
                <span className={styles.summaryDot} data-tone="insurance" aria-hidden="true" />
                Life insurance
              </span>
              <span className={styles.summaryRowValue}>
                {hasAmount ? `+${formatUGXExact(insurancePremium)}` : '—'}
              </span>
            </li>
          )}
        </ul>

        {/* ── Swap: plan projection ⇄ payment methods ──────────── */}
        <AnimatePresence mode="wait" initial={false}>
          {view === 'setup' ? (
            <motion.div
              key="plan"
              className={styles.summarySwap}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              {/* ── Future value at retirement ──────────────── */}
              <div className={styles.projection}>
                <div className={styles.projectionHead}>
                  <span className={styles.projectionLabel}>At retirement (age {RETIREMENT_AGE})</span>
                  {retirementYears != null && retirementYears > 0 && (
                    <span className={styles.projectionYears}>in {retirementYears} yrs</span>
                  )}
                </div>
                <div className={styles.projectionValue}>
                  {hasAmount && retirementFV > 0 ? formatUGXShort(retirementFV) : 'UGX —'}
                </div>
                {retirementYear && (
                  <p className={styles.projectionYear}>
                    You’ll reach age {RETIREMENT_AGE} in <strong>{retirementYear}</strong>
                  </p>
                )}
                <p className={styles.projectionHelp}>
                  {retirementYears == null
                    ? 'Add your date of birth to see a projection.'
                    : retirementYears <= 0
                      ? 'You’re already at retirement age — contributions stay accessible.'
                      : `At 10% annual return, compounded monthly — retirement bucket only.`}
                </p>
              </div>

              {/* ── What that could buy ─────────────────────── */}
              {milestones.length > 0 && (
                <section className={styles.milestones} aria-label="What your retirement savings could buy">
                  <h3 className={styles.milestonesTitle}>That could buy you…</h3>
                  <ul className={styles.milestonesList}>
                    {milestones.map((m) => (
                      <li key={m.id} className={styles.milestone}>
                        <span className={styles.milestoneIcon} aria-hidden="true">
                          {m.id === 'land' && (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9z"
                                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                          )}
                          {m.id === 'tuition' && (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <path d="M3 9l9-4 9 4-9 4-9-4z"
                                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                              <path d="M6 11v4.2c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3V11"
                                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              <path d="M21 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          )}
                          {m.id === 'income' && (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <rect x="4" y="5" width="16" height="15" rx="1.5"
                                    stroke="currentColor" strokeWidth="1.6" />
                              <path d="M4 10h16M8 3v4M16 3v4"
                                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              <path d="M9 14h6M9 17h4"
                                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          )}
                        </span>
                        <span className={styles.milestoneCount}>{m.count.toLocaleString('en-UG')}</span>
                        <span className={styles.milestoneLabel}>
                          {m.count === 1 ? m.one : m.many}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.milestonesNote}>Rough Uganda estimates — actual prices vary.</p>
                </section>
              )}

              {/* ── Pay now CTA ─────────────────────────────── */}
              <button
                type="button"
                className={styles.payNow}
                disabled={!canConfirm}
                onClick={handleGoToPayment}
              >
                <span>Pay now</span>
                {hasAmount && (
                  <span className={styles.payNowAmount}>{formatUGXExact(totalPerPeriod)}</span>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="payment"
              className={styles.summarySwap}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <PaymentStep
                amount={totalPerPeriod}
                phone={phone}
                formatUGX={formatUGXExact}
                onBack={() => setView('setup')}
                onComplete={handlePaymentComplete}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
      </div>
    </main>
  );
}
