// Employee detail panel (Phase 3). Opens for the `activeEmployeeId` set by the
// panel context and renders the per-employee view: balances, contribution
// schedule, contribution history (run-lines), insurance, nominees — plus two
// inline editors (contribution-config + insurance) wired to the optimistic
// mutation hooks. Never imports `employerSeed`; all data via hooks.
//
// Wraps the shared `EmployerSlidePanel` chrome (width 560, title = employee
// name) and passes through `splitMode`.

import { useState, useMemo, useEffect } from 'react';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import {
  useEmployee,
  useEmployeeContributions,
  useUpdateEmployeeContributionConfig,
  useUpdateEmployeeInsurance,
} from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmptyState from '../../components/EmptyState';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './EmployeeDetail.module.css';

const round = (n) => Math.round(n);

/** Derive the employer/employee halves from salary + config (display preview). */
function deriveHalves(salary, config) {
  const cfg = config ?? {};
  const mode = cfg.mode ?? 'employer-only';
  const employerHalf =
    cfg.employerAmount != null && cfg.employerAmount !== ''
      ? round(Number(cfg.employerAmount))
      : round((Number(salary) || 0) * (Number(cfg.employerPct) || 0) / 100);
  let employeeHalf = 0;
  if (mode === 'co-contribution') {
    employeeHalf =
      cfg.employeeAmount != null && cfg.employeeAmount !== ''
        ? round(Number(cfg.employeeAmount))
        : round((Number(salary) || 0) * (Number(cfg.employeePct) || 0) / 100);
  }
  return { employerHalf, employeeHalf, gross: employerHalf + employeeHalf };
}

