import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { useAgentTickets } from '../../hooks/useTickets';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import InboxDesktop from './InboxDesktop';
import { TICKET_STATUS } from '../../data/ticketsSeed';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../../components/PageHeader';
import { useAgentHeaderChrome } from '../shell/AgentHeaderChrome';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import TicketListRow from '../../components/tickets/TicketListRow';
import { ThreadPanel } from '../inbox/ThreadPanel';
import { NewConversationPanel } from '../inbox/NewConversationPanel';
import styles from './InboxPage.module.css';

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'open', label: 'Open', match: (t) => t.status === TICKET_STATUS.OPEN },
  { id: 'closed', label: 'Closed', match: (t) => t.status === TICKET_STATUS.CLOSED },
];

export default function InboxPage() {
  const reducedMotion = useReducedMotion();
  const { agentId } = useAgentScope();
  // Bell only — an inbox button on the inbox page itself would be redundant.
  const headerChrome = useAgentHeaderChrome({ showInbox: false });
  const [searchParams, setSearchParams] = useSearchParams();

  // ?subscriberId= pre-filters the list to one subscriber's threads (the
  // "View tickets" affordance on a subscriber's detail page links here).
  const subscriberFilter = searchParams.get('subscriberId') || '';

  // Fetch with NO status arg so this view shares the ['tickets','agent',id,'all']
  // cache key with the nav unread badge — one fetch + poll, not two. Open/closed
  // is filtered client-side below.
  const { data: tickets = [], isLoading, isError, error, refetch } = useAgentTickets(agentId);
  // Subscriber roster (already cached for the rest of the agent dashboard) lets
  // us label rows + the focused filter with a real name instead of a bare id.
  const { data: subscribers = [] } = useAgentSubscribers(agentId);

  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  // Set when "Message → Platform chat" deep-links to a subscriber who has no
  // existing thread → render a fresh-conversation composer instead of a list.
  const [composeSubscriberId, setComposeSubscriberId] = useState(null);

  const nameById = useMemo(() => {
    const map = new Map();
    subscribers.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [subscribers]);

  const subscriberName = (id) => nameById.get(id) || id;

  const counts = useMemo(() => {
    let open = 0;
    let closed = 0;
    let unanswered = 0;
    tickets.forEach((t) => {
      if (t.status === TICKET_STATUS.OPEN) {
        open += 1;
        if ((t.unread?.agent ?? 0) > 0) unanswered += 1;
      } else {
        closed += 1;
      }
    });
    return { open, closed, unanswered, total: tickets.length };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchFilter = FILTERS.find((f) => f.id === filter)?.match ?? (() => true);
    return tickets.filter((t) => {
      if (subscriberFilter && t.subscriberId !== subscriberFilter) return false;
      if (!matchFilter(t)) return false;
      if (q) {
        const hay = `${t.subject} ${t.subscriberId} ${subscriberName(t.subscriberId)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // subscriberName closes over nameById, which is in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, filter, search, subscriberFilter, nameById]);

  const loading = isLoading && tickets.length === 0;

  function clearSubscriberFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('subscriberId');
    setSearchParams(next, { replace: true });
  }

  // Deep-link from "Message → Platform chat": ?subscriberId=…&open=1. Once
  // tickets resolve, open that subscriber's most recent thread, or drop into a
  // fresh-conversation composer if they have none, then consume the ?open flag.
  // Mobile only — on desktop this component renders <InboxDesktop/>, which owns
  // the same logic; running it here too would race to consume the URL flag.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (isDesktop || autoOpenedRef.current) return;
    if (!subscriberFilter || searchParams.get('open') == null || isLoading) return;
    autoOpenedRef.current = true;
    const match = tickets.find((t) => t.subscriberId === subscriberFilter);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    if (match) setSelectedId(match.id);
    else setComposeSubscriberId(subscriberFilter);
  }, [isDesktop, subscriberFilter, searchParams, isLoading, tickets, setSearchParams]);

  if (isDesktop) return <InboxDesktop />;

  // ── New-conversation mode (no existing thread for this subscriber) ──
  if (composeSubscriberId) {
    return (
      <div className={styles.page} data-mode="thread">
        <NewConversationPanel
          agentId={agentId}
          subscriberId={composeSubscriberId}
          participantLabel={subscriberName(composeSubscriberId)}
          onBack={() => setComposeSubscriberId(null)}
          onCreated={(ticketId) => { setComposeSubscriberId(null); setSelectedId(ticketId); }}
        />
      </div>
    );
  }

  // ── Thread mode ──
  if (selectedId) {
    return (
      <div className={styles.page} data-mode="thread">
        <ThreadPanel
          ticketId={selectedId}
          participantLabel={subscriberName(
            tickets.find((t) => t.id === selectedId)?.subscriberId,
          )}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  // ── List mode ──
  return (
    <div className={styles.page}>
      <PageHeader
        variant="hero"
        eyebrow="SUPPORT"
        title="Inbox"
        showBack={false}
        leadingSlot={headerChrome.leadingSlot}
        amount={loading ? '—' : counts.open}
        subtitle={loading ? undefined : 'open conversations'}
        statRow={loading ? (
          <span style={{ opacity: 0.6 }}>Loading your inbox…</span>
        ) : (
          <>
            <span><strong>{counts.open}</strong> open</span>
            <span><strong>{counts.closed}</strong> closed</span>
            <span>
              <strong style={counts.unanswered > 0 ? { color: 'var(--color-amber)' } : undefined}>
                {counts.unanswered}
              </strong> awaiting reply
            </span>
          </>
        )}
      />

      <div className={styles.body}>
        <motion.div
          className={styles.stack}
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {subscriberFilter && (
            <div className={styles.focusBar}>
              <span className={styles.focusText}>
                Showing tickets for <strong>{subscriberName(subscriberFilter)}</strong>
              </span>
              <button type="button" className={styles.focusClear} onClick={clearSubscriberFilter}>
                Clear filter
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                className={styles.search}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by subject or subscriber…"
                aria-label="Search tickets"
                spellCheck={false}
              />
            </div>
            <PillChipGroup label="Filter tickets" layout="row" className={styles.filters}>
              {FILTERS.map((f) => (
                <PillChip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                  {f.id !== 'all' && (
                    <span className={styles.filterCount}>
                      {f.id === 'open' ? counts.open : counts.closed}
                    </span>
                  )}
                </PillChip>
              ))}
            </PillChipGroup>
          </div>

          <div className={styles.list}>
            {loading && (
              <SkeletonRow count={6} label="Loading your inbox" />
            )}
            {isError && !isLoading && (
              <ErrorCard
                title="We couldn't load your inbox"
                message={error}
                onRetry={refetch}
              />
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              search.trim() === '' && filter === 'all' && !subscriberFilter ? (
                <EmptyState
                  kind="no-data"
                  title="No tickets yet."
                  body="When a subscriber raises an issue, their conversation lands here."
                />
              ) : (
                <EmptyState
                  kind="no-match"
                  title="No tickets match"
                  body="Try clearing the search, switching the filter, or removing the subscriber focus."
                />
              )
            )}
            {filtered.map((ticket) => (
              <TicketListRow
                key={ticket.id}
                ticket={ticket}
                unreadFor="agent"
                subtitle={subscriberName(ticket.subscriberId)}
                onClick={() => setSelectedId(ticket.id)}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
