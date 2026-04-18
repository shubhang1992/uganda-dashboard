import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import styles from './Step.module.css';
import own from './BeneficiariesStep.module.css';

const RELATIONSHIPS = [
  { id: 'spouse',  label: 'Spouse' },
  { id: 'child',   label: 'Child' },
  { id: 'parent',  label: 'Parent' },
  { id: 'sibling', label: 'Sibling' },
  { id: 'other',   label: 'Other' },
];

function newId() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyBeneficiary(seedShare = 0) {
  return {
    id: newId(),
    name: '',
    phone: '',
    relationship: '',
    share: seedShare,
  };
}

function totalShare(list) {
  return list.reduce((sum, b) => sum + (Number(b.share) || 0), 0);
}

function validList(list) {
  if (!list.length) return false;
  const allComplete = list.every(
    (b) => b.name.trim().length >= 3 &&
           b.phone.length === 9 &&
           !!b.relationship &&
           Number.isFinite(b.share) && b.share > 0,
  );
  return allComplete && totalShare(list) === 100;
}

export default function BeneficiariesStep({ onNext }) {
  const signup = useSignup();

  // Lazily seed one empty row for pension if none exists. Memoized so the
  // derived values below (pensionOk, blockerHint) have stable deps.
  const pensionList = useMemo(
    () => (signup.pensionBeneficiaries.length
      ? signup.pensionBeneficiaries
      : [emptyBeneficiary(100)]),
    [signup.pensionBeneficiaries],
  );
  // Lazily seed one empty row for insurance when the user unchecks the box for the first time
  const insuranceList = useMemo(
    () => (signup.insuranceBeneficiaries.length
      ? signup.insuranceBeneficiaries
      : (signup.insuranceChoiceMade && !signup.insuranceSameAsPension
          ? [emptyBeneficiary(100)]
          : [])),
    [signup.insuranceBeneficiaries, signup.insuranceChoiceMade, signup.insuranceSameAsPension],
  );

  /* ── Mutators ────────────────────────────────────────────────────────── */
  function updatePension(next) {
    signup.patch({ pensionBeneficiaries: next });
  }
  function updateInsurance(next) {
    signup.patch({ insuranceBeneficiaries: next });
  }

  function toggleSame(checked) {
    signup.patch({
      insuranceSameAsPension: checked,
      insuranceChoiceMade: true,
      insuranceBeneficiaries: checked ? [] : (insuranceList.length ? insuranceList : [emptyBeneficiary(100)]),
    });
  }

  /* ── Validation ──────────────────────────────────────────────────────── */
  const pensionOk = useMemo(() => validList(pensionList), [pensionList]);
  const insuranceOk =
    signup.insuranceSameAsPension
      ? true
      : validList(insuranceList);
  const choiceSet = signup.insuranceChoiceMade;
  const canContinue = pensionOk && insuranceOk && choiceSet;

  // Surface the first blocking reason in one line so the Continue button has a helpful label.
  let blockerHint = null;
  if (!pensionOk) {
    if (totalShare(pensionList) !== 100) blockerHint = `Pension allocation must total 100% (currently ${totalShare(pensionList)}%)`;
    else blockerHint = 'Fill in all pension beneficiary fields';
  } else if (!choiceSet) {
    blockerHint = 'Choose insurance beneficiaries to continue';
  } else if (!signup.insuranceSameAsPension && !insuranceOk) {
    if (totalShare(insuranceList) !== 100) blockerHint = `Insurance allocation must total 100% (currently ${totalShare(insuranceList)}%)`;
    else blockerHint = 'Fill in all insurance beneficiary fields';
  }

  function handleContinue() {
    // Persist the lazy-seeded lists so state matches what the user saw
    signup.patch({
      pensionBeneficiaries: pensionList,
      insuranceBeneficiaries: signup.insuranceSameAsPension ? [] : insuranceList,
    });
    if (canContinue) onNext();
  }

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 7 · Beneficiaries</span>
      <h2 className={styles.heading}>Who inherits your savings?</h2>
      <p className={styles.subtext}>
        Nominate at least one beneficiary for your pension. The total share across everyone must add up to 100%.
      </p>

      <BeneficiarySection
        title="Pension beneficiaries"
        list={pensionList}
        onChange={updatePension}
      />

      {/* Insurance toggle */}
      <div className={own.insuranceToggle}>
        <label className={own.toggleRow}>
          <input
            type="checkbox"
            className={own.checkbox}
            checked={signup.insuranceSameAsPension}
            onChange={(e) => toggleSame(e.target.checked)}
          />
          <div>
            <span className={own.toggleLabel}>Use the same nominees for my insurance product.</span>
            <span className={own.toggleHint}>
              Uncheck this if you want a different set of beneficiaries for your insurance.
            </span>
          </div>
        </label>
        <AnimatePresence>
          {signup.insuranceChoiceMade && signup.insuranceSameAsPension && (
            <motion.div
              key="same-note"
              className={own.sameNote}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Your insurance product will use the same beneficiaries and percentages as your pension.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Insurance section — expanded when explicitly unchecked */}
      <AnimatePresence initial={false}>
        {signup.insuranceChoiceMade && !signup.insuranceSameAsPension && (
          <motion.div
            key="insurance-section"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          >
            <div className={own.insuranceSectionHead}>
              <span className={own.insuranceEyebrow}>Insurance nominees</span>
              <span className={own.insuranceHint}>
                Stored separately from your pension nominees. Total must also equal 100%.
              </span>
            </div>
            <BeneficiarySection
              list={insuranceList}
              onChange={updateInsurance}
              variant="insurance"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.actions}>
        {!canContinue && blockerHint && (
          <p className={own.blockerHint} role="status">{blockerHint}</p>
        )}
        <button
          type="button"
          className={styles.submit}
          onClick={handleContinue}
          disabled={!canContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ── Reusable beneficiary section ──────────────────────────────────────── */

function BeneficiarySection({ title, list, onChange }) {
  const total = totalShare(list);
  const remaining = 100 - total;

  function updateOne(id, patchObj) {
    onChange(list.map((b) => (b.id === id ? { ...b, ...patchObj } : b)));
  }

  function removeOne(id) {
    onChange(list.filter((b) => b.id !== id));
  }

  function addOne() {
    onChange([...list, emptyBeneficiary(Math.max(0, remaining))]);
  }

  function distributeEvenly() {
    if (!list.length) return;
    const per = Math.floor(100 / list.length);
    const leftover = 100 - per * list.length;
    const next = list.map((b, i) => ({ ...b, share: per + (i === 0 ? leftover : 0) }));
    onChange(next);
  }

  return (
    <div className={own.section}>
      {title && (
        <div className={own.sectionHeader}>
          <span className={own.sectionTitle}>{title}</span>
        </div>
      )}

      <div className={own.list}>
        {list.map((b, i) => (
          <BeneficiaryRow
            key={b.id}
            index={i}
            beneficiary={b}
            canRemove={list.length > 1}
            maxShare={b.share + remaining}
            onChange={(patchObj) => updateOne(b.id, patchObj)}
            onRemove={() => removeOne(b.id)}
          />
        ))}
      </div>

      {/* Allocation summary */}
      <div className={own.allocation} data-state={total === 100 ? 'ok' : total > 100 ? 'over' : 'under'}>
        <div className={own.allocationBar}>
          <motion.span
            className={own.allocationFill}
            animate={{ width: `${Math.min(total, 100)}%` }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          />
          {total > 100 && (
            <span className={own.allocationOver} />
          )}
        </div>
        <div className={own.allocationText}>
          <span className={own.allocationValue}>{total}%</span>
          <span className={own.allocationRemaining}>
            {total === 100 ? 'Allocated' : total > 100 ? `${total - 100}% over` : `${remaining}% remaining`}
          </span>
        </div>
      </div>

      <div className={own.rowActions}>
        <button type="button" className={own.addBtn} onClick={addOne}>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          Add beneficiary
        </button>
        {list.length > 1 && (
          <button type="button" className={own.linkBtn} onClick={distributeEvenly}>
            Split evenly
          </button>
        )}
      </div>
    </div>
  );
}

function BeneficiaryRow({ index, beneficiary, canRemove, maxShare, onChange, onRemove }) {
  return (
    <div className={own.row}>
      <div className={own.rowHeader}>
        <span className={own.rowIndex}>#{index + 1}</span>
        {canRemove && (
          <button type="button" className={own.removeBtn} onClick={onRemove} aria-label={`Remove beneficiary ${index + 1}`}>
            <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${beneficiary.id}-name`}>Full name</label>
        <input
          id={`${beneficiary.id}-name`}
          className={styles.input}
          value={beneficiary.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Their full legal name"
          autoComplete="off"
        />
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${beneficiary.id}-phone`}>Phone</label>
          <div className={styles.phoneGroup}>
            <div className={styles.phonePrefix}>
              <span>&#x1F1FA;&#x1F1EC;</span>
              <span>+256</span>
            </div>
            <input
              id={`${beneficiary.id}-phone`}
              type="tel"
              inputMode="numeric"
              className={styles.phoneInput}
              value={beneficiary.phone}
              onChange={(e) => onChange({ phone: e.target.value.replace(/\D/g, '').slice(0, 9) })}
              placeholder="7XX XXX XXX"
              spellCheck={false}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${beneficiary.id}-rel`}>Relationship</label>
          <select
            id={`${beneficiary.id}-rel`}
            className={styles.select}
            value={beneficiary.relationship}
            onChange={(e) => onChange({ relationship: e.target.value })}
          >
            <option value="">Select</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${beneficiary.id}-share`}>Share</label>
        <div className={own.shareRow}>
          <input
            id={`${beneficiary.id}-share`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className={own.shareInput}
            value={beneficiary.share}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '').slice(0, 3);
              const num = Math.min(100, Math.max(0, Number(raw) || 0));
              onChange({ share: num });
            }}
          />
          <span className={own.sharePct}>%</span>
          <div className={own.shareSlider}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.min(beneficiary.share, maxShare)}
              onChange={(e) => onChange({ share: Math.min(100, Math.max(0, Number(e.target.value))) })}
              aria-label={`Share for beneficiary ${index + 1}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
