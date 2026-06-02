import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { formatNumber } from '../../../utils/currency';
import { useAuth } from '../../../contexts/AuthContext';
import { useEntity } from '../../../hooks/useEntity';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useCountUp } from '../../../hooks/useCountUp';
import { useAgentUnreadTicketCount } from '../../../hooks/useTickets';
import { useAgentHeaderChrome } from '../../shell/AgentHeaderChrome';
import HeroCapsule from '../../../components/HeroCapsule';
import { computeAgentHomeSummary } from '../agentHomeSummary';
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
 * TOTAL (lifetime) CONTRIBUTIONS as the headline metric and a stat row of
 * subscribers · active %. Monthly volume + commissions owed now live in the
 * MonthlyDataCard directly below the dome.
 *
 * NOTE (E2E contract): the literal string "Monthly contribution volume" used to
 * live here; on mobile it now lives on MonthlyDataCard's stat label (and on the
 * desktop KPI row). The smoke spec asserts getByText on it across both viewports.
 */
export default function PulseCard({ agentId }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const { data: agent } = useEntity('agent', agentId);
  const { data: subscribers = [] } = useAgentSubscribers(agentId);

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
    const { monthly, active, total, activePct } = computeAgentHomeSummary(subscribers, null);
    // Lifetime/all-time contributions — the headline metric. Summed inline the
    // same way PortfolioCard derives `portfolio.lifetime` (totalContributions per
    // subscriber); computeAgentHomeSummary does not return this figure.
    let lifetime = 0;
    for (const s of subscribers) lifetime += s.totalContributions || 0;
    return { monthly, active, total, activePct, lifetime };
  }, [subscribers]);

  // useCountUp returns 0 when run is false (reduced-motion), so snap to the
  // resolved lifetime figure in that case instead of showing a stuck "0".
  const counted = useCountUp(summary.lifetime, 1100, !reduce);
  // Mirror formatUGX/PortfolioCard: a non-positive lifetime (some demo books net
  // negative) renders as '—' rather than a literal "0" or a negative number.
  const hasLifetime = Number.isFinite(summary.lifetime) && summary.lifetime > 0;
  const amountLabel = hasLifetime
    ? formatNumber(Math.round(reduce ? summary.lifetime : counted))
    : '—';

  const statRow = (
    <>
      <span>
        <strong>{formatNumber(summary.total)}</strong> subscriber{summary.total === 1 ? '' : 's'}
      </span>
      <span>
        <strong>{summary.activePct}%</strong> active
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
        eyebrow="Total contributions"
        prefix={hasLifetime ? 'UGX' : undefined}
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
