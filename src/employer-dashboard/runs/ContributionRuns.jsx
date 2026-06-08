// Contribution Runs panel — the employer's "fund my staff" flow. One
// `EmployerSlidePanel` (width 680) hosts THREE in-panel views:
//
//   'history' — run-history list (default), newest-first, + "New run" CTA.
//   'detail'  — a single run's header totals + per-member employer-source lines.
//   'wizard'  — a 2-step new-run wizard: period + method → confirm.
//
// UNIFIED MODEL (0043–0045): a run posts ONE employer-source contribution to
// EVERY active tagged subscriber, computed from the SINGLE company config
// (Issue 2) — there is no per-member selection or per-member config. The wizard
// preview MIRRORS the server math for DISPLAY only; the RPC is the source of
// truth. Never imports `employerSeed` / `mockData`.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import {
  useContributionRuns,
  useContributionRun,
  useEmployees,
  useEmployer,
  useRunContribution,
} from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { companyFundingLabel } from '../employees/fundingLabel';
import styles from './ContributionRuns.module.css';

const round = (n) => Math.round(n);
const METHOD_OPTIONS = ['Bank transfer', 'MTN Mobile Money', 'Airtel Money'];
const WIZARD_STEPS = [
  { key: 'period', label: 'Period & method' },
  { key: 'confirm', label: 'Confirm' },
];

/**
 * Client mirror of the server's per-member employer contribution — DISPLAY
 * ONLY. Reads the COMPANY config (Issue 2), not a per-member config:
 *   co-contribution: employer matches matchPct% of the member's own saving, capped.
 *   employer-only:   a fixed monthly amount.
 */
function previewEmployerAmount(member, cfg) {
  const mode = cfg?.mode ?? 'employer-only';
  let amt;
  if (mode === 'co-contribution') {
    amt = round(Number(member?.monthlyContribution ?? 0) * Number(cfg?.matchPct ?? 0) / 100);
    if (cfg?.maxContribution != null && cfg.maxContribution !== '') {
      amt = Math.min(amt, round(Number(cfg.maxContribution)));
    }
  } else {
    amt = round(Number(cfg?.employerAmount ?? 0));
  }
  return amt;
}

function defaultPeriodLabel() {
  return formatDate(new Date(), { variant: 'month-year' });
}

export default function ContributionRuns({ splitMode = false }) {
  const { runsOpen, setRunsOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();

  const [view, setView] = useState('history');
  const [activeRunId, setActiveRunId] = useState(null);

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

  const eyebrow = view === 'wizard' ? 'New run' : view === 'detail' ? 'Run detail' : 'Contribution runs';
  const title = view === 'wizard' ? 'New contribution run' : view === 'detail' ? 'Run detail' : 'Contribution runs';

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
        <HistoryView employerId={employerId} onOpenRun={openDetail} onNewRun={() => setView('wizard')} />
      )}
      {view === 'detail' && <RunDetailView runId={activeRunId} />}
      {view === 'wizard' && (
        <NewRunWizard employerId={employerId} addToast={addToast} onDone={backToHistory} onCancel={backToHistory} />
      )}
    </EmployerSlidePanel>
  );
}

// =============================================================================
// View 1 — history list
// =============================================================================

