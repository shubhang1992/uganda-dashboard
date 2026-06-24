import { useRef, useState } from 'react';
import { downloadSheet, parseSheet } from '../../utils/xlsx';
import { isValidUGPhone, parseUGPhoneLocal } from '../../utils/phone';
import { useCreateAgent } from '../../hooks/useEntity';
import { useToast } from '../../contexts/ToastContext';
import { Card, SectionHead, Btn } from '../../employer-dashboard/desktop/ui';
import { downloadIcon } from '../../employer-dashboard/desktop/icons';
import styles from '../desktop/AgentsDesktop.module.css';

// Excel template — same fields as the single Add-agent form, in {key,label} form
// (the contract buildWorkbookBuffer expects; src/utils/xlsx.js).
const TEMPLATE_COLUMNS = [
  { key: 'fullName', label: 'Full name' },
  { key: 'phone', label: 'Phone' },
  { key: 'gender', label: 'Gender' },
  { key: 'email', label: 'Email' },
  { key: 'idNumber', label: 'National ID' },
  { key: 'employeeId', label: 'Employee ID' },
];

const TEMPLATE_EXAMPLES = [
  { fullName: 'James Okello', phone: '+256770000001', gender: 'Male', email: 'james@example.com', idNumber: 'CM83021XXXXXX', employeeId: 'EMP-0042' },
  { fullName: 'Grace Namubiru', phone: '+256701882904', gender: 'Female', email: '', idNumber: '', employeeId: '' },
];

const GENDERS = new Set(['male', 'female', 'other']);

// Case-insensitive header lookup (matches the employer bulk parser).
function pick(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const hit = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (hit && row[hit] != null && String(row[hit]).trim() !== '') return String(row[hit]).trim();
  }
  return '';
}

function rowError(fullName, phone, gender) {
  if (fullName.length < 2) return 'Name missing';
  if (!isValidUGPhone(phone)) return 'Invalid phone';
  if (!GENDERS.has(gender.toLowerCase())) return 'Invalid gender';
  return '';
}

