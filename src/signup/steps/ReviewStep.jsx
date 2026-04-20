import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAllEntities } from '../../hooks/useEntity';
import { useSignup } from '../SignupContext';
import { extractIdFields } from '../../services/kyc';
import styles from './Step.module.css';
import own from './ReviewStep.module.css';

const NIN_RE = /^C[MF][A-Z0-9]{12}$/;

const GENDERS = [
  { id: 'male',   label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other',  label: 'Other' },
];

const OCCUPATIONS = [
  { id: 'farmer',         label: 'Farmer' },
  { id: 'trader',         label: 'Trader / shopkeeper' },
  { id: 'boda-boda',      label: 'Boda-boda rider' },
  { id: 'artisan',        label: 'Artisan / craftsperson' },
  { id: 'market-vendor',  label: 'Market vendor' },
  { id: 'other',          label: 'Other' },
];

export default function ReviewStep({ onNext }) {
  const signup = useSignup();
  const { data: districts = [] } = useAllEntities('district');

  const [ocrState, setOcrState] = useState(
    signup.fullName ? 'done' : 'running'
  );
  const [ocrError, setOcrError] = useState('');

  /* Run OCR silently on mount (only if fields aren't already filled) */
  useEffect(() => {
    if (signup.fullName) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await extractIdFields({
          front: signup.idFrontFile,
          back: signup.idBackFile,
        });
        if (cancelled) return;
        signup.patch({
          fullName: result.fullName,
          nin: result.nin,
          cardNumber: result.cardNumber,
          dob: result.dob,
          districtId: result.districtId,
          gender: result.gender,
          barcodeRaw: result.barcodeRaw,
          idConfidence: result.confidence,
        });
        setInitialValues((prev) => ({ ...prev, ...result }));
        setOcrState('done');
      } catch (e) {
        if (cancelled) return;
        setOcrError(e?.message || 'We couldn’t read your card. Please try again.');
        setOcrState('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Snapshot of OCR-derived values — used to decide which fields still show "Auto-filled" */
  const [initialValues, setInitialValues] = useState(() => ({
    fullName: signup.fullName,
    nin: signup.nin,
    cardNumber: signup.cardNumber,
    dob: signup.dob,
    districtId: signup.districtId,
    gender: signup.gender,
  }));
  const [edited, setEdited] = useState(() => new Set());
  const [districtQuery, setDistrictQuery] = useState('');
  const [districtOpen, setDistrictOpen] = useState(false);
  const [errors, setErrors] = useState({});

  const districtMap = useMemo(
    () => new Map(districts.map((d) => [d.id, d])),
    [districts]
  );
  const selectedDistrict = signup.districtId ? districtMap.get(signup.districtId) : null;

  const filteredDistricts = useMemo(() => {
    if (!districtQuery.trim()) return districts.slice(0, 12);
    const q = districtQuery.toLowerCase();
    return districts.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 20);
  }, [districts, districtQuery]);

  function markEdited(field) {
    setEdited((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }

  function isAutoFilled(field) {
    return !edited.has(field) && !!initialValues[field];
  }

  function handlePhone(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 9);
    signup.patch({ phone: val });
    if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
  }

  function validate() {
    const e = {};
    const name = signup.fullName.trim();
    const nin = signup.nin.trim().toUpperCase();
    const card = signup.cardNumber.trim().toUpperCase();

    if (!name || name.length < 3) e.fullName = 'Enter your full name';
    if (!NIN_RE.test(nin)) e.nin = 'NIN must be 14 characters — CM or CF followed by 12 letters/numbers';
    if (!card || card.length < 7) e.cardNumber = 'Enter the card number';
    if (!signup.dob) e.dob = 'Enter your date of birth';
    else {
      const age = (Date.now() - new Date(signup.dob).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) e.dob = 'You must be 18 or older to register';
      if (age > 100) e.dob = 'Please check your date of birth';
    }
    if (!signup.districtId) e.districtId = 'Select your district';
    if (!signup.gender) e.gender = 'Select your gender';
    if (signup.phone.length < 9) e.phone = 'Enter a valid 9-digit phone number';
    if (!signup.occupation) e.occupation = 'Select your occupation';
    // Email is optional — only validate if the user typed something.
    if (signup.email.trim()) {
      const email = signup.email.trim();
      // Pragmatic email check — rejects obvious garbage without fighting edge cases.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        e.email = 'Enter a valid email or leave this blank';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    signup.patch({
      fullName: signup.fullName.trim(),
      nin: signup.nin.trim().toUpperCase(),
      cardNumber: signup.cardNumber.trim().toUpperCase(),
      // Clear previous NIRA verdict so the next step re-runs with edited data
      niraResult: null,
      niraMismatchedFields: [],
    });
    if (!validate()) return;
    onNext();
  }

  /* ── Loading state while OCR is running ─────────────────────────────── */
  if (ocrState === 'running') {
    return (
      <div className={styles.card}>
        <span className={styles.eyebrow}>Step 2 · Review</span>
        <h2 className={styles.heading}>Reading your card</h2>
        <p className={styles.subtext}>
          We’re pulling your details from the photos you uploaded. This takes a few seconds.
        </p>
        <div className={own.ocrLoading}>
          <span className={own.ocrSpinner} aria-hidden="true" />
          <span>Extracting details…</span>
        </div>
      </div>
    );
  }

  /* ── OCR error state ────────────────────────────────────────────────── */
  if (ocrState === 'error') {
    return (
      <div className={styles.card}>
        <span className={styles.eyebrow}>Step 2 · Review</span>
        <h2 className={styles.heading}>We couldn’t read your card</h2>
        <p className={styles.subtext}>{ocrError}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.submit}
            onClick={() => {
              setOcrState('running');
              setOcrError('');
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  /* ── Review form ────────────────────────────────────────────────────── */
  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 2 · Review</span>
      <h2 className={styles.heading}>Check your details</h2>
      <p className={styles.subtext}>
        We read these from your ID. Fix anything we got wrong. Fill in your phone number and occupation below.
      </p>

      {/* Thumbnails */}
      <div className={own.thumbs}>
        {signup.idFrontPreviewUrl && (
          <div className={own.thumb}>
            <img src={signup.idFrontPreviewUrl} alt="ID front" width="120" height="76" />
            <span className={own.thumbLabel}>Front</span>
          </div>
        )}
        {signup.idBackPreviewUrl && (
          <div className={own.thumb}>
            <img src={signup.idBackPreviewUrl} alt="ID back" width="120" height="76" />
            <span className={own.thumbLabel}>Back</span>
          </div>
        )}
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <ReviewField id="full-name" label="Full name" autoFilled={isAutoFilled('fullName')} error={errors.fullName}>
          <input
            id="full-name"
            className={styles.input}
            value={signup.fullName}
            onChange={(e) => { signup.patch({ fullName: e.target.value }); markEdited('fullName'); }}
            autoComplete="name"
            data-error={!!errors.fullName}
          />
        </ReviewField>

        <ReviewField id="nin" label="NIN" hint="14 characters — on your ID" autoFilled={isAutoFilled('nin')} error={errors.nin}>
          <input
            id="nin"
            className={styles.input}
            value={signup.nin}
            onChange={(e) => { signup.patch({ nin: e.target.value.toUpperCase().slice(0, 14) }); markEdited('nin'); }}
            maxLength={14}
            autoComplete="off"
            spellCheck={false}
            style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}
            data-error={!!errors.nin}
          />
        </ReviewField>

        <div className={styles.fieldRow}>
          <ReviewField id="card-number" label="Card number" autoFilled={isAutoFilled('cardNumber')} error={errors.cardNumber}>
            <input
              id="card-number"
              className={styles.input}
              value={signup.cardNumber}
              onChange={(e) => { signup.patch({ cardNumber: e.target.value.toUpperCase().slice(0, 12) }); markEdited('cardNumber'); }}
              autoComplete="off"
              spellCheck={false}
              style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}
              data-error={!!errors.cardNumber}
            />
          </ReviewField>

          <ReviewField id="dob" label="Date of birth" autoFilled={isAutoFilled('dob')} error={errors.dob}>
            <input
              id="dob"
              type="date"
              className={styles.input}
              value={signup.dob}
              onChange={(e) => { signup.patch({ dob: e.target.value }); markEdited('dob'); }}
              data-error={!!errors.dob}
            />
          </ReviewField>
        </div>

        <ReviewField id="district" label="District" autoFilled={isAutoFilled('districtId')} error={errors.districtId}>
          <div className={own.comboWrap}>
            <input
              id="district"
              role="combobox"
              className={styles.input}
              value={districtOpen ? districtQuery : (selectedDistrict?.name || '')}
              onChange={(e) => { setDistrictQuery(e.target.value); setDistrictOpen(true); markEdited('districtId'); }}
              onFocus={() => { setDistrictQuery(''); setDistrictOpen(true); }}
              onBlur={() => setTimeout(() => setDistrictOpen(false), 150)}
              placeholder="Search your district…"
              autoComplete="off"
              aria-expanded={districtOpen}
              aria-autocomplete="list"
              aria-controls="district-listbox"
              data-error={!!errors.districtId}
            />
            {districtOpen && filteredDistricts.length > 0 && (
              <ul id="district-listbox" className={own.comboList} role="listbox">
                {filteredDistricts.map((d) => (
                  <li key={d.id} role="option" aria-selected={signup.districtId === d.id}>
                    <button
                      type="button"
                      className={own.comboItem}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        signup.patch({ districtId: d.id });
                        markEdited('districtId');
                        setDistrictQuery('');
                        setDistrictOpen(false);
                      }}
                    >
                      {d.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {districtOpen && filteredDistricts.length === 0 && districtQuery.trim() && (
              <div className={own.comboEmpty} role="status">
                No districts match “{districtQuery.trim()}”. Check the spelling and try again.
              </div>
            )}
          </div>
        </ReviewField>

        <ReviewField id="gender" label="Gender" autoFilled={isAutoFilled('gender')} error={errors.gender}>
          <div className={styles.segment} style={{ '--cols': 3 }} role="radiogroup" aria-labelledby="gender-label">
            {GENDERS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={signup.gender === g.id}
                data-active={signup.gender === g.id}
                className={styles.segmentBtn}
                onClick={() => { signup.patch({ gender: g.id }); markEdited('gender'); }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </ReviewField>

        {/* Divider between OCR and manual fields */}
        <div className={own.manualHeader}>
          <span className={own.manualEyebrow}>Not on your ID</span>
          <span className={own.manualHint}>We need a couple more details from you.</span>
        </div>

        <ReviewField id="phone" label="Phone number" hint="used for your mobile-money wallet" error={errors.phone}>
          <div className={styles.phoneGroup} data-error={!!errors.phone}>
            <div className={styles.phonePrefix}>
              <span>&#x1F1FA;&#x1F1EC;</span>
              <span>+256</span>
            </div>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              className={styles.phoneInput}
              value={signup.phone}
              onChange={handlePhone}
              placeholder="7XX XXX XXX"
              name="phone"
              autoComplete="tel"
              spellCheck={false}
            />
          </div>
        </ReviewField>

        <ReviewField id="occupation" label="Occupation" error={errors.occupation}>
          <select
            id="occupation"
            className={styles.select}
            value={signup.occupation}
            onChange={(e) => signup.patch({ occupation: e.target.value })}
            data-error={!!errors.occupation}
          >
            <option value="">Select your occupation</option>
            {OCCUPATIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </ReviewField>

        <ReviewField
          id="email"
          label="Email"
          labelHint="optional"
          hint="we'll send statements here if you add one"
          error={errors.email}
        >
          <input
            id="email"
            type="email"
            inputMode="email"
            className={styles.input}
            value={signup.email}
            onChange={(e) => {
              signup.patch({ email: e.target.value });
              if (errors.email) setErrors((p) => ({ ...p, email: '' }));
            }}
            placeholder="you@example.com"
            autoComplete="email"
            spellCheck={false}
            data-error={!!errors.email}
          />
        </ReviewField>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>Continue</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Field wrapper that shows label + optional "Auto-filled" chip that disappears on edit.
 */
function ReviewField({ id, label, hint, labelHint, optional, autoFilled, error, children }) {
  return (
    <div className={styles.field}>
      <div className={own.labelRow}>
        <label className={styles.label} htmlFor={id} id={`${id}-label`}>
          {label}
          {labelHint && <span className={own.optionalChip}>{labelHint}</span>}
          {hint && <span className={styles.labelHint}>{hint}</span>}
          {!optional && !labelHint && <span className={styles.required}> *</span>}
        </label>
        <AnimatePresence>
          {autoFilled && (
            <motion.span
              className={own.autoFilled}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
              title="Read from your ID — edit if wrong"
            >
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                <path d="M3 6l2 2 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Auto-filled
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {children}
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  );
}
