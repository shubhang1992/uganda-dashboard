import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { formatUGPhone } from '../../utils/phone';
import styles from './PasswordEntry.module.css';

/**
 * Returning-user password sign-in step. Mirrors `OtpVerify` in file
 * conventions and brand styling — same wrapper/back/visual/heading/form layout,
 * same submit/error/spinner classes ported to a single password input with a
 * show/hide toggle.
 *
 * Props:
 *   - phone:                 9-digit local string (formatted for display)
 *   - role:                  unused but accepted so callers can pass it
 *                            uniformly with other sign-in steps
 *   - onSubmit(password):    parent verifies via `signInWithPassword`
 *   - onSwitchToCode():      parent flips to OTP path (preserves phone)
 *   - onBack():              parent returns to phone-entry
 *   - loading:               external loading flag (parent-controlled)
 *   - error:                 external error string (parent-controlled)
 *   - showSwitchToCodeCta:   when true, render the prominent
 *                            "Use a code instead" CTA panel (set by
 *                            SignInModal when the backend returns
 *                            `password_not_set`)
 */
export default function PasswordEntry({
  phone,
  // eslint-disable-next-line no-unused-vars
  role,
  onSubmit,
  onSwitchToCode,
  onBack,
  loading: loadingProp,
  error: errorProp,
  showSwitchToCodeCta = false,
}) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const inputRef = useRef(null);

  // Parent-driven error takes precedence over the local "please enter a
  // password" message. Resetting password on a fresh parent error would be
  // hostile (e.g. wrong-password retry); leave the field alone.
  const error = errorProp || localError;
  const loading = loadingProp || localLoading;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleChange(e) {
    setPassword(e.target.value);
    if (localError) setLocalError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }
    setLocalLoading(true);
    try {
      await onSubmit(password);
    } finally {
      setLocalLoading(false);
    }
  }

  const masked = phone ? formatUGPhone(phone) : '';

  return (
    <motion.div
      className={styles.wrapper}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <button className={styles.back} onClick={onBack} type="button">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      {/* Visual icon — a padlock to signal "password" */}
      <div className={styles.visual}>
        <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" width="48" height="48">
          <rect x="10" y="22" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2"/>
          <path d="M16 22v-6a8 8 0 0 1 16 0v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="24" cy="32" r="2" fill="currentColor"/>
          <path d="M24 34v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <h2 className={styles.heading}>Welcome back</h2>
      <p className={styles.subtext}>Sign in to <strong>{masked || phone}</strong>.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputGroup} data-error={!!error}>
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            className={styles.input}
            value={password}
            onChange={handleChange}
            placeholder="Your password"
            autoComplete="current-password"
            spellCheck={false}
            aria-label="Password"
            name="password"
            disabled={loading}
          />
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            tabIndex={0}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? (
            <span className={styles.spinnerWrap}>
              <span className={styles.spinner} />
            </span>
          ) : (
            'Sign in'
          )}
        </button>

        {!showSwitchToCodeCta && (
          <button
            type="button"
            className={styles.tertiary}
            onClick={onSwitchToCode}
          >
            Use a one-time code instead
          </button>
        )}
      </form>

      {showSwitchToCodeCta && (
        <div className={styles.switchPanel} role="status">
          <p className={styles.switchPanelText}>
            This account uses one-time codes only. Use a code instead.
          </p>
          <button
            type="button"
            className={styles.switchPanelCta}
            onClick={onSwitchToCode}
          >
            Use a code instead
          </button>
        </div>
      )}
    </motion.div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.2 5.2A8.8 8.8 0 0 1 10 5c5 0 8 5 8 5a14.2 14.2 0 0 1-2.4 2.9M5.7 6.7C3.4 8.3 2 10 2 10s3 5 8 5a8.8 8.8 0 0 0 3.3-.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 8.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