export default function EmployeeDetail({ splitMode = false }) {
  const { employeeDetailOpen, setEmployeeDetailOpen, activeEmployeeId } = useEmployerPanel();
  const { addToast } = useToast();

  const {
    data: employee,
    isLoading,
    isError,
    error,
    refetch,
  } = useEmployee(activeEmployeeId);

  const {
    data: contributions = [],
    isLoading: txLoading,
    isError: txError,
    error: txErrorObj,
    refetch: refetchTx,
  } = useEmployeeContributions(activeEmployeeId);

  const updateConfig = useUpdateEmployeeContributionConfig();
  const updateInsurance = useUpdateEmployeeInsurance();

  // ── Editor open/draft state ───────────────────────────────────────────────
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState(null);
  const [configErr, setConfigErr] = useState('');

  const [insuranceOpen, setInsuranceOpen] = useState(false);
  const [insuranceDraft, setInsuranceDraft] = useState(null);
  const [insuranceErr, setInsuranceErr] = useState('');

  // Close editors + reset drafts when the panel closes or the employee swaps.
  // Deferred to a microtask so we never call setState synchronously inside the
  // effect body (cascading-render lint rule) — matches the sibling panels'
  // close-reset idiom.
  useEffect(() => {
    const t = setTimeout(() => {
      setConfigOpen(false);
      setInsuranceOpen(false);
      setConfigErr('');
      setInsuranceErr('');
    }, 0);
    return () => clearTimeout(t);
  }, [activeEmployeeId, employeeDetailOpen]);

  function openConfigEditor() {
    const cfg = employee?.contributionConfig ?? {};
    setConfigDraft({
      mode: cfg.mode ?? 'employer-only',
      employerPct: cfg.employerPct ?? 0,
      employeePct: cfg.employeePct ?? 0,
    });
    setConfigErr('');
    setConfigOpen(true);
  }

  function openInsuranceEditor() {
    setInsuranceDraft({
      cover: employee?.insuranceCover ?? 0,
      premium: employee?.insurancePremiumMonthly ?? 0,
    });
    setInsuranceErr('');
    setInsuranceOpen(true);
  }

  // Live preview of the config editor draft against the employee's salary.
  const configPreview = useMemo(() => {
    if (!employee || !configDraft) return null;
    return deriveHalves(employee.salary, configDraft);
  }, [employee, configDraft]);

  function handleSaveConfig() {
    if (!employee || !configDraft) return;
    const employerPct = Number(configDraft.employerPct);
    const employeePct = Number(configDraft.employeePct);
    const isCo = configDraft.mode === 'co-contribution';
    // Validate percentages (0–100).
    if (!(employerPct >= 0 && employerPct <= 100)) {
      setConfigErr('Employer % must be between 0 and 100.');
      return;
    }
    if (isCo && !(employeePct >= 0 && employeePct <= 100)) {
      setConfigErr('Employee % must be between 0 and 100.');
      return;
    }
    setConfigErr('');
    const config = {
      mode: configDraft.mode,
      employerPct,
      employeePct: isCo ? employeePct : 0,
      employerAmount: null,
      employeeAmount: null,
    };
    updateConfig.mutate(
      { employeeId: employee.id, config },
      {
        onSuccess: () => {
          addToast('success', 'Contribution config updated');
          setConfigOpen(false);
        },
        onError: (err) => addToast('error', err?.message || 'Could not update config'),
      },
    );
  }

  function handleSaveInsurance() {
    if (!employee || !insuranceDraft) return;
    const cover = Number(insuranceDraft.cover);
    const premium = Number(insuranceDraft.premium);
    if (!(cover >= 0) || !Number.isFinite(cover)) {
      setInsuranceErr('Cover must be a non-negative amount.');
      return;
    }
    if (!(premium >= 0) || !Number.isFinite(premium)) {
      setInsuranceErr('Premium must be a non-negative amount.');
      return;
    }
    setInsuranceErr('');
    updateInsurance.mutate(
      { employeeId: employee.id, cover, premium },
      {
        onSuccess: () => {
          addToast('success', cover > 0 ? 'Insurance updated' : 'Insurance cover removed');
          setInsuranceOpen(false);
        },
        onError: (err) => addToast('error', err?.message || 'Could not update insurance'),
      },
    );
  }

  const title = employee?.name || 'Employee';
  const isCold = isLoading && !employee;

  const headerBadge = employee ? (
    <span className={styles.statusPill} data-status={employee.status}>
      {employee.status === 'active' ? 'Active' : 'Suspended'}
    </span>
  ) : null;

  return (
    <EmployerSlidePanel
      open={employeeDetailOpen}
      onClose={() => setEmployeeDetailOpen(false)}
      title={title}
      eyebrow="Employee"
      width={560}
      splitMode={splitMode}
      headerActions={headerBadge}
    >
      {isCold ? (
        <SkeletonRow count={6} label="Loading employee" />
      ) : isError ? (
        <ErrorCard
          title="We couldn't load this employee"
          message={error}
          onRetry={refetch}
        />
      ) : !employee ? (
        <EmptyState kind="no-data" title="Employee not found" body="This record may have been removed." />
      ) : (
        <div className={styles.sections}>
          {/* Identity meta */}
          <p className={styles.identity}>
            {employee.jobTitle} · {formatUGX(employee.salary, { compact: false })} salary
            {employee.joinedDate ? ` · Joined ${formatDate(employee.joinedDate, { variant: 'long' })}` : ''}
          </p>
          {employee.status === 'suspended' && (
            <p className={styles.suspendNote}>
              This employee is suspended — contribution runs skip them, but you can still edit their config and insurance.
            </p>
          )}

          {/* ── Balances ───────────────────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="bal-h">
            <h3 id="bal-h" className={styles.sectionTitle}>Balances</h3>
            <div className={styles.metricGrid}>
              <Metric label="Retirement" value={formatUGX(employee.retirementBalance)} />
              <Metric label="Emergency" value={formatUGX(employee.emergencyBalance)} />
              <Metric label="Net balance" value={formatUGX(employee.netBalance)} accent />
              <Metric label="Units held" value={formatNumber(employee.unitsHeld)} />
              <Metric label="Total contributions" value={formatUGX(employee.totalContributions)} />
            </div>
          </section>

          {/* ── Contribution schedule + config editor ─────────────────────── */}
          <section className={styles.section} aria-labelledby="sched-h">
            <div className={styles.sectionHead}>
              <h3 id="sched-h" className={styles.sectionTitle}>Contribution schedule</h3>
              {!configOpen && (
                <button type="button" className={styles.editBtn} onClick={openConfigEditor}>
                  Edit config
                </button>
              )}
            </div>

            {!configOpen ? (
              <dl className={styles.defs}>
                <Def
                  label="Funding mode"
                  value={employee.contributionConfig?.mode === 'co-contribution' ? 'Co-contribution' : 'Employer-only'}
                />
                <Def label="Employer share" value={`${Number(employee.contributionConfig?.employerPct ?? 0)}%`} />
                {employee.contributionConfig?.mode === 'co-contribution' && (
                  <Def label="Employee share" value={`${Number(employee.contributionConfig?.employeePct ?? 0)}%`} />
                )}
                <Def label="Retirement / Emergency" value={`${Number(employee.contributionSchedule?.retirementPct ?? 80)}% / ${Number(employee.contributionSchedule?.emergencyPct ?? 20)}%`} />
              </dl>
            ) : (
              <div className={styles.editor}>
                <fieldset className={styles.fieldset}>
                  <legend className={styles.legend}>Funding mode</legend>
                  <div className={styles.radioRow}>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="fundingMode"
                        checked={configDraft?.mode === 'employer-only'}
                        onChange={() => setConfigDraft((d) => ({ ...d, mode: 'employer-only' }))}
                      />
                      Employer-only
                    </label>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="fundingMode"
                        checked={configDraft?.mode === 'co-contribution'}
                        onChange={() => setConfigDraft((d) => ({ ...d, mode: 'co-contribution' }))}
                      />
                      Co-contribution
                    </label>
                  </div>
                </fieldset>

                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Employer %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className={styles.input}
                      value={configDraft?.employerPct ?? 0}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, employerPct: e.target.value }))}
                    />
                  </label>
                  <label className={styles.field} data-disabled={configDraft?.mode !== 'co-contribution' || undefined}>
                    <span className={styles.fieldLabel}>Employee %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className={styles.input}
                      value={configDraft?.employeePct ?? 0}
                      disabled={configDraft?.mode !== 'co-contribution'}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, employeePct: e.target.value }))}
                    />
                  </label>
                </div>

                {/* Live preview */}
                {configPreview && (
                  <div className={styles.preview} aria-live="polite">
                    <span className={styles.previewLabel}>Per-run preview (from {formatUGX(employee.salary, { compact: false })})</span>
                    <div className={styles.previewRow}>
                      <span>Employer: <strong>{formatUGX(configPreview.employerHalf, { compact: false })}</strong></span>
                      <span>Employee: <strong>{formatUGX(configPreview.employeeHalf, { compact: false })}</strong></span>
                      <span>Total: <strong>{formatUGX(configPreview.gross, { compact: false })}</strong></span>
                    </div>
                  </div>
                )}

                {configErr && <p className={styles.editorErr} role="alert">{configErr}</p>}

                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setConfigOpen(false)}
                    disabled={updateConfig.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSaveConfig}
                    disabled={updateConfig.isPending}
                  >
                    {updateConfig.isPending ? 'Saving…' : 'Save config'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Contribution history ──────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="hist-h">
            <h3 id="hist-h" className={styles.sectionTitle}>Contribution history</h3>
            {txLoading && contributions.length === 0 ? (
              <SkeletonRow count={3} variant="compact" label="Loading contributions" />
            ) : txError ? (
              <ErrorCard
                title="We couldn't load contributions"
                message={txErrorObj}
                onRetry={refetchTx}
                variant="inline"
              />
            ) : contributions.length === 0 ? (
              <EmptyState
                kind="no-data"
                title="No contributions yet"
                body="Once this employee is included in a run, the line items appear here."
              />
            ) : (
              <ul className={styles.txList}>
                {contributions.map((c) => (
                  <li key={c.id} className={styles.txRow}>
                    <div className={styles.txMain}>
                      <span className={styles.txPeriod}>{c.periodLabel || 'Contribution'}</span>
                      <span className={styles.txMeta}>
                        {c.runAt ? formatDate(c.runAt, { variant: 'short' }) : '—'}
                        {c.method ? ` · ${c.method}` : ''}
                      </span>
                    </div>
                    <div className={styles.txAmounts}>
                      <span className={styles.txTotal}>{formatUGX(c.employerAmount + c.employeeAmount, { compact: false })}</span>
                      <span className={styles.txHalves}>
                        ER {formatUGX(c.employerAmount, { compact: false })} · EE {formatUGX(c.employeeAmount, { compact: false })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Insurance + editor ────────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="ins-h">
            <div className={styles.sectionHead}>
              <h3 id="ins-h" className={styles.sectionTitle}>Insurance</h3>
              {!insuranceOpen && (
                <button type="button" className={styles.editBtn} onClick={openInsuranceEditor}>
                  Edit cover
                </button>
              )}
            </div>

            {!insuranceOpen ? (
              <dl className={styles.defs}>
                <Def label="Cover" value={employee.insuranceCover > 0 ? formatUGX(employee.insuranceCover, { compact: false }) : 'No cover'} />
                <Def label="Monthly premium" value={employee.insurancePremiumMonthly > 0 ? formatUGX(employee.insurancePremiumMonthly, { compact: false }) : '—'} />
                <Def
                  label="Status"
                  value={(
                    <span className={styles.insStatus} data-status={employee.insuranceStatus === 'active' ? 'active' : 'inactive'}>
                      {employee.insuranceStatus === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  )}
                />
                {employee.insuranceRenewalDate && (
                  <Def label="Renewal" value={formatDate(employee.insuranceRenewalDate, { variant: 'long' })} />
                )}
              </dl>
            ) : (
              <div className={styles.editor}>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Cover (UGX)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      className={styles.input}
                      value={insuranceDraft?.cover ?? 0}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, cover: e.target.value }))}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Monthly premium (UGX)</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      className={styles.input}
                      value={insuranceDraft?.premium ?? 0}
                      onChange={(e) => setInsuranceDraft((d) => ({ ...d, premium: e.target.value }))}
                    />
                  </label>
                </div>
                <p className={styles.insHint}>
                  Status derives from cover — any cover above 0 marks the policy active.
                </p>

                {insuranceErr && <p className={styles.editorErr} role="alert">{insuranceErr}</p>}

                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setInsuranceOpen(false)}
                    disabled={updateInsurance.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSaveInsurance}
                    disabled={updateInsurance.isPending}
                  >
                    {updateInsurance.isPending ? 'Saving…' : 'Save insurance'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Nominees ──────────────────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="nom-h">
            <h3 id="nom-h" className={styles.sectionTitle}>Nominees</h3>
            {employee.nominees && employee.nominees.length > 0 ? (
              <ul className={styles.nomineeList}>
                {employee.nominees.map((n, i) => (
                  <li key={n.id || n.nin || `${n.name}-${i}`} className={styles.nomineeRow}>
                    <div className={styles.nomineeMain}>
                      <span className={styles.nomineeName}>{n.name}</span>
                      {n.relationship && <span className={styles.nomineeRel}>{n.relationship}</span>}
                    </div>
                    {n.share != null && <span className={styles.nomineeShare}>{Number(n.share)}%</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyInline}>No nominees on file.</p>
            )}
          </section>
        </div>
      )}
    </EmployerSlidePanel>
  );
}

/* ── Small presentational helpers ──────────────────────────────────────────── */

function Metric({ label, value, accent }) {
  return (
    <div className={styles.metric} data-accent={accent || undefined}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function Def({ label, value }) {
  return (
    <div className={styles.def}>
      <dt className={styles.defLabel}>{label}</dt>
      <dd className={styles.defValue}>{value}</dd>
    </div>
  );
}
