import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useCurrentSubscriber, useUpdateProfile } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import PageHeader from '../shell/PageHeader';
import styles from './ProfilePage.module.css';

const UG_PREFIX = '+256';

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { addToast } = useToast();
  const updateProfile = useUpdateProfile(sub?.id);

  const [name, setName] = useState(sub?.name || '');
  const [email, setEmail] = useState(sub?.email || '');
  const [phoneDigits, setPhoneDigits] = useState(
    sub?.phone ? sub.phone.replace(/^\+256/, '').replace(/\D/g, '') : ''
  );
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    name !== (sub?.name || '') ||
    email !== (sub?.email || '') ||
    phoneDigits !== (sub?.phone ? sub.phone.replace(/^\+256/, '').replace(/\D/g, '') : '');

  const validName = name.trim().length >= 2;
  const validPhone = phoneDigits.length >= 9;
  const validEmail = !email || /^\S+@\S+\.\S+$/.test(email);
  const canSave = dirty && validName && validPhone && validEmail;

  async function handleSave() {
    if (!canSave || !sub) return;
    setSubmitting(true);
    try {
      await updateProfile.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        phone: phoneDigits ? `+256${phoneDigits}` : '',
      });
      addToast('success', 'Profile updated.');
      navigate(-1);
    } catch (err) {
      addToast('error', err?.message || 'Could not update profile.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Profile" subtitle="Edit your personal details" />

      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Personal information</h2>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Full name</span>
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <div className={styles.phoneInput}>
                <span className={styles.phonePrefix}>{UG_PREFIX}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  className={`${styles.input} ${styles.phoneFlex}`}
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(digitsOnly(e.target.value).slice(0, 9))}
                  placeholder="7X XXX XXXX"
                  autoComplete="tel-national"
                  maxLength={9}
                />
              </div>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email (optional)</span>
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                spellCheck={false}
                data-error={email && !validEmail ? 'true' : undefined}
              />
              {email && !validEmail && <span className={styles.errorLine}>Looks like that email address isn&apos;t valid.</span>}
            </label>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Identity</h2>
            <ul className={styles.readonlyList}>
              <li>
                <span className={styles.readonlyLabel}>NIN</span>
                <span className={styles.readonlyValue}>{sub?.nin || '—'}</span>
              </li>
              <li>
                <span className={styles.readonlyLabel}>District</span>
                <span className={styles.readonlyValue}>{sub?.district || '—'}</span>
              </li>
              <li>
                <span className={styles.readonlyLabel}>Member ID</span>
                <span className={styles.readonlyValue}>{sub?.id || '—'}</span>
              </li>
            </ul>
            <p className={styles.helperLine}>
              These details came from your KYC. To change them, contact support.
            </p>
          </section>
        </motion.div>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSave || submitting}
          onClick={handleSave}
        >
          {submitting ? 'Saving…' : dirty ? 'Save changes' : 'No changes to save'}
        </button>
      </footer>
    </div>
  );
}
