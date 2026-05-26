import { useState } from 'react';
import { motion } from 'framer-motion';
import { isValidUGPhone } from '../../utils/phone';
import styles from './PhoneEntry.module.css';
import modalStyles from '../SignInModal.module.css';

const ROLE_LABELS = {
  subscriber: 'Subscriber',
  employer: 'Employer',
  distributor: 'Distributor Admin',
  branch: 'Branch Admin',
  agent: 'Agent',
  admin: 'Admin',
};

export default function PhoneEntry({ role, onSubmit, onBack, hideBadge = false, hideVisual = false, method = 'code', onMethodChange }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 9);
    setPhone(val);
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValidUGPhone(phone)) {
      setError('Enter a valid Ugandan mobile number (e.g. 70X XXX XXX)');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(phone);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {onBack && (
        <button className={styles.back} onClick={onBack} type="button">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      )}

      {/* Visual icon */}
      {!hideVisual && (
        <div className={styles.visual}>
          <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" width="48" height="48">
            <rect x="12" y="4" width="24" height="40" rx="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="24" cy="38" r="2" fill="currentColor"/>
            <path d="M20 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      )}

      {!hideBadge && <span className={styles.badge}>{ROLE_LABELS[role]}</span>}

      <h2 className={styles.heading}>Enter your phone number</h2>
      <p className={styles.subtext}>
        {method === 'password'
          ? "We'll sign you in with your password."
          : "We'll send you a one-time verification code."}
      </p>

      {/* Method toggle — visible for all roles. Tapping a chip flips parent
          state; the phone submit handler branches on `method` to either
          dispatch an OTP (sendOtp → goTo('otp')) or jump straight to the
          password step (goTo('password')). */}
      {onMethodChange && (
        <div
          className={modalStyles.methodToggle}
          role="radiogroup"
          aria-label="Sign-in method"
        >
          <button
            type="button"
            role="radio"
            aria-checked={method === 'code'}
            className={modalStyles.methodChip}
            onClick={() => onMethodChange('code')}
          >
            One-time code
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={method === 'password'}
            className={modalStyles.methodChip}
            onClick={() => onMethodChange('password')}
          >
            Password
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputGroup} data-error={!!error}>
          <div className={styles.prefix}>
            <span className={styles.flag}>🇺🇬</span>
            <span className={styles.code}>+256</span>
          </div>
          <input
            type="tel"
            inputMode="numeric"
            className={styles.input}
            value={phone}
            onChange={handleChange}
            placeholder="7XX XXX XXX…"
            autoFocus
            aria-label="Phone number"
            name="phone"
            autoComplete="tel"
            spellCheck={false}
          />
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? (
            <span className={styles.spinnerWrap}>
              <span className={styles.spinner} />
            </span>
          ) : (
            method === 'password' ? 'Continue' : 'Send verification code'
          )}
        </button>
      </form>
    </div>
  );
}
