// Contribution Runs panel (Phase 4) — the core write flow of the Employer
// dashboard. One `EmployerSlidePanel` (width 680) hosts THREE in-panel views,
// switched by a local `view` state:
//
//   'history'  — run-history list (default), newest-first, + "New contribution
//                run" CTA. Reads via `useContributionRuns(employerId)`.
//   'detail'   — a single run's header totals + per-employee line items. Reads
//                via `useContributionRun(runId)`; employee names resolve from
//                `useEmployees(employerId)`.
//   'wizard'   — a 3-step new-run wizard: select employees → period + method →
//                confirm. On confirm it builds `rows = [{ employeeId }]` ONLY
//                (amounts are advisory — the SERVER re-derives every figure),
//                generates a client `nonce` via crypto.randomUUID() for
//                idempotency, and calls `useRunContribution(employerId)
//                .mutateAsync({ rows, periodLabel, method, nonce })`.
//
// The per-employee previews in the wizard MIRROR the server math for DISPLAY
// only (see `previewLineFor`) — the service / RPC remains the source of truth.
// This component never imports `employerSeed` / `mockData`; all data arrives
// through the employer hooks.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import {
  useContributionRuns,
  useContributionRun,
  useEmployees,
  useRunContribution,
} from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './ContributionRuns.module.css';

const round = (n) => Math.round(n);

const METHOD_OPTIONS = ['Bank transfer', 'MTN Mobile Money', 'Airtel Money'];

const WIZARD_STEPS = [
  { key: 'select', label: 'Select staff' },
  { key: 'period', label: 'Period & method' },
  { key: 'confirm', label: 'Confirm' },
];

/**
 * Client mirror of the server's per-employee math — DISPLAY ONLY. The RPC /
 * mock service re-derives the authoritative figures from salary + config;
 * we never send these amounts as authoritative. Mirrors `mockLineFor` in
 * `services/employer.js` / `lineFor` in `employerSeed.js`.
 */
function previewLineFor(emp) {
  const cfg = emp?.contributionConfig ?? {};
  const mode = cfg.mode ?? 'employer-only';
  const employerHalf =
    cfg.employerAmount != null
      ? round(Number(cfg.employerAmount))
      : round((emp?.salary ?? 0) * Number(cfg.employerPct ?? 0) / 100);
  let employeeHalf = 0;
  if (mode === 'co-contribution') {
    employeeHalf =
      cfg.employeeAmount != null
        ? round(Number(cfg.employeeAmount))
        : round((emp?.salary ?? 0) * Number(cfg.employeePct ?? 0) / 100);
  }
  const gross = employerHalf + employeeHalf;
  let retPct = Number(emp?.contributionSchedule?.retirementPct ?? 80);
  if (!(retPct >= 0 && retPct <= 100)) retPct = 80;
  const retirement = round(gross * retPct / 100);
  const emergency = gross - retirement;
  return { employerHalf, employeeHalf, gross, retirement, emergency };
}

/** Default period label — the current demo month, e.g. "May 2026". */
function defaultPeriodLabel() {
  return formatDate(new Date(), { variant: 'month-year' });
}

