import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import styles from './OtpVerify.module.css';

const OTP_LENGTH = 6;

export default function OtpVerify({ phone, onVerify, onBack }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const inputsRef = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

  // Auto-focus first input
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = useCallback((index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (error) setError('');

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }, [error]);

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
  }

  function handleSubmit(e) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < OTP_LENGTH) {
      setError('Enter the full 6-digit code');
      return;
    }
    onVerify(code);
  }

  function handleResend() {
    setResendTimer(30);
    setDigits(Array(OTP_LENGTH).fill(''));
    inputsRef.current[0]?.focus();
  }

  const masked = phone ? `+256 ${phone.slice(0, 1)}XX XXX ${phone.slice(6)}` : '';

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

      <h2 className={styles.heading}>Enter verification code</h2>
      <p className={styles.subtext}>Sent to {masked}</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.otpRow} onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              className={styles.otpInput}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              data-error={!!error}
            />
          ))}
        </div>
        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit}>
          Verify
        </button>

        <div className={styles.resend}>
          {resendTimer > 0 ? (
            <span className={styles.resendText}>Resend code in {resendTimer}s</span>
          ) : (
            <button type="button" className={styles.resendBtn} onClick={handleResend}>
              Resend code
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
}
