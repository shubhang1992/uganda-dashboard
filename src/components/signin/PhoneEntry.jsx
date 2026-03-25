import { useState } from 'react';
import { motion } from 'framer-motion';
import styles from './PhoneEntry.module.css';

const ROLE_LABELS = {
  subscriber: 'Subscriber',
  employer: 'Employer',
  distributor: 'Distributor Admin',
  branch: 'Branch Admin',
  agent: 'Agent',
  admin: 'Admin',
};

export default function PhoneEntry({ role, onSubmit, onBack }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  function handleChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 9);
    setPhone(val);
    if (error) setError('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (phone.length < 9) {
      setError('Enter a valid 9-digit phone number');
      return;
    }
    onSubmit(phone);
  }

  return (
    <div className={styles.wrapper}>
      <button className={styles.back} onClick={onBack} type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      {/* Visual icon */}
      <div className={styles.visual}>
        <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
          <rect x="12" y="4" width="24" height="40" rx="4" stroke="currentColor" strokeWidth="2"/>
          <circle cx="24" cy="38" r="2" fill="currentColor"/>
          <path d="M20 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <span className={styles.badge}>{ROLE_LABELS[role]}</span>

      <h2 className={styles.heading}>Enter your phone number</h2>
      <p className={styles.subtext}>We'll send you a one-time verification code.</p>

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
            placeholder="7XX XXX XXX"
            autoFocus
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit}>
          Continue
        </button>
      </form>
    </div>
  );
}
