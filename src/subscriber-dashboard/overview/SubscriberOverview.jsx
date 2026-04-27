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
    : null;

  const splitState = activePanel !== null;
  const targetPaddingRight = splitState && !isMobile ? PANEL_PADDING[activePanel] : undefined;

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
      data-split={splitState || undefined}
      style={targetPaddingRight ? { paddingRight: targetPaddingRight } : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      <BalanceHero subscriber={sub} user={user} split={splitState} />
      {!splitState && <YourGoalCard />}
    </motion.div>
  );
}
