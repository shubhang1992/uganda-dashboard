import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEntity, useChildren } from '../../hooks/useEntity';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { EASE_OUT_EXPO } from '../../utils/finance';
import BranchHealthScore from './BranchHealthScore';
import OperationsSection from './OperationsSection';
import styles from './BranchOverview.module.css';

// Panel widths in split mode → used to compute the overview's right padding
// so the dashboard reflows just enough to make space for the active panel.
// 24px gap on either side of the panel: padding = width + 48.
const PANEL_PADDING = {
  agents: 560 + 48,
  commissions: 600 + 48,
  reports: 680 + 48,
  settings: 460 + 48,
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export default function BranchOverview({ branchId }) {
  const { user } = useAuth();
  const {
    viewAgentsOpen,
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
    <motion.div
      className={styles.overview}
      data-split={splitState || undefined}
      initial={false}
      animate={{ paddingRight: targetPaddingRight }}
      transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
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
    </motion.div>
  );
}
