import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX, formatNumber } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useEntity } from '../../hooks/useEntity';
import { useCountUp } from '../../hooks/useCountUp';
import { useAgentSubscribers, useAgentContributions } from '../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../hooks/useCommission';
import {
  computeAgentHomeSummary,
  deriveMonthAnchors,
  isOnboardedSince,
  pendingContributors,
  monthRangeIso,
} from './agentHomeSummary';
import MetricTile from '../../dashboard/shared/MetricTile';
import QuickActions from './widgets/QuickActions';
import CoPilotWidget from './widgets/CoPilotWidget';
import styles from './HomeDesktop.module.css';

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
};

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// KPI glyphs — stroke-only line icons, aria-hidden (the label carries meaning),
// sized to the MetricTile 36px icon chip. One per monthly metric, matching the
// mobile MonthlyDataCard tiles.
const VolumeIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <path d="M3 14l4-4 3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 6h-4M16 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const OwedIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 10h.01M14.5 10h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const OnboardedIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 17c0-2.8 2.4-4.5 5.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M15 11v5M17.5 13.5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const PendingIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 6v4l2.5 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// Primary-tile glyph — a stacked-layers mark reading as "the whole book".
const PortfolioIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="none">
    <path d="M10 2.5l7 3.5-7 3.5-7-3.5 7-3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M3 10l7 3.5 7-3.5M3 13.5l7 3.5 7-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * HomeDesktop — the ≥1024px agent Home tab-root.
 *
 * Mirrors the SHIPPED MOBILE Home one-for-one so the two viewports never drift:
 *   • a Total-contributions hero (the desktop equivalent of the PulseCard dome —
 *     lifetime UGX headline + subscribers · active%),
 *   • a 4-tile monthly metric row that reproduces MonthlyDataCard EXACTLY —
 *     same labels, same shared selectors, same drill-down routes (Monthly
 *     contribution volume → /contributions, Commissions owed → /commissions,
 *     Onboarded this month → /onboarded-this-month, Yet to contribute →
 *     /yet-to-contribute),
 *   • QuickActions (Onboard / View subscribers) and the Co-Pilot — the same
 *     widgets the mobile Home renders.
 *
 * The previous desktop fork showed a different, book-centric metric set
 * (PortfolioCard "Your subscriber book" + active-vs-dormant, a Commissions
 * snapshot, a NotificationCenter, and an Earned KPI) that the mobile Home no
 * longer leads with. This rebuild brings desktop back in line with the phone.
 *
 * E2E contract: the KPI label "Monthly contribution volume" MUST stay present —
 * the agent smoke spec asserts getByText on it at the 1440×900 desktop viewport.
 */
