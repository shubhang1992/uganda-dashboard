import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatNumber } from '../../utils/currency';
import { useCurrentSubscriber, useSubscriberAgent } from '../../hooks/useSubscriber';
import { useToast } from '../../contexts/ToastContext';
import {
  useSubscriberTickets,
  useTicketThread,
  useCreateTicket,
  useSendMessage,
  useCloseTicket,
  useReopenTicket,
  useMarkTicketRead,
} from '../../hooks/useTickets';
import { TICKET_STATUS, SENDER_ROLE } from '../../data/ticketsSeed';
import { getInitials } from '../../utils/dashboard';
import PageHeader from '../../components/PageHeader';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import TicketListRow from '../../components/tickets/TicketListRow';
import ThreadView from '../../components/tickets/ThreadView';
import RaiseIssueSheet from '../../components/tickets/RaiseIssueSheet';
import styles from './AgentPage.module.css';

function formatTenure(months) {
  if (!Number.isFinite(months)) return '—';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} yr${years === 1 ? '' : 's'}` : `${years} yr ${rem} mo`;
}

const STATUS_FILTERS = [
  { id: TICKET_STATUS.OPEN, label: 'Open' },
  { id: TICKET_STATUS.CLOSED, label: 'Closed' },
];

// ─── Reply composer (subscriber side) ───────────────────────────────────────
// Each interactive role owns its own small composer and hands it to
// ThreadView's footer slot. Sends as SENDER_ROLE.SUBSCRIBER; clears on success
// and disables while pending or empty.
function ReplyComposer({ ticketId }) {
  const [body, setBody] = useState('');
  const { mutate, isPending } = useSendMessage(ticketId);
  const { addToast } = useToast();

  const trimmed = body.trim();
  const canSend = trimmed !== '' && !isPending;

  const send = useCallback(() => {
    if (!canSend) return;
    mutate(
      { sender: SENDER_ROLE.SUBSCRIBER, body: trimmed },
      {
        onSuccess: () => setBody(''),
        onError: (err) =>
          addToast('error', err?.message || 'Could not send your message — please try again.'),
      },
    );
  }, [canSend, mutate, trimmed, addToast]);

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.composerInput}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Write a reply…"
        aria-label="Write a reply"
        rows={2}
        disabled={isPending}
      />
      <button
        type="button"
        className={styles.composerSend}
        onClick={send}
        disabled={!canSend}
        aria-label="Send reply"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="15" height="15">
          <path d="M2 8l12-6-6 12V8H2z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

// ─── Close / Reopen action (subscriber side) ─────────────────────────────────
// Passed to ThreadView's headerActions. Open → "Close ticket"; closed → "Reopen".
function ThreadActions({ ticket }) {
  const close = useCloseTicket(ticket.id);
  const reopen = useReopenTicket(ticket.id);
  const { addToast } = useToast();

  if (ticket.status === TICKET_STATUS.OPEN) {
    return (
      <button
        type="button"
        className={styles.threadAction}
        onClick={() =>
          close.mutate(
            { by: SENDER_ROLE.SUBSCRIBER },
            { onError: (err) => addToast('error', err?.message || 'Could not close this ticket.') },
          )
        }
        disabled={close.isPending}
      >
        Close ticket
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.threadAction}
      data-tone="reopen"
      onClick={() =>
        reopen.mutate(
          { by: SENDER_ROLE.SUBSCRIBER },
          { onError: (err) => addToast('error', err?.message || 'Could not reopen this ticket.') },
        )
      }
      disabled={reopen.isPending}
    >
      Reopen
    </button>
  );
}

// ─── Thread view (one selected ticket) ───────────────────────────────────────
function TicketThread({ ticketId, agentName, onBack }) {
  const { data: thread, isLoading, isError, error, refetch } = useTicketThread(ticketId);
  const markRead = useMarkTicketRead(ticketId);

  // Clear the subscriber's unread badge once when the thread opens. Keyed on the
  // ticket id so re-renders don't re-fire; the mutation is optimistic so the
  // badge clears instantly.
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    markReadMutate({ viewer: SENDER_ROLE.SUBSCRIBER });
  }, [ticketId, markReadMutate]);

  return (
    <ThreadView
      ticket={thread}
      messages={thread?.messages ?? []}
      currentRole="subscriber"
      participantLabel={agentName}
      onBack={onBack}
      loading={isLoading}
      error={isError ? error : undefined}
      onRetry={refetch}
      headerActions={thread ? <ThreadActions ticket={thread} /> : undefined}
      footer={thread ? <ReplyComposer ticketId={ticketId} /> : undefined}
    />
  );
}

export default function AgentPage() {
  const reducedMotion = useReducedMotion();
  const { data: sub } = useCurrentSubscriber();
  const subId = sub?.id;
  const { data: agent } = useSubscriberAgent(subId);
  const { addToast } = useToast();

  // Local view state mirrors HelpPage's list ⇄ thread idiom.
  const [view, setView] = useState('list'); // list | thread
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [statusFilter, setStatusFilter] = useState(TICKET_STATUS.OPEN);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fetch the subscriber's tickets ONCE (no status arg) and filter client-side,
  // mirroring SubscribersPage. This keeps a single cache entry + poll.
  const {
    data: tickets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useSubscriberTickets(subId);

  const createTicket = useCreateTicket(subId);

  const counts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const t of tickets) {
      if (t.status === TICKET_STATUS.CLOSED) closed += 1;
      else open += 1;
    }
    return { [TICKET_STATUS.OPEN]: open, [TICKET_STATUS.CLOSED]: closed };
  }, [tickets]);

  const filtered = useMemo(
    () => tickets.filter((t) => t.status === statusFilter),
    [tickets, statusFilter],
  );

  const loading = isLoading && tickets.length === 0;
  const hasNoTickets = !isLoading && !isError && tickets.length === 0;

  const openThread = useCallback((ticket) => {
    setSelectedTicketId(ticket.id);
    setView('thread');
  }, []);

  const handleCreate = useCallback(
    async (payload) => {
      await createTicket.mutateAsync(payload);
      addToast('success', 'Your issue has been sent to your agent.');
      setSheetOpen(false);
    },
    [createTicket, addToast],
  );

  const initials = getInitials(agent?.name || '');
  const ratingLabel = agent?.rating ? `${agent.rating.toFixed(1)} ★` : null;
  const responseLabel = agent?.avgResponseHours
    ? `~${agent.avgResponseHours < 1 ? '<1' : Math.round(agent.avgResponseHours)}h reply`
    : null;

  return (
    <div className={styles.page} data-view={view}>
      <PageHeader
        variant="hero"
        title={agent?.name || 'Your agent'}
        subtitle={agent?.branchName ? `${agent.branchName} branch` : null}
        fallback="/dashboard"
        onBack={view === 'thread' ? () => setView('list') : undefined}
      />

      <div className={styles.body}>
        {!agent ? (
          <div className={styles.loading}>
            <span className={styles.spinner} aria-hidden="true" />
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {view === 'list' ? (
              <motion.div
                key="list"
                className={styles.step}
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE_OUT_EXPO }}
              >
                <section className={styles.profile}>
                  <div className={styles.profileTop}>
                    <span
                      className={styles.avatar}
                      data-status={agent.status === 'active' ? 'online' : 'offline'}
                      aria-hidden="true"
                    >
                      {initials}
                      <span className={styles.statusDot} />
                    </span>
                    <div className={styles.profileMain}>
                      <div className={styles.profileName}>{agent.name}</div>
                      <div className={styles.profileBadges}>
                        {ratingLabel && (
                          <span className={styles.badge} data-tone="rating">{ratingLabel}</span>
                        )}
                        {responseLabel && (
                          <span className={styles.badge}>{responseLabel}</span>
                        )}
                        <span className={styles.badge}>
                          {formatTenure(agent.tenureMonths)} at UP
                        </span>
                      </div>
                    </div>
                  </div>

                  <ul className={styles.contactRow}>
                    <li>
                      <a className={styles.contactBtn} href={`tel:${agent.phone}`} aria-label={`Call ${agent.name}`}>
                        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <path d="M3 2h2.5l1.2 3-1.6 1.1a8 8 0 003.8 3.8L10 8.3l3 1.2V12a1.5 1.5 0 01-1.5 1.5A11 11 0 011.5 3.5 1.5 1.5 0 013 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        </svg>
                        Call
                      </a>
                    </li>
                    <li>
                      <a className={styles.contactBtn} href={`mailto:${agent.email}`} aria-label={`Email ${agent.name}`}>
                        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                          <path d="M2 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Email
                      </a>
                    </li>
                  </ul>

                  {(agent.specialties?.length > 0 || agent.languages?.length > 0) && (
                    <dl className={styles.profileMeta}>
                      {agent.specialties?.length > 0 && (
                        <div className={styles.metaRow}>
                          <dt>Specialties</dt>
                          <dd>{agent.specialties.join(' · ')}</dd>
                        </div>
                      )}
                      {agent.languages?.length > 0 && (
                        <div className={styles.metaRow}>
                          <dt>Languages</dt>
                          <dd>{agent.languages.join(', ')}</dd>
                        </div>
                      )}
                      {Number.isFinite(agent.subscribersManaged) && (
                        <div className={styles.metaRow}>
                          <dt>Looking after</dt>
                          <dd>{formatNumber(agent.subscribersManaged)} savers</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </section>

                <section className={styles.tickets}>
                  <div className={styles.ticketsHead}>
                    <div className={styles.ticketsTitle}>Your issues</div>
                    <button
                      type="button"
                      className={styles.raiseBtn}
                      onClick={() => setSheetOpen(true)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                      Raise an issue
                    </button>
                  </div>

                  {!hasNoTickets && (
                    <PillChipGroup label="Filter your issues" layout="row" className={styles.filters}>
                      {STATUS_FILTERS.map((f) => (
                        <PillChip
                          key={f.id}
                          selected={statusFilter === f.id}
                          onClick={() => setStatusFilter(f.id)}
                        >
                          {f.label}
                          <span className={styles.filterCount}>{counts[f.id]}</span>
                        </PillChip>
                      ))}
                    </PillChipGroup>
                  )}

                  <div className={styles.list}>
                    {loading && <SkeletonRow count={4} label="Loading your issues" />}

                    {isError && !isLoading && (
                      <ErrorCard
                        title="We couldn't load your issues"
                        message={error}
                        onRetry={refetch}
                      />
                    )}

                    {hasNoTickets && (
                      <EmptyState
                        kind="no-data"
                        title="No issues yet"
                        body="Have a question for your agent? Raise an issue and they'll reply right here."
                        cta={{ label: 'Raise an issue', onClick: () => setSheetOpen(true) }}
                      />
                    )}

                    {!loading && !isError && !hasNoTickets && filtered.length === 0 && (
                      <EmptyState
                        kind="no-match"
                        title={statusFilter === TICKET_STATUS.OPEN ? 'No open issues' : 'No closed issues'}
                        body={
                          statusFilter === TICKET_STATUS.OPEN
                            ? 'Nothing open right now. Switch to Closed to see resolved issues.'
                            : 'No resolved issues yet. Switch to Open to see active ones.'
                        }
                      />
                    )}

                    {!loading && !isError &&
                      filtered.map((ticket) => (
                        <TicketListRow
                          key={ticket.id}
                          ticket={ticket}
                          unreadFor="subscriber"
                          onClick={openThread}
                        />
                      ))}
                  </div>
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="thread"
                className={styles.threadStep}
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE_OUT_EXPO }}
              >
                <TicketThread
                  ticketId={selectedTicketId}
                  agentName={agent.name}
                  onBack={() => setView('list')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <RaiseIssueSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleCreate}
        submitting={createTicket.isPending}
      />
    </div>
  );
}
