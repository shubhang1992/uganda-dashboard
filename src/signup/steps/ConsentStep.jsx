import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import { LEGAL_TERMS_URL, LEGAL_PRIVACY_URL } from '../../config/env';
import styles from './Step.module.css';
import own from './ConsentStep.module.css';

/**
 * Spec: plain-language summary of
 *   1. what data is collected
 *   2. why it is processed
 *   3. who it may be shared with
 * Then a consent checkbox; on check, log UTC timestamp + phone.
 */

const DATA_COLLECTED = [
  { id: 'name',         label: 'Name' },
  { id: 'nin',          label: 'NIN (National ID number)' },
  { id: 'dob',          label: 'Date of birth' },
  { id: 'phone',        label: 'Phone number' },
  { id: 'biometric',    label: 'Biometric data (ID photo + selfie)' },
  { id: 'beneficiary',  label: 'Beneficiary details' },
];

const PURPOSES = [
  { id: 'admin',      label: 'Pension account administration' },
  { id: 'compliance', label: 'Regulatory compliance' },
];

const RECIPIENTS = [
  { id: 'urbra',    label: 'URBRA (Uganda Retirement Benefits Regulatory Authority)' },
  { id: 'fund',     label: 'The pension fund manager' },
  { id: 'kyc',      label: 'KYC verification providers' },
];

export default function ConsentStep({ onActivate }) {
  const signup = useSignup();
  const [submitting, setSubmitting] = useState(false);

  function handleToggle(checked) {
    signup.patch({
      consent: checked,
      // Log the moment of consent in UTC ISO, with phone as the identifier.
      // The phone acts as the primary account id until backend issues a UUID.
      consentTimestamp: checked ? new Date().toISOString() : null,
    });
  }

  async function handleActivate() {
    if (!signup.consent || !signup.consentTimestamp) return;
    setSubmitting(true);
    await onActivate();
  }

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 8 · Consent</span>
      <h2 className={styles.heading}>Before we activate your account</h2>
      <p className={styles.subtext}>
        Please read this and give your consent. This is required under Uganda’s Data Protection and Privacy Act, 2019.
      </p>

      <div className={own.panel}>
        <span className={own.panelLabel}>What we collected</span>
        <ul className={own.list}>
          {DATA_COLLECTED.map((d) => (
            <li key={d.id} className={own.listItem}>
              <BulletCheck />
              <span>{d.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={own.panel}>
        <span className={own.panelLabel}>Why we process it</span>
        <ul className={own.list}>
          {PURPOSES.map((p) => (
            <li key={p.id} className={own.listItem}>
              <BulletCheck />
              <span>{p.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={own.panel}>
        <span className={own.panelLabel}>Who may receive it</span>
        <ul className={own.list}>
          {RECIPIENTS.map((r) => (
            <li key={r.id} className={own.listItem}>
              <BulletCheck />
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
        <p className={own.footnote}>
          We do not sell your data. You can request access, correction, or deletion at any time — contact our data protection officer at <strong>privacy@universalpensions.com</strong>.
        </p>
      </div>

      <div className={own.consentBox} data-checked={signup.consent || undefined}>
        <label className={own.consentRow}>
          <input
            type="checkbox"
            className={own.checkbox}
            checked={signup.consent}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span className={own.consentText}>
            I consent to Universal Pensions processing my personal data for the purposes above, and sharing it with the recipients listed, under Uganda’s <strong>Data Protection and Privacy Act, 2019</strong>. I have read the{' '}
            <a
              href={LEGAL_TERMS_URL}
              target="_blank"
              rel="noreferrer noopener"
              className={own.policyLink}
              onClick={(e) => e.stopPropagation()}
            >
              Terms of Service
            </a>
            {' '}and{' '}
            <a
              href={LEGAL_PRIVACY_URL}
              target="_blank"
              rel="noreferrer noopener"
              className={own.policyLink}
              onClick={(e) => e.stopPropagation()}
            >
              Privacy Policy
            </a>.
          </span>
        </label>

        <AnimatePresence>
          {signup.consent && signup.consentTimestamp && (
            <motion.div
              key="ts"
              className={own.timestamp}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>
                Consent logged {formatLogged(signup.consentTimestamp)} · ID: <strong>{signup.phone ? `+256 ${signup.phone}` : 'pending'}</strong>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.submit}
          onClick={handleActivate}
          disabled={!signup.consent || submitting}
          data-loading={submitting || undefined}
        >
          {submitting ? (
            <>
              <span className={own.btnSpinner} aria-hidden="true" />
              Activating…
            </>
          ) : (
            'Activate my account'
          )}
        </button>
      </div>
    </div>
  );
}

function BulletCheck() {
  return (
    <span className={own.bullet} aria-hidden="true">
      <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
        <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

function formatLogged(iso) {
  try {
    const d = new Date(iso);
    return `${d.toUTCString().replace(' GMT', ' UTC')}`;
  } catch {
    return iso;
  }
}
