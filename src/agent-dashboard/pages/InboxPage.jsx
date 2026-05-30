import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import {
  useAgentTickets,
  useTicketThread,
  useSendMessage,
  useCloseTicket,
  useReopenTicket,
  useMarkTicketRead,
} from '../../hooks/useTickets';
import { SENDER_ROLE, TICKET_STATUS } from '../../data/ticketsSeed';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../../components/PageHeader';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import TicketListRow from '../../components/tickets/TicketListRow';
import ThreadView from '../../components/tickets/ThreadView';
import styles from './InboxPage.module.css';

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'open', label: 'Open', match: (t) => t.status === TICKET_STATUS.OPEN },
  { id: 'closed', label: 'Closed', match: (t) => t.status === TICKET_STATUS.CLOSED },
];

const BODY_MAX = 1000;

// ─── Agent reply composer ────────────────────────────────────────────────────
// There is no Phase 0 composer primitive — each interactive role builds its own
// small textarea + Send pair and hands it to ThreadView's footer. Send wires to
// useSendMessage({ sender: 'agent', body }); a closed ticket disables the input
// (the agent reopens first via the header action).
function ReplyComposer({ ticketId, disabled }) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(ticketId);
  const trimmed = body.trim();
  const canSend = !disabled && !sendMessage.isPending && trimmed !== '';

  // Clear the draft when switching threads so one ticket's reply never bleeds
  // into another. Reset during render on the ticketId change (React's
  // "you might not need an effect" pattern, as used in RaiseIssueSheet) rather
  // than in an effect, which avoids the extra commit + a cascading-render lint.
  const [lastTicketId, setLastTicketId] = useState(ticketId);
  if (ticketId !== lastTicketId) {
    setLastTicketId(ticketId);
    setBody('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    try {
      await sendMessage.mutateAsync({ sender: SENDER_ROLE.AGENT, body: trimmed });
      setBody('');
    } catch {
      // Optimistic update rolled back by the hook; keep the draft so the agent
      // can retry without retyping.
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        className={styles.composerInput}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={disabled ? 'Reopen this ticket to reply' : 'Type a reply to your subscriber…'}
        rows={1}
        maxLength={BODY_MAX}
        disabled={disabled || sendMessage.isPending}
        aria-label="Reply to subscriber"
      />
      <button type="submit" className={styles.composerSend} disabled={!canSend} aria-label="Send reply">
        {sendMessage.isPending ? (
          <span className={styles.composerSpinner} aria-hidden="true" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="M4 12l15-7-5 15-3.5-5.5L4 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </form>
  );
}

// ─── Header actions (Resolve / Close · Reopen) ───────────────────────────────
function ThreadActions({ ticketId, status }) {
  const closeTicket = useCloseTicket(ticketId);
  const reopenTicket = useReopenTicket(ticketId);
  const isOpen = status === TICKET_STATUS.OPEN;

  if (isOpen) {
    return (
      <button
        type="button"
        className={styles.actionBtn}
        onClick={() => closeTicket.mutate({ by: SENDER_ROLE.AGENT })}
        disabled={closeTicket.isPending}
      >
        <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none">
          <path d="M2.5 6.2l2.3 2.3L9.5 3.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Resolve
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
      onClick={() => reopenTicket.mutate({ by: SENDER_ROLE.AGENT })}
      disabled={reopenTicket.isPending}
    >
      <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none">
        <path d="M9.5 6a3.5 3.5 0 11-1-2.45M9.5 2v2H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Reopen
    </button>
  );
}

// ─── Selected-thread surface ─────────────────────────────────────────────────
// Pulls the full thread, marks it read for the agent once on open, and renders
// the shared ThreadView with an agent composer + Close/Reopen actions.
function ThreadPanel({ ticketId, participantLabel, onBack }) {
  const { data: ticket, isLoading, isError, error, refetch } = useTicketThread(ticketId);
  const markRead = useMarkTicketRead(ticketId);

  // Mark read exactly once per opened ticket. The mutation is idempotent (it
  // zeroes the agent's unread counter), but we still guard so a poll-driven
  // refetch doesn't re-fire it.
  const markedRef = useRef(null);
  useEffect(() => {
    if (!ticket || markedRef.current === ticketId) return;
    if ((ticket.unread?.agent ?? 0) > 0) {
      markRead.mutate({ viewer: SENDER_ROLE.AGENT });
    }
    markedRef.current = ticketId;
  }, [ticket, ticketId, markRead]);

  const status = ticket?.status;
  const isClosed = status === TICKET_STATUS.CLOSED;

  return (
    <div className={styles.threadWrap}>
      <ThreadView
        ticket={ticket}
        messages={ticket?.messages ?? []}
        currentRole="agent"
        participantLabel={participantLabel}
        onBack={onBack}
        loading={isLoading && !ticket}
        error={isError ? error : undefined}
        onRetry={refetch}
        headerActions={ticket ? <ThreadActions ticketId={ticketId} status={status} /> : null}
        footer={ticket ? <ReplyComposer ticketId={ticketId} disabled={isClosed} /> : null}
      />
    </div>
  );
}

export default function InboxPage() {
  const reducedMotion = useReducedMotion();
  const { agentId } = useAgentScope();
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

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

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
