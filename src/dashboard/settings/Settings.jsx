import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { isValidUGPhone } from '../../utils/phone';
import { getInitials } from '../../utils/dashboard';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useToast } from '../../contexts/ToastContext';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { useEntity, useUpdateDistributor } from '../../hooks/useEntity';
import styles from './Settings.module.css';

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
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();
  const isSubscriber = user?.role === 'subscriber';
  const isBranch = user?.role === 'branch';
  const isDistributor = user?.role === 'distributor';
  const { data: branch } = useEntity('branch', isBranch ? user?.branchId : null);
  const distributorId = isDistributor ? (user?.distributorId ?? 'd-001') : null;
  const { data: distributor } = useEntity('distributor', distributorId);
  const updateDistributor = useUpdateDistributor();
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

  const [errors, setErrors] = useState({});

  const identity = useMemo(() => {
    if (isBranch && branch) {
      return {
        name: branch.managerName || branch.name || user?.name || '',
        phone: branch.managerPhone || user?.phone || '',
        email: branch.managerEmail || '',
        title: branch.name || 'Branch admin',
      };
    }
    if (isDistributor) {
      return {
        name: distributor?.managerName || user?.name || '',
        phone: distributor?.managerPhone || user?.phone || '',
        email: distributor?.managerEmail || '',
        title: 'Distributor Admin',
      };
    }
    return {
      name: user?.name || '',
      phone: user?.phone || '',
      email: user?.email || '',
      title: '',
    };
  }, [isBranch, isDistributor, branch, distributor, user?.name, user?.phone, user?.email]);

  useEffect(() => {
    setName(identity.name);
    setEmail(identity.email);
    setPhone(identity.phone);
  }, [identity]);

  /* Reset error state whenever the panel re-opens. */
  const [lastOpenedFor, setLastOpenedFor] = useState(null);
  if (settingsOpen && user && lastOpenedFor !== user) {
    setLastOpenedFor(user);
    setErrors({});
  } else if (!settingsOpen && lastOpenedFor !== null) {
    setLastOpenedFor(null);
  }

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
    if (!isValidUGPhone(phone)) e.phone = 'Enter a valid Ugandan mobile number';

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [name, phone]);

  /* ── Dirty check (enable save only if something changed) ────────────────── */
  const hasProfileChanges =
    name !== identity.name ||
    email !== identity.email ||
    phone !== identity.phone;
  const isDirty = hasProfileChanges;

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  async function handleSave(e) {
    e.preventDefault();
    if (!validate()) return;

    // Profile changes flow through updateUser so the avatar / phone shown in
    // header chips updates immediately. Distributor profile additionally
    // persists to the `distributors` table via the RLS-gated update RPC.
    if (!hasProfileChanges) {
      addToast('success', 'Profile updated.');
      return;
    }
    if (isDistributor && distributorId) {
      try {
        await updateDistributor.mutateAsync({
          id: distributorId,
          updates: { managerName: name.trim(), managerPhone: phone, managerEmail: email.trim() },
        });
      } catch (err) {
        addToast('error', err?.message || 'Could not update profile.');
        return;
      }
    }
    updateUser({ name: name.trim(), email: email.trim(), phone });
    addToast('success', 'Profile updated.');
  }

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function clearFieldError(field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  }

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
                    <span className={styles.avatarInitials}>{getInitials(name || identity.name)}</span>
                  </div>
                  <div className={styles.profileInfo}>
                    <span className={styles.profileName}>{name || identity.name || (isDistributor ? 'Distributor' : 'Branch admin')}</span>
                    <span className={styles.profilePhone}>+256 {formatPhone(phone || identity.phone)}</span>
                    <span className={styles.roleBadge}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="12" height="12">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {identity.title || user?.role || 'Distributor Admin'}
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

                {/* ── Change password (disabled, awaiting auth backend) ──── */}
                <motion.div
                  className={styles.section}
                  aria-labelledby="settings-password-heading"
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
                    <h3 id="settings-password-heading" className={styles.sectionTitle}>Change Password</h3>
                    <span className={styles.comingSoonBadge} aria-hidden="true">Coming soon</span>
                  </div>

                  <p className={styles.comingSoonHelp}>
                    Password updates land alongside the production auth backend.
                    The fields below will activate as soon as it&rsquo;s wired up.
                  </p>

                  <div className={styles.field} aria-disabled="true">
                    <label className={styles.label} htmlFor="settings-current-pw">
                      Current Password
                    </label>
                    <input
                      id="settings-current-pw"
                      className={styles.input}
                      type="password"
                      value=""
                      disabled
                      readOnly
                      aria-readonly="true"
                      autoComplete="off"
                      tabIndex={-1}
                    />
                  </div>

                  <div className={styles.field} aria-disabled="true">
                    <label className={styles.label} htmlFor="settings-new-pw">
                      New Password
                    </label>
                    <input
                      id="settings-new-pw"
                      className={styles.input}
                      type="password"
                      value=""
                      disabled
                      readOnly
                      aria-readonly="true"
                      autoComplete="off"
                      tabIndex={-1}
                    />
                  </div>

                  <div className={styles.field} aria-disabled="true">
                    <label className={styles.label} htmlFor="settings-confirm-pw">
                      Confirm New Password
                    </label>
                    <input
                      id="settings-confirm-pw"
                      className={styles.input}
                      type="password"
                      value=""
                      disabled
                      readOnly
                      aria-readonly="true"
                      autoComplete="off"
                      tabIndex={-1}
                    />
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
