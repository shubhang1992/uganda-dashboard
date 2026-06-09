// Onboard-members panel — two ways to onboard staff:
//   • Single: enter one member's identity → the server mints a tokenized invite
//     link the employer shares; the member completes KYC, which creates a real
//     subscriber tagged to this employer.
//   • Bulk: download an Excel template, fill one row per member, upload it,
//     review the parsed rows, and create invites for every valid row at once.
// Identity is name + phone + email only — gender / National ID are collected
// from the member during their own KYC signup, not entered by the employer.

import { useRef, useState } from 'react';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer, useCreateInvite, useBulkCreateInvites } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { downloadSheet, parseSheet } from '../../utils/xlsx';
import { parseUGPhoneLocal } from '../../utils/phone';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { companyFundingLabel } from './fundingLabel';
import styles from './OnboardStaffPanel.module.css';

const PHONE_RE = /^(\+?256)?[0-9]{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { fullName: '', phone: '', email: '' };

const TEMPLATE_COLUMNS = [
  { key: 'fullName', label: 'Full name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];
const TEMPLATE_EXAMPLES = [
  { fullName: 'Jane Akello', phone: '+256700000001', email: 'jane.akello@example.com' },
  { fullName: 'John Okello', phone: '+256700000002', email: 'john.okello@example.com' },
];

const DownloadIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
    <path d="M10 3v9M10 12l-3-3M10 12l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 14v2h14v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const UploadIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
    <path d="M10 16V7M10 7L7 10M10 7l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 5V4h14v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Case-insensitive header lookup — tolerates "Full name" / "name" / "Email…". */
function pick(row, ...names) {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((key) => key.trim().toLowerCase() === n);
    if (k != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

function rowError(fullName, phone, email) {
  if (fullName.length < 2) return 'Name missing';
  if (!PHONE_RE.test(phone)) return 'Invalid phone';
  if (!EMAIL_RE.test(email)) return 'Invalid email';
  return '';
}

function toPrefill({ fullName, phone, email }) {
  return {
    fullName: fullName.trim(),
    phone: parseUGPhoneLocal(phone.trim()) || phone.trim(),
    email: email.trim(),
  };
}

export default function OnboardStaffPanel({ splitMode = false }) {
  const { onboardOpen, setOnboardOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { data: employer } = useEmployer(employerId);
  const { addToast } = useToast();
  const createInvite = useCreateInvite(employerId);
  const bulkCreate = useBulkCreateInvites(employerId);
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const [err, setErr] = useState('');

  // Single
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null); // { link, collectSchedule, name }
  const [copied, setCopied] = useState(false);

  // Bulk
  const [parsed, setParsed] = useState(null); // { fileName, rows: [{ fullName, phone, email, valid, error }] }
  const [bulkResult, setBulkResult] = useState(null); // { created, failed, total }

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (err) setErr('');
  };

  function reset() {
    setMode('single');
    setForm(EMPTY);
    setErr('');
    setResult(null);
    setCopied(false);
    setParsed(null);
    setBulkResult(null);
  }
  function close() {
    setOnboardOpen(false);
    setTimeout(reset, 400);
  }
  function switchMode(next) {
    setMode(next);
    setErr('');
  }

  // ── Single ────────────────────────────────────────────────────────────────
  function validate() {
    if (form.fullName.trim().length < 2) return 'Enter the member’s full name.';
    if (!PHONE_RE.test(form.phone.trim())) return 'Enter a valid Uganda phone (9 digits, optional +256).';
    if (!EMAIL_RE.test(form.email.trim())) return 'Enter the member’s email — the invite link goes there.';
    return '';
  }

  async function submit() {
    if (createInvite.isPending) return;
    const e = validate();
    if (e) { setErr(e); return; }
    try {
      const { token, collectSchedule } = await createInvite.mutateAsync(toPrefill(form));
      const link = `${window.location.origin}/invite/${token}`;
      setResult({ link, collectSchedule, name: form.fullName.trim() });
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

  // ── Bulk ──────────────────────────────────────────────────────────────────
  async function downloadTemplate() {
    // Seed the row the employer has already typed into the single-member form so
    // the downloaded template carries that in-progress member (not just the two
    // fictional examples). Falls back to the examples when nothing's entered.
    const typed = form.fullName.trim() || form.phone.trim() || form.email.trim();
    const seedRows = typed
      ? [{ fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() }]
      : TEMPLATE_EXAMPLES;
    try {
      await downloadSheet({
        rows: seedRows,
        columns: TEMPLATE_COLUMNS,
        filename: 'employee-onboarding-template',
        sheetName: 'Employees',
      });
      addToast('success', 'Template downloaded — fill one row per member, then upload it.');
    } catch (e2) {
      addToast('error', e2?.message || 'Could not download the template.');
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;
    setErr('');
    const { rows, errors } = await parseSheet(file);
    if (errors.length > 0) {
      setErr(errors[0] || 'Could not read the file — use the downloaded template.');
      return;
    }
    const mapped = rows.map((r) => {
      const fullName = pick(r, 'full name', 'name', 'fullname');
      const phone = pick(r, 'phone', 'phone number', 'mobile');
      const email = pick(r, 'email', 'email address', 'e-mail');
      const error = rowError(fullName, phone, email);
      return { fullName, phone, email, valid: !error, error };
    });
    if (mapped.length === 0) {
      setErr('That file had no rows. Use the template’s columns: Full name, Phone, Email.');
      return;
    }
    setParsed({ fileName: file.name, rows: mapped });
  }

  async function onboardBulk() {
    if (bulkCreate.isPending || !parsed) return;
    const valid = parsed.rows.filter((r) => r.valid).map(toPrefill);
    if (valid.length === 0) { setErr('No valid rows to onboard. Fix the flagged rows and re-upload.'); return; }
    try {
      const res = await bulkCreate.mutateAsync(valid);
      setBulkResult(res);
      addToast('success', `${res.created} member${res.created === 1 ? '' : 's'} invited.`);
    } catch (e2) {
      setErr(e2?.message || 'Could not onboard the uploaded members.');
    }
  }

  const validCount = parsed ? parsed.rows.filter((r) => r.valid).length : 0;
  const invalidCount = parsed ? parsed.rows.length - validCount : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  const panelTitle = 'Onboard members';
  let body;

  if (result) {
    // Single invite created.
    body = (
      <div className={styles.body}>
        <p className={styles.note}>
          <strong>{result.name}</strong> has been invited and shows as <strong>pending</strong> in
          your roster. Share this link — they’ll complete identity verification (KYC)
          {result.collectSchedule ? ' and set up their own contribution schedule' : ''}, and their
          account activates tagged to your company.
        </p>
        <div className={styles.linkBox}>
          <span className={styles.linkText}>{result.link}</span>
          <button type="button" className={styles.copyBtn} onClick={copyLink}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className={styles.note}>No email is sent in this demo — copy the link and share it with the member.</p>
        {err && <p className={styles.err} role="alert">{err}</p>}
        <div className={styles.footer}>
          <button type="button" className={styles.ghost} onClick={reset}>Invite another</button>
          <button type="button" className={styles.primary} onClick={close}>Done</button>
        </div>
      </div>
    );
  } else if (bulkResult) {
    // Bulk onboarding summary.
    body = (
      <div className={styles.body}>
        <p className={styles.note}>
          <strong>{bulkResult.created}</strong> member{bulkResult.created === 1 ? '' : 's'} invited — they show as
          <strong> pending</strong> in your roster until they complete KYC.
          {bulkResult.failed > 0 ? ` ${bulkResult.failed} row${bulkResult.failed === 1 ? '' : 's'} could not be created.` : ''}
        </p>
        <p className={styles.note}>No emails are sent in this demo. Pending members appear in the roster.</p>
        <div className={styles.footer}>
          <button type="button" className={styles.ghost} onClick={reset}>Onboard more</button>
          <button type="button" className={styles.primary} onClick={close}>Done</button>
        </div>
      </div>
    );
  } else if (parsed) {
    // Bulk review.
    body = (
      <div className={styles.body}>
        <p className={styles.note}>
          Reviewing <strong>{parsed.fileName}</strong> — {validCount} ready
          {invalidCount > 0 ? `, ${invalidCount} need attention (only valid rows are onboarded)` : ''}.
        </p>
        <div className={styles.reviewWrap}>
          <table className={styles.reviewTable}>
            <thead>
              <tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Status</th></tr>
            </thead>
            <tbody>
              {parsed.rows.map((r, i) => (
                <tr key={i} data-invalid={!r.valid || undefined}>
                  <td className={styles.reviewNum}>{i + 1}</td>
                  <td>{r.fullName || '—'}</td>
                  <td>{r.phone || '—'}</td>
                  <td className={styles.reviewEmail}>{r.email || '—'}</td>
                  <td>
                    {r.valid
                      ? <span className={styles.ok}>Ready</span>
                      : <span className={styles.bad}>{r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err && <p className={styles.err} role="alert">{err}</p>}
        <div className={styles.footer}>
          <button type="button" className={styles.ghost} onClick={() => { setParsed(null); setErr(''); }} disabled={bulkCreate.isPending}>
            Choose another file
          </button>
          <button type="button" className={styles.primary} onClick={onboardBulk} disabled={validCount === 0 || bulkCreate.isPending} aria-busy={bulkCreate.isPending || undefined}>
            {bulkCreate.isPending ? 'Onboarding…' : `Onboard ${validCount} member${validCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    );
  } else {
    // Entry — Single / Bulk toggle.
    body = (
      <div className={styles.body}>
        <div className={styles.modeToggle} role="tablist" aria-label="Onboarding method">
          <button type="button" role="tab" aria-selected={mode === 'single'} className={styles.modeTab} data-active={mode === 'single' || undefined} onClick={() => switchMode('single')}>
            Single member
          </button>
          <button type="button" role="tab" aria-selected={mode === 'bulk'} className={styles.modeTab} data-active={mode === 'bulk' || undefined} onClick={() => switchMode('bulk')}>
            Bulk upload
          </button>
        </div>

        {mode === 'single' ? (
          <>
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
            {err && <p className={styles.err} role="alert">{err}</p>}
            <div className={styles.footer}>
              <button type="button" className={styles.ghost} onClick={close} disabled={createInvite.isPending}>Cancel</button>
              <button type="button" className={styles.primary} onClick={submit} disabled={createInvite.isPending} aria-busy={createInvite.isPending || undefined}>
                {createInvite.isPending ? 'Creating…' : 'Create invite link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.note}>
              Onboard many members at once: download the template, fill one row per member
              (full name, phone, email), then upload it to review and onboard.
            </p>
            <button type="button" className={styles.outlineBtn} onClick={downloadTemplate}>
              {DownloadIcon}<span>Download Excel template</span>
            </button>
            <div className={styles.dropzone}>
              <span className={styles.dropIcon} aria-hidden="true">{UploadIcon}</span>
              <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                Upload filled template
              </button>
              <span className={styles.dropHint}>Excel or CSV — .xlsx, .xls, .csv</span>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className={styles.fileInput} onChange={onFile} aria-label="Upload filled template" />
            </div>
            {err && <p className={styles.err} role="alert">{err}</p>}
            <div className={styles.footer}>
              <button type="button" className={styles.ghost} onClick={close}>Cancel</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <EmployerSlidePanel
      open={onboardOpen}
      onClose={close}
      title={panelTitle}
      eyebrow="Onboarding"
      width={560}
      splitMode={splitMode}
    >
      {body}
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
