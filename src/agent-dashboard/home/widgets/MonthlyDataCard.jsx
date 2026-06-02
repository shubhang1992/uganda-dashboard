import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUGX, formatNumber } from '../../../utils/currency';
import { useAgentSubscribers, useAgentContributions } from '../../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import {
  computeAgentHomeSummary,
  deriveMonthAnchors,
  isOnboardedSince,
  pendingContributors,
  monthRangeIso,
} from '../agentHomeSummary';
import styles from './MonthlyDataCard.module.css';

/**
 * MonthlyDataCard — mobile-only card under the agent home dome. A 2×2 grid of
 * the month's headline metrics: contribution volume, commissions owed,
 * subscribers onboarded this month, and subscribers yet to contribute.
 *
 * Each tile is its OWN drill-down: tapping navigates to a focused view of the
 * underlying data (commissions reuses the existing /dashboard/commissions page;
 * the other three are dedicated routes). The "Yet to contribute" view also lets
 * the agent nudge subscribers (WhatsApp / SMS / platform message).
 *
 * The onboarded / yet-to-contribute counts use the SAME shared predicates
 * (deriveMonthAnchors + isOnboardedSince/isPendingContribution from
 * agentHomeSummary) as the drill-down pages, so a tile count always equals the
 * length of its list.
 *
 * NOTE (E2E contract): the literal string "Monthly contribution volume" MUST
 * stay present and visible here on mobile — the agent-dashboard smoke spec
 * asserts getByText on it (the desktop KPI row carries the same string, so the
 * two never co-render in one viewport).
 */
export default function MonthlyDataCard({ agentId }) {
  const navigate = useNavigate();
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: detail } = useAgentCommissionDetail(agentId);

  // Window for "this month" derived from the book's latest dates (CLAUDE.md §4 —
  // no demo-clock import); used to fetch this month's contributions so "yet to
  // contribute" matches the Contributions drill-down exactly.
  const { onboardStart, contribStart } = useMemo(
    () => deriveMonthAnchors(subscribers),
    [subscribers],
  );
  const range = useMemo(() => monthRangeIso(contribStart), [contribStart]);
  const { data: contributions = [] } = useAgentContributions(
    agentId,
    subscribers.length ? range : {},
  );

  const { monthly, onboardedThisMonth, pendingContribution } = useMemo(() => {
    const monthly = computeAgentHomeSummary(subscribers, null).monthly;
    const onboardedThisMonth = subscribers.filter((s) => isOnboardedSince(s, onboardStart)).length;
    const pendingContribution = pendingContributors(subscribers, contributions).length;
    return { monthly, onboardedThisMonth, pendingContribution };
  }, [subscribers, contributions, onboardStart]);

  // Mirror CommissionsSnapshotCard's fallback verbatim so the owed figure here,
  // the desktop "Owed" KPI tile, and the Commissions page never disagree.
  const totalDue = useMemo(() => {
    const due = detail?.dueTransactions || [];
    return detail?.totalDue ?? due.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [detail]);

  const tiles = [
    {
      key: 'volume',
      label: 'Monthly contribution volume',
      value: formatUGX(monthly),
      to: '/dashboard/contributions',
      aria: 'View contributions this month',
    },
    {
      key: 'owed',
      label: 'Commissions owed',
      value: formatUGX(totalDue),
      to: '/dashboard/commissions',
      aria: 'View commissions',
    },
    {
      key: 'onboarded',
      label: 'Onboarded this month',
      value: formatNumber(onboardedThisMonth),
      to: '/dashboard/onboarded-this-month',
      aria: 'View subscribers onboarded this month',
    },
    {
      key: 'pending',
      label: 'Yet to contribute',
      value: formatNumber(pendingContribution),
      to: '/dashboard/yet-to-contribute',
      aria: 'View subscribers yet to contribute',
    },
  ];

  return (
    <section className={styles.card} aria-label="Monthly data">
      <header className={styles.head}>
        <span className={styles.eyebrow}>Monthly data</span>
      </header>

      <div className={styles.statGrid}>
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={styles.stat}
            onClick={() => navigate(t.to)}
            aria-label={t.aria}
          >
            <span className={styles.statLabel}>{t.label}</span>
            <span className={styles.statValue}>{t.value}</span>
            <span className={styles.statChevron} aria-hidden="true">
              <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
