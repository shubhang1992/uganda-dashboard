import { useMemo } from 'react';
import { useEntity, useChildren, useEntityMetrics, useChildrenMetrics } from '../../hooks/useEntity';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import ErrorCard from '../../components/feedback/ErrorCard';
import BranchHealthScore from './BranchHealthScore';
import OperationsSection from './OperationsSection';
import NotificationCenterCard from '../../components/notifications/NotificationCenterCard';
import styles from './BranchOverview.module.css';

// Panel widths in split mode → used to compute the overview's right padding
// so the dashboard reflows just enough to make space for the active panel.
// 24px gap on either side of the panel: padding = width + 48.
const PANEL_PADDING = {
  agents: 560 + 48,
  createAgent: 460 + 48,
  commissions: 600 + 48,
  reports: 680 + 48,
  settings: 460 + 48,
};

export default function BranchOverview() {
  const { user } = useAuth();
  const { branchId } = useBranchScope();
  const {
    viewAgentsOpen,
    createAgentOpen,
    commissionsOpen,
    viewReportsOpen,
    settingsOpen,
  } = useDashboard();
  const {
    data: branch,
    isLoading: branchLoading,
    isError: branchError,
    error: branchErr,
    refetch: refetchBranch,
  } = useEntity('branch', branchId);
  const {
    data: agentsRaw = [],
    isError: agentsError,
    refetch: refetchAgents,
  } = useChildren('branch', branchId);
  const { data: commissionSummary } = useEntityCommissionSummary('branch', branchId);
  // Live rollup overlays — branch.metrics from the entity mapper is EMPTY_METRICS
  // under Supabase, and each agent.metrics is similarly zero. Without these
  // merges the gauge, KPIs, leaderboard, demographics and alerts all read 0.
  const {
    data: branchMetrics,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useEntityMetrics('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);
  const agents = useMemo(
    () => agentsRaw.map(a => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics })),
    [agentsRaw, agentMetricsMap],
  );
  const isMobile = useIsMobile();

  // Which panel (if any) is currently driving split view
  const activePanel = viewAgentsOpen
    ? 'agents'
    : createAgentOpen
    ? 'createAgent'
    : commissionsOpen
    ? 'commissions'
    : viewReportsOpen
    ? 'reports'
    : settingsOpen
    ? 'settings'
    : null;

  const splitState = activePanel !== null;
  // On mobile, panels go full-screen — no need to squish the overview
  const targetPaddingRight = splitState && !isMobile ? PANEL_PADDING[activePanel] : 24;

  const metrics = branchMetrics ?? branch?.metrics ?? {};

  // Cold-load guard — spinner only on a genuine first fetch.
  const isCold = branchLoading && !branch;
  // Any errored query (or a branch query that settled with no data and is no
  // longer loading) means we can't render a trustworthy dashboard. The branch +
  // its metrics drive the gauge/KPIs and the agents feed the leaderboard/alerts,
  // so surface ONE actionable ErrorCard with a combined retry rather than an
  // infinite spinner or a silently-zeroed "healthy" dashboard.
  const hasError =
    branchError ||
    metricsError ||
    agentsError ||
    (!branch && !branchLoading);

  function retryAll() {
    refetchBranch();
    refetchMetrics();
    refetchAgents();
  }

  if (hasError) {
    return (
      <ErrorCard
        title="We couldn't load your dashboard"
        message={branchErr}
        onRetry={retryAll}
      />
    );
  }

  if (isCold) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div
      className={styles.overview}
      data-split={splitState || undefined}
      style={{ paddingRight: targetPaddingRight }}
    >
      <BranchHealthScore
        metrics={metrics}
        agents={agents}
        branch={branch}
        user={user}
        commissionSummary={commissionSummary}
        split={splitState}
      />

      {branchId && (
        <div className={styles.notifyWrap}>
          <NotificationCenterCard role="branch" entityId={branchId} />
        </div>
      )}

      <div className={styles.opsWrap}>
        <OperationsSection agents={agents} commissionSummary={commissionSummary} metrics={metrics} />
      </div>
    </div>
  );
}