export default function ContributionRuns({ splitMode = false }) {
  const { runsOpen, setRunsOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();

  // 'history' | 'detail' | 'wizard'
  const [view, setView] = useState('history');
  const [activeRunId, setActiveRunId] = useState(null);

  // Reset the view a moment after the panel closes so re-opening starts clean.
  useEffect(() => {
    if (runsOpen) return undefined;
    const t = setTimeout(() => {
      setView('history');
      setActiveRunId(null);
    }, 400);
    return () => clearTimeout(t);
  }, [runsOpen]);

  const openDetail = useCallback((runId) => {
    setActiveRunId(runId);
    setView('detail');
  }, []);

  const backToHistory = useCallback(() => {
    setView('history');
    setActiveRunId(null);
  }, []);

  const headerActions =
    view === 'history' ? null : (
      <button type="button" className={styles.backBtn} onClick={backToHistory}>
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to history
      </button>
    );

  const eyebrow =
    view === 'wizard' ? 'New run' : view === 'detail' ? 'Run detail' : 'Contribution runs';
  const title =
    view === 'wizard' ? 'New contribution run' : view === 'detail' ? 'Run detail' : 'Contribution runs';

  return (
    <EmployerSlidePanel
      open={runsOpen}
      onClose={() => setRunsOpen(false)}
      title={title}
      eyebrow={eyebrow}
      width={680}
      splitMode={splitMode}
      headerActions={headerActions}
    >
      {view === 'history' && (
        <HistoryView
          employerId={employerId}
          onOpenRun={openDetail}
          onNewRun={() => setView('wizard')}
        />
      )}
      {view === 'detail' && (
        <RunDetailView employerId={employerId} runId={activeRunId} />
      )}
      {view === 'wizard' && (
        <NewRunWizard
          employerId={employerId}
          addToast={addToast}
          onDone={backToHistory}
          onCancel={backToHistory}
        />
      )}
    </EmployerSlidePanel>
  );
}

// =============================================================================
// View 1 — history list
// =============================================================================

function HistoryView({ employerId, onOpenRun, onNewRun }) {
  const {
    data: runs = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useContributionRuns(employerId);

  const isCold = isLoading && runs.length === 0;

  return (
    <>
      <div className={styles.historyHead}>
        <p className={styles.intro}>
          A run funds your active staff for a period. Each figure is computed
          server-side from salary and contribution config.
        </p>
        <button type="button" className={styles.primaryBtn} onClick={onNewRun}>
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          New contribution run
        </button>
      </div>

      {isCold ? (
        <SkeletonRow count={5} variant="compact" label="Loading contribution runs" />
      ) : isError ? (
        <ErrorCard title="We couldn't load run history" message={error} onRetry={refetch} />
      ) : runs.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="No contribution runs yet"
          body="Start your first run to fund your staff for the current period."
          cta={{ label: 'New contribution run', onClick: onNewRun }}
        />
      ) : (
        <ul className={styles.runList}>
          {runs.map((run) => (
            <li key={run.id} className={styles.runItem}>
              <button
                type="button"
                className={styles.runCard}
                onClick={() => onOpenRun(run.id)}
                aria-label={`Open ${run.periodLabel || 'run'} details`}
              >
                <div className={styles.runCardTop}>
                  <span className={styles.runPeriod}>{run.periodLabel || 'Untitled run'}</span>
                  <span className={styles.runStatus} data-status={run.status}>
                    {run.status === 'completed' ? 'Completed' : 'Draft'}
                  </span>
                </div>
                <div className={styles.runCardMeta}>
                  <span>{formatDate(run.runAt)}</span>
                  {Number.isFinite(Number(run.lineCount)) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatNumber(run.lineCount)}{' '}
                        {Number(run.lineCount) === 1 ? 'employee' : 'employees'}
                      </span>
                    </>
                  )}
                </div>
                <RunTotals run={run} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Three labelled totals shown on each history card + the detail header. */
function RunTotals({ run }) {
  return (
    <span className={styles.runTotals}>
      <span className={styles.totalChip}>
        <span className={styles.totalChipLabel}>Employer</span>
        <span className={styles.totalChipValue}>{formatUGX(run.employerTotal)}</span>
      </span>
      <span className={styles.totalChip}>
        <span className={styles.totalChipLabel}>Employee</span>
        <span className={styles.totalChipValue}>{formatUGX(run.employeeTotal)}</span>
      </span>
      <span className={styles.totalChip} data-grand="true">
        <span className={styles.totalChipLabel}>Grand total</span>
        <span className={styles.totalChipValue}>{formatUGX(run.grandTotal)}</span>
      </span>
    </span>
  );
}

// =============================================================================
// View 2 — run detail (header totals + per-employee line items)
// =============================================================================

function RunDetailView({ employerId, runId }) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useContributionRun(runId);
  const { data: employees = [] } = useEmployees(employerId);

  const nameById = useMemo(() => {
    const m = new Map();
    employees.forEach((e) => m.set(e.id, e.name));
    return m;
  }, [employees]);

  const isCold = isLoading && !data;

  if (isCold) {
    return <SkeletonRow count={6} variant="compact" label="Loading run detail" />;
  }
  if (isError) {
    return <ErrorCard title="We couldn't load this run" message={error} onRetry={refetch} />;
  }
  if (!data || !data.run) {
    return (
      <EmptyState
        kind="no-data"
        title="Run not found"
        body="This run is no longer available."
      />
    );
  }

  const { run, lines = [] } = data;

  return (
    <>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderTop}>
          <span className={styles.detailPeriod}>{run.periodLabel || 'Untitled run'}</span>
          <span className={styles.runStatus} data-status={run.status}>
            {run.status === 'completed' ? 'Completed' : 'Draft'}
          </span>
        </div>
        <p className={styles.detailSub}>
          {formatDate(run.runAt)} · {formatNumber(lines.length)}{' '}
          {lines.length === 1 ? 'employee' : 'employees'}
        </p>
        <RunTotals run={run} />
      </div>

      {lines.length === 0 ? (
        <EmptyState kind="no-data" title="No line items" body="This run funded no employees." />
      ) : (
        <div className={styles.lineTable} role="table" aria-label="Run line items">
          <div className={styles.lineHead} role="row">
            <span role="columnheader" className={styles.colEmp}>Employee</span>
            <span role="columnheader" className={styles.colNum}>Employer</span>
            <span role="columnheader" className={styles.colNum}>Employee</span>
            <span role="columnheader" className={styles.colSplit}>Ret / Emg</span>
            <span role="columnheader" className={styles.colNum}>Total</span>
            <span role="columnheader" className={styles.colMethod}>Method</span>
          </div>
          <ul className={styles.lineBody}>
            {lines.map((line) => {
              const total = (line.employerAmount || 0) + (line.employeeAmount || 0);
              return (
                <li key={line.id} role="row" className={styles.lineRow}>
                  <span role="cell" className={styles.colEmp}>
                    {nameById.get(line.employeeId) || line.employeeId}
                  </span>
                  <span role="cell" className={styles.colNum}>
                    {formatUGX(line.employerAmount, { compact: false })}
                  </span>
                  <span role="cell" className={styles.colNum}>
                    {line.employeeAmount > 0 ? formatUGX(line.employeeAmount, { compact: false }) : '—'}
                  </span>
                  <span role="cell" className={styles.colSplit}>
                    {formatUGX(line.retirementAmount, { compact: false })} / {formatUGX(line.emergencyAmount, { compact: false })}
                  </span>
                  <span role="cell" className={styles.colNum} data-strong="true">
                    {formatUGX(total, { compact: false })}
                  </span>
                  <span role="cell" className={styles.colMethod}>{line.method || '—'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// =============================================================================
// View 3 — new-run wizard (select → period+method → confirm)
// =============================================================================

function NewRunWizard({ employerId, addToast, onDone, onCancel }) {
  const {
    data: employees = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useEmployees(employerId);
  const runContribution = useRunContribution(employerId);

  const [stepIndex, setStepIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(null); // null until employees load
  const [periodLabel, setPeriodLabel] = useState(defaultPeriodLabel);
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);

  // Guard against a double-submit racing the disabled state.
  const submittingRef = useRef(false);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'active'),
    [employees],
  );
  const suspendedEmployees = useMemo(
    () => employees.filter((e) => e.status !== 'active'),
    [employees],
  );

  // Default to all active employees selected once the roster loads.
  useEffect(() => {
    if (selectedIds !== null) return;
    if (activeEmployees.length === 0 && employees.length === 0) return;
    setSelectedIds(new Set(activeEmployees.map((e) => e.id)));
  }, [activeEmployees, employees.length, selectedIds]);

  const EMPTY_SET = useRef(new Set()).current;
  const selected = selectedIds ?? EMPTY_SET;

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(activeEmployees.map((e) => e.id)));
  }, [activeEmployees]);

  const selectNone = useCallback(() => setSelectedIds(new Set()), []);

  // Live preview totals (client mirror of the server math — DISPLAY ONLY).
  const preview = useMemo(() => {
    let employerTotal = 0;
    let employeeTotal = 0;
    let grandTotal = 0;
    const perEmployee = new Map();
    for (const emp of activeEmployees) {
      if (!selected.has(emp.id)) continue;
      const line = previewLineFor(emp);
      perEmployee.set(emp.id, line);
      employerTotal += line.employerHalf;
      employeeTotal += line.employeeHalf;
      grandTotal += line.gross;
    }
    return { employerTotal, employeeTotal, grandTotal, perEmployee };
  }, [activeEmployees, selected]);

  const selectedCount = selected.size;
  const isPending = runContribution.isPending;

  function next() {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleConfirm() {
    if (submittingRef.current || isPending) return;
    if (selectedCount === 0) return;
    submittingRef.current = true;

    // Build rows with employeeId ONLY — amounts are advisory; the server
    // re-derives every figure. Generate a per-submission idempotency nonce.
    const rows = Array.from(selected).map((employeeId) => ({ employeeId }));
    const nonce =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const result = await runContribution.mutateAsync({ rows, periodLabel, method, nonce });
      // Toast uses SERVER totals + linesCreated + any skipped (server truth).
      const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
      const skippedNote = skippedCount > 0 ? ` · ${formatNumber(skippedCount)} skipped` : '';
      addToast(
        'success',
        `Run recorded — ${formatNumber(result?.linesCreated ?? 0)} funded · ${formatUGX(result?.grandTotal ?? 0)} total${skippedNote}`,
      );
      onDone();
    } catch (err) {
      addToast('error', err?.message || 'Could not record the contribution run.');
    } finally {
      submittingRef.current = false;
    }
  }

  // ── Loading / error guards for the roster the wizard depends on ────────────
  if (isLoading && employees.length === 0) {
    return <SkeletonRow count={6} variant="compact" label="Loading employees" />;
  }
  if (isError) {
    return <ErrorCard title="We couldn't load the roster" message={error} onRetry={refetch} />;
  }

  return (
    <div className={styles.wizard}>
      {/* Stepper */}
      <ol className={styles.stepper} aria-label="New run steps">
        {WIZARD_STEPS.map((step, i) => (
          <li
            key={step.key}
            className={styles.step}
            data-state={i === stepIndex ? 'current' : i < stepIndex ? 'done' : 'upcoming'}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            <span className={styles.stepDot}>{i < stepIndex ? '✓' : i + 1}</span>
            <span className={styles.stepLabel}>{step.label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1 — select employees */}
      {stepIndex === 0 && (
        <div className={styles.stepBody}>
          <div className={styles.selectControls}>
            <p className={styles.selectCount}>
              {formatNumber(selectedCount)} of {formatNumber(activeEmployees.length)} active selected
            </p>
            <div className={styles.selectActions}>
              <button type="button" className={styles.linkBtn} onClick={selectAll}>Select all</button>
              <span aria-hidden="true" className={styles.dotSep}>·</span>
              <button type="button" className={styles.linkBtn} onClick={selectNone}>Select none</button>
            </div>
          </div>

          {activeEmployees.length === 0 ? (
            <EmptyState
              kind="no-data"
              title="No active employees"
              body="Only active staff can be funded in a run."
            />
          ) : (
            <ul className={styles.selectList}>
              {activeEmployees.map((emp) => {
                const line = previewLineFor(emp);
                const checked = selected.has(emp.id);
                return (
                  <li key={emp.id} className={styles.selectRow}>
                    <label className={styles.selectLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={checked}
                        onChange={() => toggle(emp.id)}
                      />
                      <span className={styles.selectName}>
                        <span className={styles.selectNamePrimary}>{emp.name}</span>
                        <span className={styles.selectNameSub}>
                          {emp.jobTitle} · {formatUGX(emp.salary, { compact: false })}
                        </span>
                      </span>
                      <span className={styles.selectHalves}>
                        <span>Er {formatUGX(line.employerHalf, { compact: false })}</span>
                        <span>Ee {line.employeeHalf > 0 ? formatUGX(line.employeeHalf, { compact: false }) : '—'}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {suspendedEmployees.length > 0 && (
            <div className={styles.suspendedNote}>
              <p className={styles.suspendedTitle}>
                {formatNumber(suspendedEmployees.length)} suspended · excluded from runs
              </p>
              <ul className={styles.suspendedList}>
                {suspendedEmployees.map((emp) => (
                  <li key={emp.id} className={styles.suspendedRow}>
                    <label className={styles.selectLabel} aria-disabled="true">
                      <input type="checkbox" className={styles.checkbox} checked={false} disabled />
                      <span className={styles.selectName}>
                        <span className={styles.selectNamePrimary}>{emp.name}</span>
                        <span className={styles.selectNameSub}>{emp.jobTitle} · suspended</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Step 2 — period + method */}
      {stepIndex === 1 && (
        <div className={styles.stepBody}>
          <div className={styles.field}>
            <label htmlFor="run-period" className={styles.fieldLabel}>Period label</label>
            <input
              id="run-period"
              type="text"
              className={styles.textInput}
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="e.g. May 2026"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="run-method" className={styles.fieldLabel}>Payment method</label>
            <select
              id="run-method"
              className={styles.select}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className={styles.previewPanel} aria-live="polite">
            <p className={styles.previewTitle}>
              Estimated total for {formatNumber(selectedCount)} {selectedCount === 1 ? 'employee' : 'employees'}
            </p>
            <p className={styles.previewNote}>
              Advisory preview — the server re-derives final figures on submit.
            </p>
            <div className={styles.previewGrid}>
              <div className={styles.previewCell}>
                <span className={styles.previewCellLabel}>Employer</span>
                <span className={styles.previewCellValue}>{formatUGX(preview.employerTotal, { compact: false })}</span>
              </div>
              <div className={styles.previewCell}>
                <span className={styles.previewCellLabel}>Employee</span>
                <span className={styles.previewCellValue}>{formatUGX(preview.employeeTotal, { compact: false })}</span>
              </div>
              <div className={styles.previewCell} data-grand="true">
                <span className={styles.previewCellLabel}>Grand total</span>
                <span className={styles.previewCellValue}>{formatUGX(preview.grandTotal, { compact: false })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — confirm */}
      {stepIndex === 2 && (
        <div className={styles.stepBody}>
          <div className={styles.summaryCard}>
            <dl className={styles.summaryList}>
              <div className={styles.summaryItem}>
                <dt>Employees</dt>
                <dd>{formatNumber(selectedCount)} active</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Period</dt>
                <dd>{periodLabel || '—'}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Method</dt>
                <dd>{method}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Employer total</dt>
                <dd>{formatUGX(preview.employerTotal, { compact: false })}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Employee total</dt>
                <dd>{formatUGX(preview.employeeTotal, { compact: false })}</dd>
              </div>
              <div className={styles.summaryItem} data-grand="true">
                <dt>Grand total</dt>
                <dd>{formatUGX(preview.grandTotal, { compact: false })}</dd>
              </div>
            </dl>
            <p className={styles.confirmNote}>
              Final amounts are computed server-side from each employee&apos;s salary
              and contribution config. Suspended staff are skipped automatically.
            </p>
          </div>
        </div>
      )}

      {/* Footer nav */}
      <div className={styles.wizardFooter}>
        {stepIndex === 0 ? (
          <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={isPending}>
            Cancel
          </button>
        ) : (
          <button type="button" className={styles.ghostBtn} onClick={back} disabled={isPending}>
            Back
          </button>
        )}

        {stepIndex < WIZARD_STEPS.length - 1 ? (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={next}
            disabled={stepIndex === 0 && selectedCount === 0}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleConfirm}
            disabled={isPending || selectedCount === 0}
            aria-busy={isPending || undefined}
          >
            {isPending ? 'Recording…' : `Confirm & record (${formatNumber(selectedCount)})`}
          </button>
        )}
      </div>
    </div>
  );
}
