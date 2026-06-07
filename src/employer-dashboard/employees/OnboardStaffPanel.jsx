// Invite-member panel — the employer's onboarding entry. The employer enters
// the prospective member's identity; the server mints a tokenized invite link
// (flow gated on the company config). The employer copies/shares the link; the
// member opens it and completes the full KYC signup, which creates a real
// subscriber tagged to this employer. No instant create, no own-savings here.

import { useState } from 'react';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer, useCreateInvite } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { companyFundingLabel } from './fundingLabel';
import { parseUGPhoneLocal } from '../../utils/phone';
import styles from './OnboardStaffPanel.module.css';

const PHONE_RE = /^(\+?256)?[0-9]{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { fullName: '', phone: '', email: '', nin: '', gender: 'male' };

export default function OnboardStaffPanel({ splitMode = false }) {
  const { onboardOpen, setOnboardOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { data: employer } = useEmployer(employerId);
  const { addToast } = useToast();
  const createInvite = useCreateInvite(employerId);

  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { link, collectSchedule, name }
  const [copied, setCopied] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (err) setErr('');
  };

  function reset() {
    setForm(EMPTY);
    setErr('');
    setResult(null);
    setCopied(false);
  }
  function close() {
    setOnboardOpen(false);
    setTimeout(reset, 400);
  }

  function validate() {
    if (form.fullName.trim().length < 2) return 'Enter the member’s full name.';
    if (!PHONE_RE.test(form.phone.trim())) return 'Enter a valid Uganda phone (9 digits, optional +256).';
    if (!EMAIL_RE.test(form.email.trim())) return 'Enter the member’s email — the invite link goes there.';
    if (!form.nin.trim()) return 'National ID (NIN) is required.';
    if (!['male', 'female', 'other'].includes(form.gender)) return 'Select a gender.';
    return '';
  }

  async function submit() {
    if (createInvite.isPending) return;
    const e = validate();
    if (e) { setErr(e); return; }
    // Store the phone as 9-digit local so the signup review step prefills cleanly
    // (it renders the +256 prefix; handleConfirm canonicalises on completion).
    const prefill = {
      fullName: form.fullName.trim(),
      phone: parseUGPhoneLocal(form.phone.trim()) || form.phone.trim(),
      email: form.email.trim(),
      nin: form.nin.trim(),
      gender: form.gender,
    };
    try {
      const { token, collectSchedule } = await createInvite.mutateAsync(prefill);
      const link = `${window.location.origin}/invite/${token}`;
      setResult({ link, collectSchedule, name: prefill.fullName });
    } catch (e2) {
      setErr(e2?.message || 'Could not create the invite.');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      addToast('success', 'Invite link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy — select the link and copy manually.');
    }
  }

  return (
    <EmployerSlidePanel
      open={onboardOpen}
      onClose={close}
      title="Invite a member"
      eyebrow="Onboarding"
      width={480}
      splitMode={splitMode}
    >
      {result ? (
        <div className={styles.body}>
          <p className={styles.note}>
            <strong>{result.name}</strong> has been invited and shows as <strong>pending</strong> in
            your roster. Share this link — they’ll complete identity verification (KYC)
            {result.collectSchedule ? ' and set up their own contribution schedule' : ''}, and their
            account activates tagged to your company.
          </p>
          <div className={styles.linkBox}>
            <span className={styles.linkText}>{result.link}</span>
            <button type="button" className={styles.copyBtn} onClick={copyLink}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className={styles.note}>
            No email is sent in this demo — copy the link and share it with the member.
          </p>
          {err && <p className={styles.err} role="alert">{err}</p>}
          <div className={styles.footer}>
            <button type="button" className={styles.ghost} onClick={reset}>Invite another</button>
            <button type="button" className={styles.primary} onClick={close}>Done</button>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <p className={styles.note}>
            <strong>Company funding:</strong> {companyFundingLabel(employer?.defaultContributionConfig)}.
          </p>
          <Field label="Full name">
            <input className={styles.input} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="e.g. Jane Akello" />
          </Field>
          <Field label="Phone">
            <input className={styles.input} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+256700000000" inputMode="tel" />
          </Field>
          <Field label="Email (the invite link is shared here)">
            <input className={styles.input} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" inputMode="email" />
          </Field>
          <Field label="National ID (NIN)">
            <input className={styles.input} value={form.nin} onChange={(e) => set('nin', e.target.value)} placeholder="CMxxxxxxxxxxxx" />
          </Field>
          <Field label="Gender">
            <select className={styles.input} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          {err && <p className={styles.err} role="alert">{err}</p>}
          <div className={styles.footer}>
            <button type="button" className={styles.ghost} onClick={close} disabled={createInvite.isPending}>Cancel</button>
            <button type="button" className={styles.primary} onClick={submit} disabled={createInvite.isPending} aria-busy={createInvite.isPending || undefined}>
              {createInvite.isPending ? 'Creating…' : 'Create invite link'}
            </button>
          </div>
        </div>
      )}
    </EmployerSlidePanel>
  );
}

function Field({ label, children }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}
