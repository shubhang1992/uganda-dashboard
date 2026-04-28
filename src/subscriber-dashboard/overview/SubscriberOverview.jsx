import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { useDashboard } from '../../contexts/DashboardContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../contexts/AuthContext';
import BalanceHero from './BalanceHero';
import YourGoalCard from './YourGoalCard';
import styles from './SubscriberOverview.module.css';

/* Panel widths in split mode → used to compute the overview's right padding
   so the dashboard reflows just enough to make space for the active panel.
   24px gap on either side of the panel: padding = width + 48. */
const PANEL_PADDING = {
  contribute: 600 + 48,
  withdraw: 600 + 48,
  insurance: 640 + 48,
  nominees: 600 + 48,
  help: 600 + 48,
  reports: 680 + 48,
  settings: 460 + 48,
  contributionSettings: 680 + 48,
  yourGoal: 600 + 48,
  agentContact: 520 + 48,
};

export default function SubscriberOverview() {
  const { user } = useAuth();
  const { data: sub, isLoading } = useCurrentSubscriber();
  const isMobile = useIsMobile();
  const {
    contributeOpen,
    withdrawOpen,
    insuranceOpen,
    nomineesOpen,
    helpOpen,
    subscriberReportsOpen,
    settingsOpen,
    contributionSettingsOpen,
    yourGoalOpen,
    agentContactOpen,
  } = useDashboard();

  const activePanel = contributeOpen
    ? 'contribute'
    : withdrawOpen
    ? 'withdraw'
    : insuranceOpen
    ? 'insurance'
    : nomineesOpen
    ? 'nominees'
    : helpOpen
    ? 'help'
    : subscriberReportsOpen
    ? 'reports'
    : settingsOpen
    ? 'settings'
    : contributionSettingsOpen
    ? 'contributionSettings'
    : yourGoalOpen
    ? 'yourGoal'
    : agentContactOpen
    ? 'agentContact'
    : null;

  const splitState = activePanel !== null;
  const targetPaddingRight = splitState && !isMobile ? PANEL_PADDING[activePanel] : undefined;

  // Lag the split prop given to BalanceHero so its internal reflow (grid
  // template changes that can't transition in CSS) happens partway through
  // the panel's slide animation instead of snapping at the very start.
  const [innerSplit, setInnerSplit] = useState(splitState);
  useEffect(() => {
    const t = setTimeout(() => setInnerSplit(splitState), 220);
    return () => clearTimeout(t);
  }, [splitState]);

  if (isLoading || !sub) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <motion.div
      className={styles.overview}
      data-split={innerSplit || undefined}
      style={targetPaddingRight ? { paddingRight: targetPaddingRight } : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      <BalanceHero subscriber={sub} user={user} split={innerSplit} />
      {!innerSplit && <YourGoalCard />}
    </motion.div>
  );
}