function HistoryView({ employerId, onOpenRun, onNewRun }) {
  const { data: runs = [], isLoading, isError, error, refetch } = useContributionRuns(employerId);
  const isCold = isLoading && runs.length === 0;

  return (
    <>
      <div className={styles.historyHead}>
        <p className={styles.intro}>
          A run posts the employer contribution to every active member for a period.
          Each figure is computed server-side from the company funding model.
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
          body="Start your first run to fund your members for the current period."
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

/** Employer + grand totals shown on each history card + the detail header. */
function RunTotals({ run }) {
  return (
    <span className={styles.runTotals}>
      <span className={styles.totalChip}>
        <span className={styles.totalChipLabel}>Employer</span>
        <span className={styles.totalChipValue}>{formatUGX(run.employerTotal)}</span>
      </span>
      <span className={styles.totalChip} data-grand="true">
        <span className={styles.totalChipLabel}>Grand total</span>
        <span className={styles.totalChipValue}>{formatUGX(run.grandTotal)}</span>
      </span>
    </span>
  );
}

// =============================================================================
// View 2 — run detail (header totals + per-member employer-source lines)
// =============================================================================

function RunDetailView({ runId }) {
  const { data, isLoading, isError, error, refetch } = useContributionRun(runId);
  const isCold = isLoading && !data;

  if (isCold) return <SkeletonRow count={6} variant="compact" label="Loading run detail" />;
  if (isError) return <ErrorCard title="We couldn't load this run" message={error} onRetry={refetch} />;
  if (!data || !data.run) {
    return <EmptyState kind="no-data" title="Run not found" body="This run is no longer available." />;
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
          {formatDate(run.runAt)} · {formatNumber(lines.length)} {lines.length === 1 ? 'member' : 'members'}
        </p>
        <RunTotals run={run} />
      </div>

      {lines.length === 0 ? (
        <EmptyState kind="no-data" title="No line items" body="This run funded no members." />
      ) : (
        <div className={styles.lineTable} role="table" aria-label="Run line items">
          <div className={styles.lineHead} role="row">
            <span role="columnheader" className={styles.colEmp}>Member</span>
            <span role="columnheader" className={styles.colNum}>Employer</span>
            <span role="columnheader" className={styles.colSplit}>Ret / Emg</span>
            <span role="columnheader" className={styles.colMethod}>Method</span>
          </div>
          <ul className={styles.lineBody}>
            {lines.map((line) => (
              <li key={line.id} role="row" className={styles.lineRow}>
                <span role="cell" className={styles.colEmp}>{line.memberName || line.subscriberId}</span>
                <span role="cell" className={styles.colNum} data-strong="true">
                  {formatUGX(line.amount, { compact: false })}
                </span>
                <span role="cell" className={styles.colSplit}>
                  {formatUGX(line.retirementAmount, { compact: false })} / {formatUGX(line.emergencyAmount, { compact: false })}
                </span>
                <span role="cell" className={styles.colMethod}>{line.method || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// =============================================================================
// View 3 — new-run wizard (period + method → confirm)
// =============================================================================

function NewRunWizard({ employerId, addToast, onDone, onCancel }) {
  const { data: employees = [], isLoading, isError, error, refetch } = useEmployees(employerId);
  const { data: employer } = useEmployer(employerId);
  const runContribution = useRunContribution(employerId);

  const [stepIndex, setStepIndex] = useState(0);
  const [periodLabel, setPeriodLabel] = useState(defaultPeriodLabel);
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const submittingRef = useRef(false);

  const config = employer?.defaultContributionConfig ?? null;
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'active'), [employees]);
  const suspendedCount = employees.length - activeEmployees.length;

  // Live preview totals (client mirror of the server math — DISPLAY ONLY).
  const preview = useMemo(() => {
    let employerTotal = 0;
    let funded = 0;
    for (const emp of activeEmployees) {
      const amt = previewEmployerAmount(emp, config);
      if (amt > 0) {
        employerTotal += amt;
        funded += 1;
      }
    }
    return { employerTotal, funded };
  }, [activeEmployees, config]);

  const isPending = runContribution.isPending;

  function next() {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleConfirm() {
    if (submittingRef.current || isPending) return;
    submittingRef.current = true;
    const nonce =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await runContribution.mutateAsync({ periodLabel, method, nonce });
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

  if (isLoading && employees.length === 0) {
    return <SkeletonRow count={6} variant="compact" label="Loading members" />;
  }
  if (isError) {
    return <ErrorCard title="We couldn't load the roster" message={error} onRetry={refetch} />;
  }

  return (
    <div className={styles.wizard}>
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

      {/* Step 1 — period + method */}
      {stepIndex === 0 && (
        <div className={styles.stepBody}>
          <p className={styles.intro}>
            <strong>Company funding:</strong> {companyFundingLabel(config)}
          </p>
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
            <select id="run-method" className={styles.select} value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className={styles.previewPanel} aria-live="polite">
            <p className={styles.previewTitle}>
              Estimated employer contribution for {formatNumber(preview.funded)} active {preview.funded === 1 ? 'member' : 'members'}
            </p>
            <p className={styles.previewNote}>Advisory preview — the server re-derives final figures on submit.</p>
            <div className={styles.previewGrid}>
              <div className={styles.previewCell} data-grand="true">
                <span className={styles.previewCellLabel}>Employer total</span>
                <span className={styles.previewCellValue}>{formatUGX(preview.employerTotal, { compact: false })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — confirm */}
      {stepIndex === 1 && (
        <div className={styles.stepBody}>
          <div className={styles.summaryCard}>
            <dl className={styles.summaryList}>
              <div className={styles.summaryItem}>
                <dt>Members funded</dt>
                <dd>{formatNumber(preview.funded)} active</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Period</dt>
                <dd>{periodLabel || '—'}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>Method</dt>
                <dd>{method}</dd>
              </div>
              <div className={styles.summaryItem} data-grand="true">
                <dt>Employer total</dt>
                <dd>{formatUGX(preview.employerTotal, { compact: false })}</dd>
              </div>
            </dl>
            <p className={styles.confirmNote}>
              Final amounts are computed server-side from the company funding model.
              {suspendedCount > 0 ? ` ${formatNumber(suspendedCount)} inactive member(s) are skipped automatically.` : ''}
            </p>
          </div>
        </div>
      )}

      <div className={styles.wizardFooter}>
        {stepIndex === 0 ? (
          <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={isPending}>Cancel</button>
        ) : (
          <button type="button" className={styles.ghostBtn} onClick={back} disabled={isPending}>Back</button>
        )}

        {stepIndex < WIZARD_STEPS.length - 1 ? (
          <button type="button" className={styles.primaryBtn} onClick={next} disabled={preview.funded === 0}>
            Continue
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleConfirm}
            disabled={isPending || preview.funded === 0}
            aria-busy={isPending || undefined}
          >
            {isPending ? 'Recording…' : `Confirm & record (${formatNumber(preview.funded)})`}
          </button>
        )}
      </div>
    </div>
  );
}
