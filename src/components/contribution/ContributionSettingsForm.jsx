import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { calcFV, parseAmount, FREQUENCY, periodsPerYear, normalizeFrequency } from '../../utils/finance';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { formatNumber, formatUGX } from '../../utils/currency';
import {
  RETIREMENT_AGE,
  MIN_CONTRIBUTION,
  INSURANCE_PRODUCTS,
  QUICK_CONTRIBUTION_AMOUNTS,
} from '../../constants/savings';
import styles from './ContributionSettingsForm.module.css';

/** Inline glyph for an insurance product, keyed by its `icon` in INSURANCE_PRODUCTS. */
function InsuranceGlyph({ icon }) {
  if (icon === 'health') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path
          d="M12 20s-6.6-4.3-9-8.4C1.4 8.9 3 6 6 6c2 0 3.2 1.2 4 2.4C10.8 7.2 12 6 14 6c3 0 4.6 2.9 3 5.6C18.6 15.7 12 20 12 20z"
          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (icon === 'funeral') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="12" cy="7" rx="2.3" ry="3.1" />
        <ellipse cx="12" cy="17" rx="2.3" ry="3.1" />
        <ellipse cx="7" cy="12" rx="3.1" ry="2.3" />
        <ellipse cx="17" cy="12" rx="3.1" ry="2.3" />
        <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // life (default) — shield with check
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Resolve the initial set of selected insurance product ids.
 *
 * `heldInsuranceTypes` (when the parent passes it) is the authoritative set of
 * products the subscriber CURRENTLY holds — derived from their live policies —
 * and takes precedence so the form pre-checks exactly what they own. It is the
 * same set the settle flow treats as already-paid, so opening a fully-held plan
 * and saving it untouched registers no newly-added product and never re-charges
 * a held premium.
 *
 * When it's absent (agent onboarding, or any caller without held-policy data)
 * we fall back to the stored schedule: an explicit `insuranceTypes` array if one
 * was carried, else Life when the legacy `include_insurance` boolean is on.
 */
function resolveInitialSelection(initial, heldInsuranceTypes) {
  const source = Array.isArray(heldInsuranceTypes)
    ? heldInsuranceTypes
    : (Array.isArray(initial?.insuranceTypes) ? initial.insuranceTypes : null);
  if (source) {
    return INSURANCE_PRODUCTS.filter((p) => source.includes(p.id)).map((p) => p.id);
  }
  return initial?.includeInsurance ? ['life'] : [];
}

function sameSelection(a, b) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

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
  // Product ids the subscriber currently holds (active policies). When supplied
  // these pre-check the insurance toggles so the form reflects what's actually
  // owned — not just the stored `include_insurance` boolean — and they baseline
  // the dirty-check so a held plan saved untouched never re-prompts payment.
  // Optional: callers without held-policy data (agent onboarding) omit it.
  initialInsuranceTypes,
  onSave,
  onCancel,
  submitting = false,
  submitLabel,
  cancelLabel = 'Cancel',
  showProjection = true,
  // `layout="split"` tightens spacing and, when the form has room (a container
  // query at ~860px), lays the inputs + live summary side-by-side to cut the
  // long vertical scroll. Used by the agent's desktop schedule page + onboarding;
  // left undefined elsewhere (e.g. the subscriber dashboard) so they're unchanged.
  layout,
  // `collapsible` (subscriber mobile only): when editing an EXISTING schedule,
  // each section collapses to a summary row (current value + Edit) and expands
  // per-section on tap — so the phone view is a short settings list instead of a
  // long scroll. Ignored for a brand-new setup (nothing to summarise) and left
  // off where the full form is wanted (desktop split, agent, onboarding).
  collapsible = false,
  // `showInsurance` (default true): render the insurance multi-select (section
  // 04) and emit the insurance selection on save. The AGENT's schedule-EDIT
  // forks pass `false` — an agent cannot authorise a premium for someone else
  // (pay_insurance_premium requires app_role='subscriber'), so insurance is the
  // subscriber's own post-signup decision. When false the section is hidden AND
  // the save payload omits includeInsurance/insuranceTypes, so the subscriber's
  // existing insurance flag is left untouched.
  showInsurance = true,
}) {
  // State is initialized from `initial` once at mount. If the parent is
  // waiting on async data (e.g., a React Query fetch), it should pass a
  // stable `key` so the form remounts when `initial` first becomes available.
  const [frequency, setFrequency] = useState(normalizeFrequency(initial?.frequency));
  const [amountStr, setAmountStr] = useState(initial?.amount ? String(initial.amount) : '');
  // Retirement must be at least 60% of the split (emergency caps at 40%), so
  // clamp any lower stored/legacy value up to the floor when the form opens.
  const [retirementPct, setRetirementPct] = useState(Math.max(60, initial?.retirementPct ?? 80));
  // Insurance is now a multi-select across INSURANCE_PRODUCTS (health/funeral/life)
  // rather than a single life toggle. Held as an array of product ids.
  const [insuranceTypes, setInsuranceTypes] = useState(() =>
    showInsurance ? resolveInitialSelection(initial, initialInsuranceTypes) : []);
  const [touched, setTouched] = useState(Boolean(initial?.amount));

  const amount = parseAmount(amountStr);
  const freq = getFreq(frequency);
  const freqPerYear = periodsPerYear(freq.id);
  const hasAmount = amount !== null && amount >= MIN_CONTRIBUTION;
  const belowMin = amount !== null && amount < MIN_CONTRIBUTION;
  const emergencyPct = 100 - retirementPct;

  const includeInsurance = insuranceTypes.length > 0;
  const selectedProducts = INSURANCE_PRODUCTS.filter((p) => insuranceTypes.includes(p.id));
  const premiumPerPeriod = (product) => Math.round((product.premiumMonthly * 12) / freqPerYear);
  const insurancePremium = selectedProducts.reduce((sum, p) => sum + premiumPerPeriod(p), 0);

  function toggleInsurance(id) {
    setInsuranceTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const totalPerPeriod = hasAmount ? amount + insurancePremium : 0;
  const retirementPerPeriod = hasAmount ? Math.round(amount * (retirementPct / 100)) : 0;
  const emergencyPerPeriod = hasAmount ? amount - retirementPerPeriod : 0;

  const years = yearsToRetirement({ age, dob });
  const contribMonthly = hasAmount ? (amount * freqPerYear) / 12 : 0;
  const retMonthly = contribMonthly * (retirementPct / 100);
  const retirementFV = useMemo(
    () => (years > 0 && retMonthly > 0 ? calcFV(retMonthly, years) : 0),
    [years, retMonthly],
  );

  // Baseline the "dirty" check against the SAME set the form pre-checked (held
  // products when supplied), so opening a fully-held plan and saving it untouched
  // reads as "No changes to save" — never re-prompting payment for held cover.
  const baselineInsurance = useMemo(
    () => (showInsurance ? resolveInitialSelection(initial, initialInsuranceTypes) : []),
    [initial, initialInsuranceTypes, showInsurance],
  );

  const isNew = !initial;
  const dirty = !isNew && (
    frequency !== normalizeFrequency(initial.frequency) ||
    amount !== initial.amount ||
    retirementPct !== initial.retirementPct ||
    !sameSelection(insuranceTypes, baselineInsurance)
  );
  const canSave = hasAmount && (isNew || dirty);

  const defaultLabel = isNew ? 'Set up schedule' : (dirty ? 'Save changes' : 'No changes to save');
  const buttonLabel = submitting ? 'Saving…' : (submitLabel ?? defaultLabel);

  // Per-section collapse (subscriber mobile). Only when editing an existing
  // schedule — a fresh setup shows everything expanded. Sections start collapsed
  // and expand independently on tap.
  const collapseMode = collapsible && !isNew;
  const [openSections, setOpenSections] = useState(() => new Set());
  const isOpen = (id) => !collapseMode || openSections.has(id);
  function toggleSection(id) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Collapsed-row summaries — the "current status" shown next to each Edit.
  const freqSummary = freq.label;
  const amountSummary = hasAmount ? formatUGX(amount, { compact: false }) : 'Not set';
  const splitSummary = `${retirementPct}% / ${emergencyPct}%`;
  const insuranceSummary = selectedProducts.length
    ? selectedProducts.map((p) => p.label.replace(/\s*insurance$/i, '')).join(', ')
    : 'None';

  // Section header: the numbered head when expanded/full-form, or a collapsed
  // summary row (title + current value + Edit/Done toggle) in collapse mode.
  function renderHead(id, idx, title, aside, summary) {
    if (!collapseMode) {
      return (
        <div className={styles.sectionHead}>
          <span className={styles.sectionIdx}>{idx}</span>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {aside && <span className={styles.sectionAside}>{aside}</span>}
        </div>
      );
    }
    const open = isOpen(id);
    return (
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {!open && <span className={styles.sectionSummary}>{summary}</span>}
        <button
          type="button"
          className={styles.editToggle}
          aria-expanded={open}
          onClick={() => toggleSection(id)}
        >
          {open ? 'Done' : 'Edit'}
        </button>
      </div>
    );
  }

  function handleSave() {
    setTouched(true);
    if (!canSave || submitting) return;
    const payload = {
      frequency,
      amount,
      retirementPct,
      emergencyPct,
    };
    // Only emit the insurance selection when the section is shown. Omitting it
    // (agent schedule-edit) leaves the subscriber's existing include_insurance
    // untouched (updateContributionSchedule only patches it when sent).
    if (showInsurance) {
      payload.includeInsurance = includeInsurance;
      payload.insuranceTypes = insuranceTypes;
    }
    if (initial?.nextDueDate) payload.nextDueDate = initial.nextDueDate;
    onSave(payload);
  }

  const isSplit = layout === 'split';

  return (
    <>
      <div className={`${styles.body} ${isSplit ? styles.bodySplit : ''}`}>
        <motion.div
          className={styles.step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.inputsCol}>
          {/* 01 Frequency */}
          <section className={styles.section}>
            {renderHead('freq', '01', 'How often?', null, freqSummary)}
            {isOpen('freq') && (
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
            )}
          </section>

          {/* 02 Amount */}
          <section className={styles.section}>
            {renderHead('amount', '02', `How much ${freq.cadence}?`, `Min ${formatUGX(MIN_CONTRIBUTION, { compact: false })}`, amountSummary)}
            {isOpen('amount') && (
            <>
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
                  {formatUGX(v, { compact: false })}
                </button>
              ))}
            </div>
            {touched && belowMin && (
              <p className={styles.errorLine}>Minimum {formatUGX(MIN_CONTRIBUTION, { compact: false })}.</p>
            )}
            </>
            )}
          </section>

          {/* 03 Split */}
          <section className={styles.section}>
            {renderHead('split', '03', 'Split your savings', null, splitSummary)}
            {isOpen('split') && (
            <>
            <div className={styles.splitHead}>
              <div className={styles.splitSide}>
                <span className={styles.splitLabel}>Retirement</span>
                <span className={styles.splitPct}>{retirementPct}%</span>
                <span className={styles.splitNote}>Locked until {RETIREMENT_AGE}</span>
              </div>
              <div className={styles.splitSide} data-align="right">
                <span className={styles.splitLabel} data-tone="teal">Emergency</span>
                <span className={styles.splitPct} data-tone="teal">{emergencyPct}%</span>
                <span className={styles.splitNote}>Withdraw anytime</span>
              </div>
            </div>
            <input
              type="range"
              min={60}
              max={100}
              step={5}
              value={retirementPct}
              onChange={(e) => setRetirementPct(Number.parseInt(e.target.value, 10))}
              className={styles.slider}
              style={{ '--pct': `${(retirementPct - 60) * 2.5}%` }}
              aria-label="Retirement percentage"
            />
            </>
            )}
          </section>

          {/* 04 Insurance (optional, multi-select) — hidden on the agent's
              schedule-edit forks (showInsurance={false}). */}
          {showInsurance && (
          <section className={styles.section}>
            {renderHead('insurance', '04', 'Add insurance', 'Optional · pick any', insuranceSummary)}
            {isOpen('insurance') && (
            <div className={styles.insuranceList}>
              {INSURANCE_PRODUCTS.map((product) => {
                const active = insuranceTypes.includes(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    role="switch"
                    aria-checked={active}
                    className={styles.insuranceRow}
                    data-active={active}
                    onClick={() => toggleInsurance(product.id)}
                  >
                    <span className={styles.insuranceIcon} aria-hidden="true">
                      <InsuranceGlyph icon={product.icon} />
                    </span>
                    <span className={styles.insuranceCopy}>
                      <span className={styles.insuranceTitle}>{product.label}</span>
                      <span className={styles.insuranceDetail}>
                        {`${formatUGX(product.premiumMonthly, { compact: false })} / mo · ${formatUGX(product.cover, { compact: false })} cover`}
                      </span>
                    </span>
                    <span className={styles.insuranceToggle} aria-hidden="true">
                      <span className={styles.insuranceToggleKnob} />
                    </span>
                  </button>
                );
              })}
            </div>
            )}
          </section>
          )}
          </div>

          <div className={styles.summaryCol}>
          {/* Summary */}
          <section className={styles.summarySection}>
            <div className={styles.summaryHead}>
              <span className={styles.summaryEyebrow}>What you&apos;ll pay</span>
              <span className={styles.summaryCadence}>{freq.cadence[0].toUpperCase() + freq.cadence.slice(1)}</span>
            </div>
            <div className={styles.summaryBig}>
              {hasAmount ? formatUGX(totalPerPeriod, { compact: false }) : 'UGX —'}
            </div>
            <ul className={styles.summaryList}>
              <li className={styles.summaryRow}>
                <span>
                  <span className={styles.summaryDot} data-tone="retirement" /> Retirement ({retirementPct}%)
                </span>
                <span>{hasAmount ? formatUGX(retirementPerPeriod, { compact: false }) : '—'}</span>
              </li>
              <li className={styles.summaryRow}>
                <span>
                  <span className={styles.summaryDot} data-tone="emergency" /> Emergency ({emergencyPct}%)
                </span>
                <span>{hasAmount ? formatUGX(emergencyPerPeriod, { compact: false }) : '—'}</span>
              </li>
              {selectedProducts.map((product) => (
                <li className={styles.summaryRow} key={product.id}>
                  <span>
                    <span className={styles.summaryDot} data-tone="insurance" /> {product.label}
                  </span>
                  <span>+{formatUGX(premiumPerPeriod(product), { compact: false })}</span>
                </li>
              ))}
            </ul>
            {showProjection && retirementFV > 0 && (
              <div className={styles.projection}>
                <span className={styles.projLabel}>Projected at age {RETIREMENT_AGE}</span>
                <span className={styles.projValue}>{formatUGX(Math.round(retirementFV), { compact: false })}</span>
                <span className={styles.projNote}>Retirement bucket, compounded over {Math.round(years)} years.</span>
              </div>
            )}
          </section>
          </div>
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
