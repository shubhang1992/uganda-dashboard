import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { isValidUGPhone } from '../../utils/phone';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getInitials } from '../../utils/dashboard';
import PageHeader from '../shell/PageHeader';
import styles from './SettingsPage.module.css';

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
}

function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [errors, setErrors] = useState({});
  const [showPw, setShowPw] = useState(false);

  const hasProfileChanges = user && (
    name !== (user.name || '') ||
    email !== (user.email || '') ||
    phone !== (user.phone || '')
  );
  const hasPasswordEntry = !!(currentPw || newPw || confirmPw);
  const isDirty = hasProfileChanges || hasPasswordEntry;

  const validate = useCallback(() => {
    const e = {};
    if (!name.trim()) e.name = 'Full name is required';
    if (!isValidUGPhone(phone)) e.phone = 'Enter a valid Ugandan mobile number';

    if (hasPasswordEntry) {
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
  }, [name, phone, hasPasswordEntry, currentPw, newPw, confirmPw]);

  async function handleSave(e) {
    e.preventDefault();
    if (!validate()) return;

    try {
      if (hasProfileChanges) {
        // updateUser() is sync today but may become async with a real backend.
        // Promise.resolve makes the try/catch correct in either case.
        await Promise.resolve(
          updateUser({ name: name.trim(), email: email.trim(), phone })
        );
      }
      if (hasPasswordEntry) {
        addToast('info', 'Password change will activate once the backend lands.');
      } else {
        addToast('success', 'Profile updated.');
      }
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      addToast('error', err?.message || 'Could not update profile.');
    }
  }

  function clearFieldError(field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  const strength = getStrength(newPw);

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" subtitle="Manage your profile and security" fallback="/dashboard" />

      <form className={styles.form} onSubmit={handleSave} noValidate>
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
            <span className={styles.profileName}>{name || user?.name || 'Agent'}</span>
            <span className={styles.profilePhone}>+256 {formatPhone(phone || user?.phone)}</span>
            <span className={styles.roleBadge}>Agent</span>
          </div>
        </motion.div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Personal information</h2>
          <label className={styles.field}>
            <span className={styles.label}>Full name</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
              autoComplete="name"
              data-error={errors.name || undefined}
            />
            {errors.name && <span className={styles.errorLine}>{errors.name}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Email <em>optional</em></span>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              spellCheck={false}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Phone</span>
            <div className={styles.phoneField} data-error={errors.phone || undefined}>
              <span className={styles.phonePrefix}>+256</span>
              <input
                type="tel"
                className={styles.phoneInput}
                value={formatPhone(phone)}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); clearFieldError('phone'); }}
                autoComplete="tel"
                inputMode="numeric"
                spellCheck={false}
              />
            </div>
            {errors.phone && <span className={styles.errorLine}>{errors.phone}</span>}
          </label>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Change password</h2>
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Current password</span>
            <input
              type={showPw ? 'text' : 'password'}
              className={styles.input}
              value={currentPw}
              onChange={(e) => { setCurrentPw(e.target.value); clearFieldError('currentPw'); }}
              autoComplete="current-password"
              data-error={errors.currentPw || undefined}
            />
            {errors.currentPw && <span className={styles.errorLine}>{errors.currentPw}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>New password</span>
            <input
              type={showPw ? 'text' : 'password'}
              className={styles.input}
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); clearFieldError('newPw'); }}
              autoComplete="new-password"
              data-error={errors.newPw || undefined}
            />
            {newPw && (
              <div className={styles.strength} data-level={strength} aria-hidden="true">
                <span /><span /><span /><span />
              </div>
            )}
            {errors.newPw && <span className={styles.errorLine}>{errors.newPw}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Confirm new password</span>
            <input
              type={showPw ? 'text' : 'password'}
              className={styles.input}
              value={confirmPw}
              onChange={(e) => { setConfirmPw(e.target.value); clearFieldError('confirmPw'); }}
              autoComplete="new-password"
              data-error={errors.confirmPw || undefined}
            />
            {errors.confirmPw && <span className={styles.errorLine}>{errors.confirmPw}</span>}
          </label>
        </section>

        <footer className={styles.footer}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={!isDirty}
          >
            {hasPasswordEntry && !hasProfileChanges
              ? 'Update password'
              : hasProfileChanges && !hasPasswordEntry
                ? 'Save profile'
                : 'Save changes'}
          </button>
        </footer>
      </form>
    </div>
  );
}
