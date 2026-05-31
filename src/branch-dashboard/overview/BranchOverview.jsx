import { useMemo } from 'react';
import { useEntity, useChildren, useEntityMetrics, useChildrenMetrics } from '../../hooks/useEntity';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useIsMobile } from '../../hooks/useIsMobile';
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
  const { data: branch } = useEntity('branch', branchId);
  const { data: agentsRaw = [] } = useChildren('branch', branchId);
  const { data: commissionSummary } = useEntityCommissionSummary('branch', branchId);
  // Live rollup overlays — branch.metrics from the entity mapper is EMPTY_METRICS
  // under Supabase, and each agent.metrics is similarly zero. Without these
  // merges the gauge, KPIs, leaderboard, demographics and alerts all read 0.
  const { data: branchMetrics } = useEntityMetrics('branch', branchId);
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

  if (!branch) {
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
