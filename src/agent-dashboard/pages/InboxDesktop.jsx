import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { useAgentTickets } from '../../hooks/useTickets';
import { TICKET_STATUS } from '../../data/ticketsSeed';
import ErrorCard from '../../components/feedback/ErrorCard';
import SearchFilter from '../../components/reports/SearchFilter';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import TicketListRow from '../../components/tickets/TicketListRow';
import { ThreadPanel } from '../inbox/ThreadPanel';
import { NewConversationPanel } from '../inbox/NewConversationPanel';
import styles from './InboxDesktop.module.css';

// Mirrors the mobile FILTERS contract exactly — same ids, labels and predicates
// so the desktop list filters identically to the shipped mobile page.
const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'open', label: 'Open', match: (t) => t.status === TICKET_STATUS.OPEN },
  { id: 'closed', label: 'Closed', match: (t) => t.status === TICKET_STATUS.CLOSED },
];

/**
 * InboxDesktop — the ≥1024px agent "Inbox" tab-root.
 *
 * Tab-root, so the page body owns a PLAIN <h1> (no back chevron, no hero dome —
 * those belong to PageHeader on sub-pages). The desktop top bar renders no <h1>.
 *
 * The shipped mobile inbox (single-column list that swaps to a full-screen
 * thread on tap) is left byte-identical. This is a side-by-side master/detail:
 * a left ticket-list pane (rows + search + status chips + the subscriberId
 * focus bar) and a right thread pane that shows the selected conversation via
 * the shared ThreadPanel — the same interactive surface (ThreadView +
 * ReplyComposer + ThreadActions) the mobile page uses. Selection lives in local
 * `selectedId` state; opening a thread marks it read once and resets the reply
 * draft (both behaviours owned by ThreadPanel / ReplyComposer, unchanged).
 *
 * Calls the SAME data hooks as the mobile page — React Query dedupes by cache
 * key, so the wide layout adds no extra fetch.
 */
export default function InboxDesktop() {
  const { agentId } = useAgentScope();
  const [searchParams, setSearchParams] = useSearchParams();

  // ?subscriberId= focuses the list on one subscriber's threads (the
  // "View tickets" affordance on a subscriber's detail page links here). On
  // desktop it filters the list AND highlights the matching row.
  const subscriberFilter = searchParams.get('subscriberId') || '';

  // No status arg → shares the ['tickets','agent',id,'all'] cache key with the
  // nav unread badge (one fetch + poll). Open/closed filtered client-side.
  const { data: tickets = [], isLoading, isError, error, refetch } = useAgentTickets(agentId);
  // Roster (already cached for the rest of the agent dashboard) labels rows +
  // the focus bar with a real name instead of a bare id.
  const { data: subscribers = [] } = useAgentSubscribers(agentId);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  // Set when "Message → Platform chat" deep-links to a subscriber who has no
  // existing thread → the right pane shows a fresh-conversation composer.
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
  const isEmpty = !isLoading && !isError && filtered.length === 0;
  // Distinguish "no tickets at all" from "filtered to zero" so the copy stays
  // honest (mirrors the mobile no-data vs no-match split).
  const isUnfiltered = search.trim() === '' && filter === 'all' && !subscriberFilter;

  // The selected ticket may scroll out of the filtered set; resolve its label
  // from the full ticket list so the thread header stays correct.
  const selectedTicket = tickets.find((t) => t.id === selectedId) || null;

  function clearSubscriberFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('subscriberId');
    setSearchParams(next, { replace: true });
  }

  // Deep-link from "Message → Platform chat": ?subscriberId=…&open=1. Once
  // tickets resolve, open that subscriber's most recent thread in the right
  // pane, or a fresh-conversation composer if they have none, then consume the
  // ?open flag.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!subscriberFilter || searchParams.get('open') == null || isLoading) return;
    autoOpenedRef.current = true;
    const match = tickets.find((t) => t.subscriberId === subscriberFilter);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    if (match) setSelectedId(match.id);
    else setComposeSubscriberId(subscriberFilter);
  }, [subscriberFilter, searchParams, isLoading, tickets, setSearchParams]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>Inbox</h1>
        <p className={styles.subtitle}>
          {loading ? (
            'Loading your inbox…'
          ) : (
            <>
              <strong>{counts.open}</strong> open · <strong>{counts.closed}</strong> closed
              {' · '}
              <strong className={counts.unanswered > 0 ? styles.awaiting : undefined}>
                {counts.unanswered}
              </strong>{' '}
              awaiting reply
            </>
          )}
        </p>
      </header>

      <div className={styles.split}>
        {/* ── Left: ticket list ─────────────────────────────── */}
        <section className={styles.listPane} aria-label="Tickets">
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
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder="Search by subject or subscriber…"
            />
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
            {loading && <SkeletonRow count={6} label="Loading your inbox" />}
            {isError && !isLoading && (
              <div className={styles.stateWrap}>
                <ErrorCard
                  title="We couldn't load your inbox"
                  message={error}
                  onRetry={refetch}
                />
              </div>
            )}
            {isEmpty && (
              <div className={styles.stateWrap}>
                {isUnfiltered ? (
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
                )}
              </div>
            )}
            {!loading && !isError && filtered.map((ticket) => (
              <div
                key={ticket.id}
                className={styles.rowWrap}
                data-selected={ticket.id === selectedId || undefined}
                data-focused={
                  subscriberFilter && ticket.subscriberId === subscriberFilter ? true : undefined
                }
              >
                <TicketListRow
                  ticket={ticket}
                  unreadFor="agent"
                  subtitle={subscriberName(ticket.subscriberId)}
                  onClick={() => { setComposeSubscriberId(null); setSelectedId(ticket.id); }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Right: selected thread ────────────────────────── */}
        <section className={styles.threadPane} aria-label="Conversation">
          {selectedId ? (
            <ThreadPanel
              ticketId={selectedId}
              participantLabel={subscriberName(selectedTicket?.subscriberId)}
              onBack={() => setSelectedId(null)}
            />
          ) : composeSubscriberId ? (
            <NewConversationPanel
              agentId={agentId}
              subscriberId={composeSubscriberId}
              participantLabel={subscriberName(composeSubscriberId)}
              onBack={() => setComposeSubscriberId(null)}
              onCreated={(ticketId) => { setComposeSubscriberId(null); setSelectedId(ticketId); }}
            />
          ) : (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
                  <path
                    d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7A2.5 2.5 0 0117.5 16H9l-4 4v-4H6.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className={styles.placeholderTitle}>Select a conversation</p>
              <p className={styles.placeholderBody}>
                Choose a ticket on the left to read the thread and reply to your subscriber.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
