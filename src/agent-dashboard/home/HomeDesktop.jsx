import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX, formatNumber } from '../../utils/currency';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../hooks/useCommission';
import { computeAgentHomeSummary } from './agentHomeSummary';
import KpiCard from '../../dashboard/shared/KpiCard';
import PortfolioCard from './widgets/PortfolioCard';
import CommissionsSnapshotCard from './widgets/CommissionsSnapshotCard';
import CoPilotWidget from './widgets/CoPilotWidget';
import NotificationCenterCard from '../../components/notifications/NotificationCenterCard';
import styles from './HomeDesktop.module.css';

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
};

// KPI glyphs. Stroke-only line icons (indigo by default, tinted per-tile by
// KpiCard's nth-child rules), kept aria-hidden — the visible label carries the
// meaning. Sized to KpiCard's 34px icon box.
const SubscribersIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <circle cx="7.5" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 17c0-2.8 2.5-4.5 5.5-4.5S13 14.2 13 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14 4.2a3 3 0 010 5.6M15.5 12.6c1.8.5 3 1.9 3 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const VolumeIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <path d="M3 14l4-4 3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 6h-4M16 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const EarnedIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12.5 7.5c-.6-.9-1.6-1.3-2.7-1.3-1.5 0-2.6.8-2.6 2 0 2.7 5.4 1.3 5.4 4 0 1.3-1.2 2.1-2.8 2.1-1.2 0-2.2-.4-2.8-1.4M10 5v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const OwedIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 10h.01M14.5 10h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * HomeDesktop — the ≥1024px agent Home tab-root.
 *
 * Tab-root, so the page body owns a PLAIN <h1> (no back chevron, no hero dome —
 * those belong to PageHeader on sub-pages). The desktop top bar renders no <h1>.
 *
 * The shipped mobile Home (HeroCapsule dome + stacked widgets) is left
 * untouched; this is a wider surface: a KPI tile row sourced from the SAME
 * shared selector (computeAgentHomeSummary) the mobile PulseCard reads, so every
 * figure matches the dome, above a responsive grid that REUSES the existing
 * PortfolioCard / CommissionsSnapshotCard / NotificationCenterCard / CoPilotWidget
 * widgets (each owns its own loading state; React Query dedupes the shared
 * fetches across the dome's selector + the reused widgets).
 *
 * NOTE (E2E contract): the KPI label string "Monthly contribution volume" MUST
 * stay present and visible — the smoke spec asserts getByText on it (on mobile
 * it lives on MonthlyDataCard's stat label, since the dome now headlines TOTAL
 * contributions instead).
 */
export default function HomeDesktop() {
  const { agentId } = useAgentScope();
  const reduceMotion = useReducedMotion();
  const itemVariants = reduceMotion ? undefined : item;

  const { data: subscribers = [], isLoading: subsLoading } = useAgentSubscribers(agentId);
  const { data: commissionDetail, isLoading: commLoading } = useAgentCommissionDetail(agentId);

  // Single shared selector — same inputs, same math as the mobile PulseCard, so
  // the KPI figures equal the dome's. `total`/`monthly`/`commissionsTotal` come
  // straight from it; `totalDue` mirrors CommissionsSnapshotCard's fallback.
  const summary = useMemo(
    () => computeAgentHomeSummary(subscribers, commissionDetail),
    [subscribers, commissionDetail],
  );
  const totalDue = useMemo(() => {
    const due = commissionDetail?.dueTransactions || [];
    return commissionDetail?.totalDue ?? due.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [commissionDetail]);

  const subsResolving = subsLoading && subscribers.length === 0;
  const commResolving = commLoading && !commissionDetail;

  const kpis = [
    {
      key: 'subscribers',
      icon: SubscribersIcon,
      label: 'Subscribers',
      value: subsResolving ? '—' : formatNumber(summary.total),
    },
    {
      key: 'monthly',
      icon: VolumeIcon,
      // EXACT string — E2E contract. Do not reword.
      label: 'Monthly contribution volume',
      value: subsResolving ? '—' : formatUGX(summary.monthly),
    },
    {
      key: 'earned',
      icon: EarnedIcon,
      label: 'Earned',
      value: commResolving ? '—' : formatUGX(summary.commissionsTotal),
      to: '/dashboard/commissions/earned',
    },
    {
      key: 'owed',
      icon: OwedIcon,
      label: 'Owed',
      value: commResolving ? '—' : formatUGX(totalDue),
      to: '/dashboard/commissions/owed',
    },
  ];

  return (
    <motion.div
      className={styles.page}
      variants={reduceMotion ? undefined : stagger}
      initial={reduceMotion ? false : 'initial'}
      animate={reduceMotion ? false : 'animate'}
    >
      <motion.header variants={itemVariants} className={styles.head}>
        <p className={styles.eyebrow}>Your portfolio</p>
        <h1 className={styles.title}>Home</h1>
        <p className={styles.subtitle}>A snapshot of your book, contributions and commissions.</p>
      </motion.header>

      <motion.div variants={itemVariants} className={styles.kpiRow}>
        {kpis.map((kpi) =>
          kpi.to ? (
            <Link key={kpi.key} to={kpi.to} className={styles.kpiLink}>
              <KpiCard
                icon={kpi.icon}
                label={kpi.label}
                value={kpi.value}
                className={styles.kpiTile}
              />
            </Link>
          ) : (
            <KpiCard
              key={kpi.key}
              icon={kpi.icon}
              label={kpi.label}
              value={kpi.value}
              className={styles.kpiTile}
            />
          ),
        )}
      </motion.div>

      <div className={styles.grid}>
        <motion.div variants={itemVariants} className={styles.slotPortfolio}>
          <PortfolioCard agentId={agentId} />
        </motion.div>
        <motion.div variants={itemVariants} className={styles.slotCommissions}>
          <CommissionsSnapshotCard agentId={agentId} />
        </motion.div>
        <motion.div variants={itemVariants} className={styles.slotNotifications}>
          <NotificationCenterCard role="agent" entityId={agentId} />
        </motion.div>
        <motion.div variants={itemVariants} className={styles.slotCopilot}>
          <CoPilotWidget agentId={agentId} />
        </motion.div>
      </div>
    </motion.div>
  );
}
