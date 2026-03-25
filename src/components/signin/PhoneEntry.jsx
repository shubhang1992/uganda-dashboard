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
    <motion.div
      className={styles.wrapper}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <button className={styles.back} onClick={onBack} type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      <span className={styles.badge}>{ROLE_LABELS[role]}</span>

      <h2 className={styles.heading}>Enter your phone number</h2>
      <p className={styles.subtext}>We'll send you a one-time code to verify.</p>

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
    </motion.div>
  );
}
