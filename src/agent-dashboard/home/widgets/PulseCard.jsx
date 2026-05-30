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
import { useAgentTickets } from '../../../hooks/useTickets';
import { TICKET_STATUS } from '../../../data/ticketsSeed';
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

  // Unread support badge for the inbox action. Calling useAgentTickets with no
  // status arg shares the ['tickets','agent',id,'all'] cache key with the Inbox
  // page + BottomTabBar, so this dedupes into the same fetch/poll (no extra
  // request). Sum the agent's unread counter over OPEN tickets only — a closed
  // ticket carries no actionable unread.
  const { data: agentTickets } = useAgentTickets(agentId);
  const unreadCount = (agentTickets ?? []).reduce(
    (sum, t) => (t.status === TICKET_STATUS.OPEN ? sum + (t.unread?.agent ?? 0) : sum),
    0,
  );
  const hasUnread = unreadCount > 0;

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
    const all = commissionDetail?.commissions || [];
    let paid = 0;
    for (const c of all) {
      if (c.status === 'released' || c.status === 'confirmed') paid += c.amount || 0;
    }
    return paid;
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
        menuIcon={inboxIcon}
        menuLabel={hasUnread ? `Open your inbox (${unreadCount} unread)` : 'Open your inbox'}
        onMenu={() => navigate('/dashboard/inbox')}
      />
    </section>
  );
}
