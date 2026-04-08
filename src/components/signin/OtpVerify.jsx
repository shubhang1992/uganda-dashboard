import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import styles from './OtpVerify.module.css';

const OTP_LENGTH = 6;

export default function OtpVerify({ phone, onVerify, onBack }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const inputsRef = useRef([]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

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

  async function handleSubmit(e) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < OTP_LENGTH) {
      setError('Enter the full 6-digit code');
      return;
    }
    setLoading(true);
    try {
      await onVerify(code);
    } finally {
      setLoading(false);
    }
  }

  function handleResend() {
    setResendTimer(30);
    setDigits(Array(OTP_LENGTH).fill(''));
    inputsRef.current[0]?.focus();
  }

  const masked = phone ? `+256 ${phone.slice(0, 1)}XX XXX ${phone.slice(6)}` : '';

  return (
    <div className={styles.wrapper}>
      <button className={styles.back} onClick={onBack} type="button">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      {/* Visual icon */}
      <div className={styles.visual}>
        <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" width="48" height="48">
          <path d="M24 4L8 12v10c0 11.1 6.84 21.48 16 24 9.16-2.52 16-12.9 16-24V12L24 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M17 24l5 5 9-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <h2 className={styles.heading}>Verification code</h2>
      <p className={styles.subtext}>Enter the 6-digit code sent to <strong>{masked}</strong></p>

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
              data-filled={!!d}
              aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
              spellCheck={false}
              name={`otp-${i}`}
              {...(i === 0 ? { autoComplete: 'one-time-code' } : {})}
            />
          ))}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? (
            <span className={styles.spinnerWrap}>
              <span className={styles.spinner} />
            </span>
          ) : (
            'Verify & sign in'
          )}
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
    </div>
  );
}
