import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { getInitials } from '../../utils/dashboard';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useToast } from '../../contexts/ToastContext';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import styles from './Settings.module.css';

/* ─── Password strength helper ────────────────────────────────────────────── */
function getStrength(pw) {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const levels = ['', 'weak', 'fair', 'good', 'strong'];
  return { score, label: labels[score], level: levels[score] };
}

/* ─── Password field with show/hide toggle ────────────────────────────────── */
function PasswordInput({ value, onChange, placeholder, error, ariaLabel }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <input
        className={styles.input}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-error={!!error}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14.12 14.12a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
          </svg>
        )}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Settings panel                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Settings({ splitMode = false }) {
  const {
    settingsOpen,
    setSettingsOpen,
    setNomineesOpen,
    setNomineesTab,
  } = useDashboard();
  const { user } = useAuth();
  const { addToast } = useToast();
  const isSubscriber = user?.role === 'subscriber';
  const { data: subscriber } = useCurrentSubscriber();
  const pensionCount = subscriber?.nominees?.pension?.length ?? 0;
  const insuranceCount = subscriber?.nominees?.insurance?.length ?? 0;

  function openNominees(tab) {
    setSettingsOpen(false);
    if (setNomineesTab) setNomineesTab(tab);
    if (setNomineesOpen) setNomineesOpen(true);
  }

  /* ── Profile form state ─────────────────────────────────────────────────── */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  /* ── Password form state ────────────────────────────────────────────────── */
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [errors, setErrors] = useState({});

  /* Populate form from user session when panel opens */
  useEffect(() => {
    if (settingsOpen && user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setErrors({});
    }
  }, [settingsOpen, user]);

  /* Escape key to close */
  useEffect(() => {
    if (!settingsOpen) return;
    function handleEsc(e) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [settingsOpen, setSettingsOpen]);

  /* ── Validation ─────────────────────────────────────────────────────────── */
  const validate = useCallback(() => {
    const e = {};
    if (!name.trim()) e.name = 'Full name is required';
    if (phone.replace(/\D/g, '').length < 9) e.phone = 'Enter a valid phone number';

    /* Password fields — only validate if any are filled */
    const hasPassword = currentPw || newPw || confirmPw;
    if (hasPassword) {
      if (!currentPw) e.currentPw = 'Enter your current password';
      if (!newPw) {
        e.newPw = 'Enter a new password';
      } else if (newPw.length < 8) {
        e.newPw = 'Minimum 8 characters';
      }
      if (!confirmPw) {
        e.confirmPw = 'Confirm your new password';
      } else if (newPw !== confirmPw) {
        e.confirmPw = 'Passwords do not match';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [name, phone, currentPw, newPw, confirmPw]);

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  function handleSave(e) {
    e.preventDefault();
    if (!validate()) return;

    /* In production this would call an API — for now show success toast */
    addToast('success', 'Settings saved');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
  }

  /* ── Dirty check (enable save only if something changed) ────────────────── */
  const hasProfileChanges = user && (
    name !== (user.name || '') ||
    email !== (user.email || '') ||
    phone !== (user.phone || '')
  );
  const hasPasswordEntry = !!(currentPw || newPw || confirmPw);
  const isDirty = hasProfileChanges || hasPasswordEntry;

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function clearFieldError(field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  }


  const strength = getStrength(newPw);

  function formatPhone(raw) {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          {/* Backdrop — hidden in split mode */}
          {!splitMode && (
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setSettingsOpen(false)}
            />
          )}

          {/* Panel */}
          <motion.div
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{
              x: 0,
              opacity: 1,
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
            exit={{
              x: '100%',
              opacity: 0.6,
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <form className={styles.form} onSubmit={handleSave} noValidate>
              {/* Header */}
              <div className={styles.header}>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  </svg>
                </button>
                <h2 className={styles.title}>Settings</h2>
                <p className={styles.subtitle}>Manage your profile and security</p>
              </div>

              {/* Scrollable body */}
              <div className={styles.body}>
                {/* ── Profile card ──────────────────────────────────────── */}
                <motion.div
                  className={styles.profileCard}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                >
                  <div className={styles.avatar}>
                    <span className={styles.avatarInitials}>{getInitials(name || user?.name)}</span>
                  </div>
                  <div className={styles.profileInfo}>
                    <span className={styles.profileName}>{name || user?.name || 'Distributor Admin'}</span>
                    <span className={styles.profilePhone}>+256 {formatPhone(phone || user?.phone)}</span>
                    <span className={styles.roleBadge}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="12" height="12">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {user?.role || 'Distributor Admin'}
                    </span>
                  </div>
                </motion.div>

                {/* ── Personal information ──────────────────────────────── */}
                <motion.div
                  className={styles.section}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.06, ease: EASE_OUT_EXPO }}
                >
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
                        <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <h3 className={styles.sectionTitle}>Personal Information</h3>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="settings-name">
                      Full Name <span className={styles.req}>*</span>
                    </label>
                    <input
                      id="settings-name"
                      className={styles.input}
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                      placeholder="Enter your full name"
                      data-error={!!errors.name}
                      autoComplete="name"
                    />
                    {errors.name && <p className={styles.error} role="alert">{errors.name}</p>}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="settings-email">
                      Email Address
                    </label>
                    <input
                      id="settings-email"
                      className={styles.input}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="settings-phone">
                      Phone Number <span className={styles.req}>*</span>
                    </label>
                    <div className={styles.phoneGroup}>
                      <div className={styles.phonePrefix}>
                        <span className={styles.flag} aria-hidden="true">🇺🇬</span>
                        <span className={styles.phoneCode}>+256</span>
                      </div>
                      <input
                        id="settings-phone"
                        className={styles.phoneInput}
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                          setPhone(val);
                          clearFieldError('phone');
                        }}
                        placeholder="7XX XXX XXX"
                        autoComplete="tel"
                        spellCheck={false}
                      />
                    </div>
                    {errors.phone && <p className={styles.error} role="alert">{errors.phone}</p>}
                  </div>
                </motion.div>

                <div className={styles.sectionDivider} />

                {/* ── Change password ───────────────────────────────────── */}
                <motion.div
                  className={styles.section}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.12, ease: EASE_OUT_EXPO }}
                >
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionIcon}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
                        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                        <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        <circle cx="12" cy="16.5" r="1.5" fill="currentColor"/>
                      </svg>
                    </span>
                    <h3 className={styles.sectionTitle}>Change Password</h3>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="settings-current-pw">
                      Current Password
                    </label>
                    <PasswordInput
                      value={currentPw}
                      onChange={(e) => { setCurrentPw(e.target.value); clearFieldError('currentPw'); }}
                      placeholder="Enter current password"
                      error={errors.currentPw}
                      ariaLabel="Current password"
                    />
                    {errors.currentPw && <p className={styles.error} role="alert">{errors.currentPw}</p>}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="settings-new-pw">
                      New Password
                    </label>
                    <PasswordInput
                      value={newPw}
                      onChange={(e) => { setNewPw(e.target.value); clearFieldError('newPw'); }}
                      placeholder="Minimum 8 characters"
                      error={errors.newPw}
                      ariaLabel="New password"
                    />
                    {newPw && (
                      <>
                        <div className={styles.strengthBar}>
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className={styles.strengthSegment}
                              data-active={i <= strength.score}
                              data-level={strength.level}
                            />
                          ))}
                        </div>
                        <span className={styles.strengthLabel}>{strength.label}</span>
                      </>
                    )}
                    {errors.newPw && <p className={styles.error} role="alert">{errors.newPw}</p>}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="settings-confirm-pw">
                      Confirm New Password
                    </label>
                    <PasswordInput
                      value={confirmPw}
                      onChange={(e) => { setConfirmPw(e.target.value); clearFieldError('confirmPw'); }}
                      placeholder="Re-enter new password"
                      error={errors.confirmPw}
                      ariaLabel="Confirm new password"
                    />
                    {errors.confirmPw && <p className={styles.error} role="alert">{errors.confirmPw}</p>}
                  </div>
                </motion.div>

                {/* ── Nominees & beneficiaries (subscriber only) ────────── */}
                {isSubscriber && (
                  <>
                    <div className={styles.sectionDivider} />
                    <motion.div
                      className={styles.section}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.18, ease: EASE_OUT_EXPO }}
                    >
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionIcon}>
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
                            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75"/>
                            <path d="M3 20v-1a5 5 0 0110 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                            <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
                            <path d="M21 20v-1a3.5 3.5 0 00-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          </svg>
                        </span>
                        <h3 className={styles.sectionTitle}>Nominees & Beneficiaries</h3>
                      </div>

                      <p className={styles.nomineesHelp}>
                        Nominees receive your savings or insurance benefit. Shares must total 100%.
                      </p>

                      <div className={styles.nomineesGrid}>
                        <button
                          type="button"
                          className={styles.nomineeTile}
                          onClick={() => openNominees('pension')}
                        >
                          <span className={styles.nomineeTileHead}>
                            <span className={styles.nomineeTileLabel}>Pension nominees</span>
                            <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className={styles.nomineeTileArrow}>
                              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                          </span>
                          <span className={styles.nomineeTileCount}>
                            {pensionCount} on file
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.nomineeTile}
                          onClick={() => openNominees('insurance')}
                        >
                          <span className={styles.nomineeTileHead}>
                            <span className={styles.nomineeTileLabel}>Insurance nominees</span>
                            <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className={styles.nomineeTileArrow}>
                              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                          </span>
                          <span className={styles.nomineeTileCount}>
                            {insuranceCount} on file
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setSettingsOpen(false)}
                >
                  Cancel
                </button>
                <span className={styles.footerSpacer} />
                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={!isDirty}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>

        </>
      )}
    </AnimatePresence>
  );
}