export default function HomeDesktop() {
  const { agentId } = useAgentScope();
  const reduceMotion = useReducedMotion();
  const itemVariants = reduceMotion ? undefined : item;

  const { user } = useAuth();
  const { data: agent } = useEntity('agent', agentId);
  const { data: subscribers = [], isLoading: subsLoading } = useAgentSubscribers(agentId);
  const { data: detail } = useAgentCommissionDetail(agentId);

  // "This month" window derived from the book's latest dates (CLAUDE.md §4 — no
  // demo-clock import), identical to MonthlyDataCard, so "yet to contribute"
  // matches the Contributions drill-down exactly.
  const { onboardStart, contribStart } = useMemo(
    () => deriveMonthAnchors(subscribers),
    [subscribers],
  );
  const range = useMemo(() => monthRangeIso(contribStart), [contribStart]);
  const { data: contributions = [] } = useAgentContributions(
    agentId,
    subscribers.length ? range : {},
  );

  // All figures share the SAME selectors as the mobile dome + MonthlyDataCard.
  const summary = useMemo(() => {
    const { monthly, total, activePct } = computeAgentHomeSummary(subscribers, null);
    let lifetime = 0;
    for (const s of subscribers) lifetime += s.totalContributions || 0;
    const onboardedThisMonth = subscribers.filter((s) => isOnboardedSince(s, onboardStart)).length;
    const pendingContribution = pendingContributors(subscribers, contributions).length;
    return { monthly, total, activePct, lifetime, onboardedThisMonth, pendingContribution };
  }, [subscribers, contributions, onboardStart]);

  // Owed mirrors CommissionsSnapshotCard / MonthlyDataCard's fallback verbatim.
  const totalDue = useMemo(() => {
    const due = detail?.dueTransactions || [];
    return detail?.totalDue ?? due.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [detail]);

  const subsResolving = subsLoading && subscribers.length === 0;
  const hasLifetime = Number.isFinite(summary.lifetime) && summary.lifetime > 0;
  const dueCount = (detail?.dueTransactions || []).length;
  const totalLabel = formatNumber(summary.total);

  // Lifetime count-up for the primary tile — useCountUp returns 0 under reduced
  // motion (run=false), so snap to the resolved lifetime in that case.
  const lifetimeCounted = useCountUp(summary.lifetime, 1100, !reduceMotion);
  const lifetimeDisplay = hasLifetime
    ? formatUGX(reduceMotion ? summary.lifetime : lifetimeCounted, { compact: false })
    : '—';

  const firstName = (user?.name || agent?.name || 'there').split(' ')[0];
  const greeting = `Good ${hourGreeting()}, ${firstName}`;

  // 4 monthly metrics — same labels + drill-down routes as MonthlyDataCard.
  // Accent is explicit per tile (not :nth-child) because each tile is wrapped in
  // a <Link>; an explicit accent keeps the tints correct under the wrapper.
  const kpis = [
    {
      key: 'volume',
      icon: VolumeIcon,
      accent: 'indigo',
      label: 'Monthly contribution volume',
      value: subsResolving ? '—' : formatUGX(summary.monthly),
      context: 'This month',
      to: '/dashboard/contributions',
    },
    {
      key: 'owed',
      icon: OwedIcon,
      accent: 'teal',
      label: 'Commissions owed',
      value: formatUGX(totalDue),
      context: dueCount > 0 ? `${formatNumber(dueCount)} pending` : 'All settled',
      to: '/dashboard/commissions',
    },
    {
      key: 'onboarded',
      icon: OnboardedIcon,
      accent: 'lavender',
      label: 'Onboarded this month',
      value: subsResolving ? '—' : formatNumber(summary.onboardedThisMonth),
      context: subsResolving ? null : `of ${totalLabel} total`,
      to: '/dashboard/onboarded-this-month',
    },
    {
      key: 'pending',
      icon: PendingIcon,
      accent: 'green',
      label: 'Yet to contribute',
      value: subsResolving ? '—' : formatNumber(summary.pendingContribution),
      context: subsResolving ? null : `of ${totalLabel} total`,
      to: '/dashboard/yet-to-contribute',
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
        <h1 className={styles.title}>{greeting}</h1>
      </motion.header>

      {/* Total-contributions primary tile — the desktop equivalent of the mobile
          dome: the lifetime UGX headline (count-up) + subscribers · active% row. */}
      <motion.div variants={itemVariants}>
        <MetricTile
          variant="primary"
          icon={PortfolioIcon}
          label="Total contributions"
          value={lifetimeDisplay}
          statRow={hasLifetime ? (
            <>
              <span>
                <strong>{totalLabel}</strong> subscriber{summary.total === 1 ? '' : 's'}
              </span>
              <span className={styles.heroDot} aria-hidden="true" />
              <span>
                <strong>{summary.activePct}%</strong> active
              </span>
            </>
          ) : null}
        />
      </motion.div>

      <motion.div variants={itemVariants} className={styles.kpiRow}>
        {kpis.map((kpi) => (
          <Link
            key={kpi.key}
            to={kpi.to}
            className={styles.kpiLink}
            aria-label={`${kpi.label}: ${kpi.value}`}
          >
            <MetricTile
              accent={kpi.accent}
              icon={kpi.icon}
              label={kpi.label}
              value={kpi.value}
              context={kpi.context}
            />
          </Link>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className={styles.slotActions}>
        <QuickActions />
      </motion.div>

      <motion.div variants={itemVariants} className={styles.slotCopilot}>
        <CoPilotWidget agentId={agentId} />
      </motion.div>
    </motion.div>
  );
}
