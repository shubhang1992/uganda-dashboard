import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { monthlyEquivalent } from '../../../utils/finance';
import { formatUGX, formatNumber } from '../../../utils/currency';
import { useAuth } from '../../../contexts/AuthContext';
import { useEntity } from '../../../hooks/useEntity';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import { useCountUp } from '../../../hooks/useCountUp';
import { useAgentUnreadTicketCount } from '../../../hooks/useTickets';
import { useAgentHeaderChrome } from '../../shell/AgentHeaderChrome';
import HeroCapsule from '../../../components/HeroCapsule';
import styles from './PulseCard.module.css';

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// Cap the numeric badge so a busy inbox never blows out the icon footprint.
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

/**
 * PulseCard — the agent home dome. Wraps the shared HeroCapsule (same pattern
 * as the subscriber PulseCard) so the greeting renders as the page <h1>, with
 * MONTHLY CONTRIBUTION VOLUME as the headline metric and a stat row of
 * subscribers · active % · lifetime commissions.
 *
 * NOTE (E2E contract): the literal string "Monthly contribution volume" MUST
 * stay present and visible on Home — the smoke spec asserts getByText on it.
 */
export default function PulseCard({ agentId }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const { data: agent } = useEntity('agent', agentId);
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: commissionDetail } = useAgentCommissionDetail(agentId);

  // Unread support badge for the inbox action — shared hook dedupes into the
  // same ['tickets','agent',id,'all'] fetch/poll as the Inbox page + BottomTabBar.
  const unreadCount = useAgentUnreadTicketCount(agentId);
  const hasUnread = unreadCount > 0;

  // Notification bell for the dome's top-left (mobile only; desktop sidebar owns
  // the bell). The inbox stays the dome's own top-right action below, so we omit
  // the chrome's inbox to avoid doubling it up.
  const headerChrome = useAgentHeaderChrome({ showInbox: false });

  const firstName = (user?.name || agent?.name || 'there').split(' ')[0];
  const greeting = `Good ${hourGreeting()}, ${firstName}`;

  const summary = useMemo(() => {
    let monthly = 0;
    let active = 0;
    for (const s of subscribers) {
      monthly += monthlyEquivalent(s.contributionSchedule);
      if (s.isActive) active += 1;
    }
    const total = subscribers.length;
    const activePct = total > 0 ? Math.round((active / total) * 100) : 0;
    return { monthly, active, total, activePct };
  }, [subscribers]);

  const commissionsTotal = useMemo(() => {
    // Flat `due → paid` flow: lifetime commissions = the total paid figure the
    // detail already sums (falls back to summing paid lines if absent).
    if (commissionDetail?.totalPaid != null) return commissionDetail.totalPaid;
    return (commissionDetail?.paidTransactions || []).reduce(
      (sum, c) => sum + (c.amount || 0),
      0,
    );
  }, [commissionDetail]);

  // useCountUp returns 0 when run is false (reduced-motion), so snap to the
  // resolved monthly figure in that case instead of showing a stuck "0".
  const counted = useCountUp(summary.monthly, 1100, !reduce);
  const amountLabel = formatNumber(Math.round(reduce ? summary.monthly : counted));

  const statRow = (
    <>
      <span>
        <strong>{formatNumber(summary.total)}</strong> subscriber{summary.total === 1 ? '' : 's'}
      </span>
      <span>
        <strong>{summary.activePct}%</strong> active
      </span>
      <span>
        <strong>{formatUGX(commissionsTotal)}</strong> commissions
      </span>
    </>
  );

  // Instagram-style "Direct" paper-airplane glyph — the icon users associate
  // with DMs/messages. Badge sits at its upper-right corner (white-on-indigo so
  // it reads against the dome; CLAUDE.md reserves red for errors only).
  const inboxIcon = (
    <span className={styles.inboxIcon}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="21" height="21">
        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {hasUnread && (
        <span className={styles.inboxBadge} aria-hidden="true">{badgeText(unreadCount)}</span>
      )}
    </span>
  );

  return (
    <section className={styles.wrap} aria-label="Portfolio overview">
      <HeroCapsule
        title={greeting}
        eyebrow="Monthly contribution volume"
        prefix="UGX"
        amount={amountLabel}
        statRow={statRow}
        leadingSlot={headerChrome.leadingSlot}
        menuIcon={inboxIcon}
        menuLabel={hasUnread ? `Open your inbox (${unreadCount} unread)` : 'Open your inbox'}
        onMenu={() => navigate('/dashboard/inbox')}
      />
    </section>
  );
}