export default function BulkOnboardAgents({ branchId, onCancel, onDone }) {
  const createAgent = useCreateAgent();
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  const [parsed, setParsed] = useState(null); // { fileName, rows: [{...,valid,error}] }
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { created, failed }

  async function downloadTemplate() {
    try {
      await downloadSheet({
        rows: TEMPLATE_EXAMPLES,
        columns: TEMPLATE_COLUMNS,
        filename: 'agent-onboarding-template',
        sheetName: 'Agents',
      });
      addToast('success', 'Template downloaded — fill one row per agent, then upload it.');
    } catch (e) {
      addToast('error', e?.message || 'Could not download the template.');
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    const { rows, errors } = await parseSheet(file);
    if (errors.length > 0) {
      setErr(errors[0] || 'Could not read the file — use the downloaded template.');
      return;
    }
    const mapped = rows.map((r) => {
      const fullName = pick(r, 'full name', 'name', 'fullname');
      const phone = parseUGPhoneLocal(pick(r, 'phone', 'phone number', 'mobile'));
      const gender = pick(r, 'gender', 'sex');
      const email = pick(r, 'email', 'email address', 'e-mail');
      const idNumber = pick(r, 'national id', 'national id number', 'id', 'id number', 'nin');
      const employeeId = pick(r, 'employee id', 'employee', 'employeeid', 'emp id');
      const error = rowError(fullName, phone, gender);
      return { fullName, phone, gender, email, idNumber, employeeId, valid: !error, error };
    });
    if (mapped.length === 0) {
      setErr('That file had no rows. Use the template columns: Full name, Phone, Gender, Email, National ID, Employee ID.');
      return;
    }
    setParsed({ fileName: file.name, rows: mapped });
  }

  async function onboardBulk() {
    if (submitting || !parsed) return;
    const valid = parsed.rows.filter((r) => r.valid);
    if (valid.length === 0) { setErr('No valid rows to onboard. Fix the flagged rows and re-upload.'); return; }
    setErr('');
    setSubmitting(true);
    let created = 0, failed = 0;
    // No bulk RPC for agents — branch INSERTs each agent directly (RLS
    // agents_insert_branch). Sequential so one bad row never aborts the rest.
    for (const r of valid) {
      try {
        await createAgent.mutateAsync({
          branchId,
          name: r.fullName,
          phone: r.phone,
          gender: r.gender.toLowerCase(),
          email: r.email || undefined,
          idNumber: r.idNumber || undefined,
          employeeId: r.employeeId || undefined,
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }
    setSubmitting(false);
    setResult({ created, failed });
    if (created > 0) addToast('success', `${created} agent${created === 1 ? '' : 's'} onboarded — credentials sent via SMS.`);
    if (created === 0) addToast('error', 'No agents could be onboarded.');
  }

  const validCount = parsed ? parsed.rows.filter((r) => r.valid).length : 0;
  const invalidCount = parsed ? parsed.rows.length - validCount : 0;

  if (result) {
    return (
      <Card>
        <SectionHead title="Bulk onboarding complete" />
        <p className={styles.bulkResult}>
          <strong>{result.created}</strong> agent{result.created === 1 ? '' : 's'} onboarded and tagged to your branch — each receives login credentials via SMS.
          {result.failed > 0 ? ` ${result.failed} row${result.failed === 1 ? '' : 's'} could not be created.` : ''}
        </p>
        <div className={styles.formActions}>
          <Btn variant="secondary" onClick={() => { setParsed(null); setResult(null); }}>Onboard more</Btn>
          <Btn variant="primary" onClick={onDone}>Done</Btn>
        </div>
      </Card>
    );
  }

  if (parsed) {
    return (
      <Card>
        <SectionHead title="Review upload" tag={`${validCount} ready${invalidCount > 0 ? ` · ${invalidCount} need fixing` : ''}`} />
        <p className={styles.bulkNote}>
          Reviewing <strong>{parsed.fileName}</strong> — only the valid rows are onboarded.
        </p>
        <div className={styles.reviewWrap}>
          <table className={styles.reviewTable}>
            <thead>
              <tr><th>#</th><th>Name</th><th>Phone</th><th>Gender</th><th>Email</th><th>Status</th></tr>
            </thead>
            <tbody>
              {parsed.rows.map((r, i) => (
                <tr key={i} data-invalid={!r.valid || undefined}>
                  <td className={styles.reviewNum}>{i + 1}</td>
                  <td>{r.fullName || '—'}</td>
                  <td>{r.phone ? `+256 ${r.phone}` : '—'}</td>
                  <td>{r.gender || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td>{r.valid ? <span className={styles.ok}>Ready</span> : <span className={styles.bad}>{r.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err && <p className={styles.err} role="alert">{err}</p>}
        <div className={styles.formActions}>
          <Btn variant="secondary" onClick={() => { setParsed(null); setErr(''); }} disabled={submitting}>Choose another file</Btn>
          <Btn variant="primary" onClick={onboardBulk} disabled={validCount === 0 || submitting}>
            {submitting ? 'Onboarding…' : `Onboard ${validCount} agent${validCount === 1 ? '' : 's'}`}
          </Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHead title="Bulk upload" tag="Excel / CSV" />
      <p className={styles.bulkNote}>
        Onboard many agents at once: download the template, fill one row per agent
        (full name, phone, gender, and optionally email, National ID, Employee ID), then upload it to review and onboard.
      </p>
      <button type="button" className={styles.outlineBtn} onClick={downloadTemplate}>
        {downloadIcon(16)}<span>Download Excel template</span>
      </button>
      <div className={styles.dropzone}>
        <span className={styles.dropIcon} aria-hidden="true">{downloadIcon(22)}</span>
        <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
          Upload filled template
        </button>
        <span className={styles.dropHint}>Excel or CSV — .xlsx, .xls, .csv</span>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className={styles.fileInput} onChange={onFile} aria-label="Upload filled template" />
      </div>
      {err && <p className={styles.err} role="alert">{err}</p>}
      <div className={styles.formActions}>
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}
