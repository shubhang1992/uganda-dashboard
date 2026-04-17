import { useEntity, useChildren } from '../../hooks/useEntity';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import BranchHealthScore from './BranchHealthScore';
import OperationsSection from './OperationsSection';
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

export default function BranchOverview({ branchId }) {
  const { user } = useAuth();
  const {
    viewAgentsOpen,
    createAgentOpen,
    commissionsOpen,
    viewReportsOpen,
    settingsOpen,
  } = useDashboard();
  const { data: branch } = useEntity('branch', branchId);
  const { data: agents = [] } = useChildren('branch', branchId);
  const { data: commissionSummary } = useEntityCommissionSummary('branch', branchId);
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

  const metrics = branch?.metrics || {};

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

      <div className={styles.opsWrap}>
        <OperationsSection agents={agents} commissionSummary={commissionSummary} metrics={metrics} />
      </div>
    </div>
  );
}
