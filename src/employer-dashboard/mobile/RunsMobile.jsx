import { useState, useEffect } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useToast } from '../../contexts/ToastContext';
import { useContributionRuns } from '../../hooks/useEmployer';
import { formatUGX } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import { RunDetailView, NewRunWizard } from '../runs/runViews';
import { useEmployerAppBar } from '../shell/employerAppBarContext';
import s from './employerMobile.module.css';

const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * RunsMobile — Contribution Runs on the phone. A local history↔detail↔wizard
 * state machine (mirroring RunsDesktop) that reuses the shared runViews
 * (RunDetailView / NewRunWizard) for the detail + wizard. Registers an app-bar
 * back handler so the persistent back steps history←detail/wizard before leaving
 * the route. The wizard stays mounted for the whole 'wizard' view (its nonce is
 * minted once per mount — never remount it mid-flow).
 */
export default function RunsMobile() {
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();
  const { registerBack } = useEmployerAppBar();

  const [view, setView] = useState('history'); // 'history' | 'detail' | 'wizard'
  const [activeRunId, setActiveRunId] = useState(null);

  const { data: runs = [], isLoading, isError, error, refetch } = useContributionRuns(employerId);
  const isCold = isLoading && runs.length === 0;

  // Step the persistent app-bar back through the in-page views before leaving.
  useEffect(() => {
    if (view === 'history') return undefined;
    const title = view === 'detail' ? 'Run detail' : 'New run';
    return registerBack(() => { setView('history'); setActiveRunId(null); }, title);
  }, [view, registerBack]);

  function backToHistory() {
    setView('history');
    setActiveRunId(null);
  }

  if (view === 'detail') {
    return (
      <div className={s.page}>
        <RunDetailView runId={activeRunId} />
      </div>
    );
  }

  if (view === 'wizard') {
    return (
      <div className={s.page}>
        <NewRunWizard employerId={employerId} addToast={addToast} onDone={backToHistory} onCancel={backToHistory} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.grad}`}>
        <div className={s.eyebrow}>Contribution runs</div>
        <p style={{ fontSize: 12.5, color: 'var(--color-gray)', lineHeight: 1.55, marginTop: 7 }}>
          A run posts the employer contribution to every active member for a period. Each figure is computed from your company funding model.
        </p>
        <button type="button" className={`${s.btn} ${s.btnPri} ${s.btnBlock}`} style={{ marginTop: 14 }} onClick={() => setView('wizard')}>
          {PlusIcon}New contribution run
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
          cta={{ label: 'New contribution run', onClick: () => setView('wizard') }}
        />
      ) : (
        runs.map((run) => (
          <button
            key={run.id}
            type="button"
            className={s.runcard}
            onClick={() => { setActiveRunId(run.id); setView('detail'); }}
            aria-label={`Open ${run.periodLabel || 'run'} details`}
          >
            <div className={s.runTop}>
              <div>
                <div className={s.pd}>{run.periodLabel || 'Untitled run'}</div>
                <div className={s.dt}>{formatDate(run.runAt)}</div>
              </div>
              <span className={`${s.pill} ${run.status === 'completed' ? s.pillOk : s.pillWarn}`}>
                <i />{run.status === 'completed' ? 'Completed' : 'Draft'}
              </span>
            </div>
            <div className={s.totchips}>
              <div className={s.totchip}><small>Employee</small><b>{formatUGX(run.employeeTotal, { compact: true })}</b></div>
              <div className={s.totchip}><small>Employer</small><b>{formatUGX(run.employerTotal, { compact: true })}</b></div>
              {Number(run.insuranceTotal ?? 0) > 0 && (
                <div className={s.totchip}><small>Insurance</small><b>{formatUGX(run.insuranceTotal, { compact: true })}</b></div>
              )}
              <div className={`${s.totchip} ${s.grand}`}><small>Grand total</small><b>{formatUGX(run.grandTotal, { compact: true })}</b></div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
