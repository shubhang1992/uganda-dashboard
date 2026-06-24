import { useState } from 'react';
import { isValidUGPhone, parseUGPhoneLocal } from '../../utils/phone';
import { useCreateAgent } from '../../hooks/useEntity';
import { useToast } from '../../contexts/ToastContext';
import { Card, SectionHead, Btn } from '../../employer-dashboard/desktop/ui';
import { checkIcon, handAddIcon } from '../../employer-dashboard/desktop/icons';
import styles from '../desktop/AgentsDesktop.module.css';

/**
 * CreateAgentForm — the DESKTOP integrated "Add agent" form (single screen,
 * two-column: form + "what happens next" summary). Reuses the same validation
 * (isValidUGPhone/parseUGPhoneLocal), mutation (useCreateAgent) and payload shape
 * as the mobile slide-in CreateAgent.jsx, but renders inline on the Agents page
 * instead of a modal/panel. The mobile CreateAgent.jsx is intentionally left
 * untouched so the mobile experience stays byte-identical.
 */
export default function CreateAgentForm({ branchId, branchName, onCancel, onCreated }) {
  const createAgent = useCreateAgent();
  const { addToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

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
      onCreated?.();
    } catch (err) {
      setSubmitError(err?.message || 'Could not create agent. Please try again.');
    }
  }

  const previewInitials = fullName
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'NA';

  return (
    <div className={styles.split}>
      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.formGrid}>
            <div className={`${styles.fg} ${styles.fgFull}`}>
              <label className={styles.label} htmlFor="ba-fullName">Full name <span className={styles.req}>*</span></label>
              <input
                id="ba-fullName" className={styles.input} value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors((p) => ({ ...p, fullName: '' })); }}
                placeholder="e.g. James Okello" data-error={!!errors.fullName}
                name="agentName" autoComplete="name"
              />
              {errors.fullName && <span className={styles.error}>{errors.fullName}</span>}
            </div>

            <div className={styles.fg}>
              <label className={styles.label} htmlFor="ba-phone">Phone number <span className={styles.req}>*</span></label>
              <div className={styles.phoneRow} data-error={!!errors.phone}>
                <span className={styles.phonePrefix}>+256</span>
                <input
                  id="ba-phone" type="tel" inputMode="numeric" className={styles.phoneInput}
                  value={phone} onChange={handlePhoneChange} placeholder="7XX XXX XXX"
                  name="phone" autoComplete="tel"
                />
              </div>
              {errors.phone && <span className={styles.error}>{errors.phone}</span>}
            </div>

            <div className={styles.fg}>
              <label className={styles.label} htmlFor="ba-gender">Gender <span className={styles.req}>*</span></label>
              <select
                id="ba-gender" className={styles.select} value={gender} data-error={!!errors.gender}
                onChange={(e) => { setGender(e.target.value); if (errors.gender) setErrors((p) => ({ ...p, gender: '' })); }}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <span className={styles.error}>{errors.gender}</span>}
            </div>

            <div className={`${styles.fg} ${styles.fgFull}`}>
              <label className={styles.label} htmlFor="ba-email">Email address</label>
              <input
                id="ba-email" type="email" className={styles.input} value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="e.g. james@example.com"
                name="email" autoComplete="email"
              />
            </div>

            <div className={styles.fg}>
              <label className={styles.label} htmlFor="ba-id">National ID number</label>
              <input
                id="ba-id" className={styles.input} value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. CM83021XXXXXX"
                name="idNumber" autoComplete="off" spellCheck={false}
              />
            </div>

            <div className={styles.fg}>
              <label className={styles.label} htmlFor="ba-emp">Employee ID</label>
              <input
                id="ba-emp" className={styles.input} value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. EMP-0042"
                name="employeeId" autoComplete="off" spellCheck={false}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            {submitError && <span className={styles.submitError} role="alert">{submitError}</span>}
            <Btn variant="secondary" onClick={onCancel} disabled={createAgent.isPending}>Cancel</Btn>
            <Btn variant="primary" type="submit" disabled={createAgent.isPending}>
              {checkIcon(16)}
              {createAgent.isPending ? 'Creating…' : 'Create agent'}
            </Btn>
          </div>
        </form>
      </Card>

      <aside className={styles.summary}>
        <Card>
          <h3 className={styles.summaryTitle}>What happens next</h3>
          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <div><div className={styles.stepT}>Login credentials sent</div><div className={styles.stepS}>An SMS with a temporary PIN goes to the agent&apos;s phone.</div></div>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <div><div className={styles.stepT}>Agent completes profile</div><div className={styles.stepS}>They sign in, set a PIN, and confirm their details.</div></div>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <div><div className={styles.stepT}>Starts enrolling subscribers</div><div className={styles.stepS}>New members count toward your branch totals immediately.</div></div>
            </div>
          </div>
          <div className={styles.preview}>
            <div className={styles.previewHead}>
              <span className={styles.previewAv} aria-hidden="true">{previewInitials}</span>
              <div>
                <div className={styles.previewName}>{fullName.trim() || 'New agent'}</div>
                <div className={styles.previewMeta}>{branchName || 'This branch'} · Agent</div>
              </div>
            </div>
            <div className={styles.previewNote}>
              <span aria-hidden="true">{handAddIcon(15)}</span>
              Access credentials will be sent via SMS once you create the agent.
            </div>
          </div>
        </Card>
      </aside>
    </div>
  );
}
