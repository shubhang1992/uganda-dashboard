import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidUGPhone, parseUGPhoneLocal } from '../../utils/phone';
import { useEntity, useCreateAgent } from '../../hooks/useEntity';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useToast } from '../../contexts/ToastContext';
import { useBranchAppBar } from '../shell/branchAppBarContext';
import styles from './branchMobile.module.css';
import ca from './CreateAgentMobile.module.css';

const ChevDown = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const AgentAddIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.6 3-5.5 6.5-5.5" /><path d="M18 14v6M15 17h6" />
  </svg>
);

/* Steps copy mirrors the desktop CreateAgentForm "What happens next" card. */
const NEXT_STEPS = [
  { t: 'Login credentials sent', s: "An SMS with a temporary PIN goes to the agent's phone." },
  { t: 'Agent completes profile', s: 'They sign in, set a PIN, and confirm their details.' },
  { t: 'Starts enrolling subscribers', s: 'New members count toward your branch totals immediately.' },
];

/**
 * CreateAgentMobile — the branch admin PHONE "Add agent" form, mounted at the
 * routed flow path /dashboard/agents/new. Uses the SAME real create flow as the
 * desktop CreateAgentForm.jsx: same validation (isValidUGPhone /
 * parseUGPhoneLocal), the same useCreateAgent() mutation, and the same payload
 * shape (name / phone / gender required; email / idNumber / employeeId
 * optional). On success it toasts and routes back to /dashboard/agents — no
 * faked submission. The app bar already renders this route as back + "Add agent"
 * (FLOW map); we register a back override so the back chevron returns to the
 * roster rather than navigate(-1) (which could land outside the dashboard).
 */
export default function CreateAgentMobile() {
  const navigate = useNavigate();
  const { branchId } = useBranchScope();
  const { data: branch } = useEntity('branch', branchId);
  const createAgent = useCreateAgent();
  const { addToast } = useToast();
  const { registerBack } = useBranchAppBar();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  /* Send the app-bar back chevron to the roster, not browser history. */
  const goBack = useCallback(() => navigate('/dashboard/agents'), [navigate]);
  useEffect(() => registerBack(goBack), [registerBack, goBack]);

  function validate() {
    const e = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!isValidUGPhone(phone)) e.phone = 'Enter a valid Ugandan mobile number';
    if (!gender) e.gender = 'Select a gender';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handlePhoneChange(e) {
    setPhone(parseUGPhoneLocal(e.target.value));
    if (errors.phone) setErrors((p) => ({ ...p, phone: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!branchId) { setSubmitError('No branch is assigned to your account.'); return; }
    if (!validate()) return;
    setSubmitError('');
    try {
      await createAgent.mutateAsync({
        branchId,
        name: fullName.trim(),
        phone,
        email: email.trim() || undefined,
        gender,
        idNumber: idNumber.trim() || undefined,
        employeeId: employeeId.trim() || undefined,
      });
      addToast('success', `${fullName.trim()} added — login credentials sent via SMS.`);
      navigate('/dashboard/agents');
    } catch (err) {
      setSubmitError(err?.message || 'Could not create agent. Please try again.');
    }
  }

  const busy = createAgent.isPending;

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Add agent" className={ca.form}>
      {/* Callout — New agent · <branch name> */}
      <section className={styles.callout}>
        <span className={styles.calloutIc} aria-hidden="true">{AgentAddIcon}</span>
        <div>
          <b>New agent{branch?.name ? ` · ${branch.name}` : ''}</b>
          <p>
            They&apos;ll receive SMS login details and can start enrolling subscribers right away.
            New members count toward your branch totals immediately.
          </p>
        </div>
      </section>

      {/* Fields */}
      <section className={styles.card} aria-label="Agent details">
        <label className={styles.fl} htmlFor="ca-fullName">
          Full name <span className={styles.req}>*</span>
        </label>
        <div className={styles.field} data-error={!!errors.fullName}>
          <input
            id="ca-fullName"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors((p) => ({ ...p, fullName: '' })); }}
            placeholder="e.g. James Okello"
            name="agentName"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
          />
        </div>
        {errors.fullName && <span className={ca.error} role="alert">{errors.fullName}</span>}

        <label className={styles.fl} htmlFor="ca-phone" style={{ marginTop: 16 }}>
          Phone number <span className={styles.req}>*</span>
        </label>
        <div className={styles.field} data-error={!!errors.phone}>
          <span className={styles.fieldPfx}>+256</span>
          <input
            id="ca-phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="7XX XXX XXX"
            name="phone"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
          />
        </div>
        {errors.phone && <span className={ca.error} role="alert">{errors.phone}</span>}

        <label className={styles.fl} htmlFor="ca-gender" style={{ marginTop: 16 }}>
          Gender <span className={styles.req}>*</span>
        </label>
        <div className={styles.field} data-error={!!errors.gender}>
          <select
            id="ca-gender"
            value={gender}
            onChange={(e) => { setGender(e.target.value); if (errors.gender) setErrors((p) => ({ ...p, gender: '' })); }}
            aria-invalid={!!errors.gender}
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <span aria-hidden="true" style={{ color: 'var(--color-gray)', display: 'inline-flex' }}>{ChevDown}</span>
        </div>
        {errors.gender && <span className={ca.error} role="alert">{errors.gender}</span>}

        <label className={styles.fl} htmlFor="ca-email" style={{ marginTop: 16 }}>
          Email <span className={ca.labelOpt}>· optional</span>
        </label>
        <div className={styles.field}>
          <input
            id="ca-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            name="email"
            autoComplete="email"
          />
        </div>

        <label className={styles.fl} htmlFor="ca-id" style={{ marginTop: 16 }}>
          National ID <span className={ca.labelOpt}>· optional</span>
        </label>
        <div className={styles.field}>
          <input
            id="ca-id"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="e.g. CM83021XXXXXX"
            name="idNumber"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <label className={styles.fl} htmlFor="ca-emp" style={{ marginTop: 16 }}>
          Employee ID <span className={ca.labelOpt}>· optional</span>
        </label>
        <div className={styles.field}>
          <input
            id="ca-emp"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="e.g. EMP-0042"
            name="employeeId"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </section>

      {/* What happens next */}
      <section className={styles.card} aria-label="What happens next">
        <header className={styles.cardHd}><h3 style={{ fontSize: 14 }}>What happens next</h3></header>
        <div className={styles.steps}>
          {NEXT_STEPS.map((s, i) => (
            <div className={styles.stepI} key={s.t}>
              <div className={styles.stepN}>{i + 1}</div>
              <div>
                <b>{s.t}</b>
                <small>{s.s}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sticky footer CTA */}
      <div className={ca.footcta}>
        {submitError && <span className={ca.submitError} role="alert">{submitError}</span>}
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPri} ${styles.btnBlock}`}
          disabled={busy}
          aria-label="Create agent"
        >
          {busy ? (
            <>
              <span className={ca.btnSpinner} aria-hidden="true" />
              Creating…
            </>
          ) : (
            'Create agent'
          )}
        </button>
      </div>
    </form>
  );
}
