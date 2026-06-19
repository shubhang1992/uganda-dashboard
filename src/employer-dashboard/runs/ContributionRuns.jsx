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
//
// This file is now a THIN wrapper: the three views (HistoryView, RunDetailView,
// NewRunWizard) live in ./runViews so the desktop page (desktop/RunsDesktop.jsx)
// can replay the SAME flow in-page. This panel keeps only the view/activeRunId
// state machine + panel chrome + close-reset effect (mobile behaviour unchanged).

import { useState, useEffect, useCallback } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useToast } from '../../contexts/ToastContext';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { HistoryView, RunDetailView, NewRunWizard } from './runViews';
import styles from './ContributionRuns.module.css';

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
