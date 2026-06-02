// Support / Tickets panel (Phase 7) — employer↔platform support, raise + reply.
//
// Clones the branch `ViewTickets` list↔thread idiom but, unlike the view-only
// branch/distributor oversight panels, it carries a COMPOSER: the employer both
// raises new tickets (a New-ticket form) and replies inside a thread. The
// "platform support" side answers as a SYSTEM message (a canned demo reply) —
// there is no servicing agent for standalone employer staff, so these threads
// bypass the subscriber↔agent routing entirely (see employerplan.md deep dive B).
//
// Three internal views inside one EmployerSlidePanel (width 560):
//   * 'list'   — status-filtered inbox of this employer's threads + unread badges.
//   * 'thread' — the selected conversation (ThreadView) + a reply composer.
//   * 'new'    — the New-ticket form (subject / category / priority / body).
//
// Data arrives only through the ticket hooks (CLAUDE.md §4.1 — never import
// ticketsSeed/mockData from a component); the enum imports are frozen contract
// constants, not data.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useToast } from '../../contexts/ToastContext';
import {
  useEmployerTickets,
  useEmployerTicketMetrics,
  useTicketThread,
  useSendMessage,
  useCreateEmployerTicket,
  useMarkTicketRead,
} from '../../hooks/useTickets';
import {
  SENDER_ROLE,
  TICKET_STATUS,
  TICKET_CATEGORY,
  TICKET_PRIORITY,
} from '../../data/ticketsSeed';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import TicketListRow from '../../components/tickets/TicketListRow';
import ThreadView from '../../components/tickets/ThreadView';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './EmployerTickets.module.css';

// Status filter chips. 'all' is a synthetic UI value (no status filter); the
// rest map onto the frozen TICKET_STATUS contract.
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: TICKET_STATUS.OPEN, label: 'Open' },
  { value: TICKET_STATUS.CLOSED, label: 'Closed' },
];

// Title-Case category labels keyed by the frozen enum value (not the key).
const CATEGORY_LABELS = {
  [TICKET_CATEGORY.CONTRIBUTIONS]: 'Contributions',
  [TICKET_CATEGORY.WITHDRAWALS]: 'Withdrawals',
  [TICKET_CATEGORY.CLAIMS]: 'Claims',
  [TICKET_CATEGORY.NOMINEES]: 'Nominees',
  [TICKET_CATEGORY.SCHEDULE]: 'Schedule',
  [TICKET_CATEGORY.ACCOUNT]: 'Billing & account',
  [TICKET_CATEGORY.OTHER]: 'Other',
};

// Render order for the category chips — explicit so the grid stays stable.
const CATEGORY_ORDER = [
  TICKET_CATEGORY.CONTRIBUTIONS,
  TICKET_CATEGORY.ACCOUNT,
  TICKET_CATEGORY.SCHEDULE,
  TICKET_CATEGORY.CLAIMS,
  TICKET_CATEGORY.OTHER,
];

const SUBJECT_MAX = 120;
const BODY_MAX = 1000;
const PANEL_WIDTH = 560;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Reply composer — employer replies inside a thread (sender 'employer')       */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ReplyComposer({ ticketId, disabled }) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(ticketId);
  const trimmed = body.trim();
  const canSend = !disabled && !sendMessage.isPending && trimmed !== '';

  // Clear the draft when switching threads so one ticket's reply never bleeds
  // into another (reset during render on the ticketId change — React's
  // "you might not need an effect" pattern, as used across the ticket UIs).
  const [lastTicketId, setLastTicketId] = useState(ticketId);
  if (ticketId !== lastTicketId) {
    setLastTicketId(ticketId);
    setBody('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    try {
      await sendMessage.mutateAsync({ sender: SENDER_ROLE.EMPLOYER, body: trimmed });
      setBody('');
    } catch {
      // Optimistic update rolled back by the hook; keep the draft for a retry.
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        className={styles.composerInput}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={disabled ? 'This ticket is closed' : 'Type a reply to support…'}
        rows={1}
        maxLength={BODY_MAX}
        disabled={disabled || sendMessage.isPending}
        aria-label="Reply to support"
      />
      <button
        type="submit"
        className={styles.composerSend}
        disabled={!canSend}
        aria-label="Send reply"
      >
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

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  New-ticket form — the employer raises an employer↔platform ticket            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function NewTicketForm({ employerId, onCreated, onCancel }) {
  const { addToast } = useToast();
  const createTicket = useCreateEmployerTicket(employerId);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(TICKET_CATEGORY.OTHER);
  const [priority, setPriority] = useState(TICKET_PRIORITY.NORMAL);
  const [body, setBody] = useState('');

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const canSubmit = !createTicket.isPending && trimmedSubject !== '' && trimmedBody !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const created = await createTicket.mutateAsync({
        subject: trimmedSubject,
        category,
        priority,
        body: trimmedBody,
      });
      addToast('success', 'Ticket sent to support');
      onCreated?.(created);
    } catch (err) {
      addToast('error', err?.message || 'Could not send your ticket. Please try again.');
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-ticket-subject">Subject</label>
        <input
          id="emp-ticket-subject"
          type="text"
          className={styles.input}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Query about this month's contribution run"
          maxLength={SUBJECT_MAX}
          autoComplete="off"
          disabled={createTicket.isPending}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label} id="emp-ticket-category-label">Category</span>
        <PillChipGroup label="Category" layout="grid" columns={2}>
          {CATEGORY_ORDER.map((value) => (
            <PillChip
              key={value}
              selected={category === value}
              onClick={() => setCategory(value)}
              disabled={createTicket.isPending}
            >
              {CATEGORY_LABELS[value]}
            </PillChip>
          ))}
        </PillChipGroup>
      </div>

      <div className={styles.field}>
        <span className={styles.label} id="emp-ticket-priority-label">Priority</span>
        <PillChipGroup label="Priority" layout="row">
          <PillChip
            selected={priority === TICKET_PRIORITY.NORMAL}
            onClick={() => setPriority(TICKET_PRIORITY.NORMAL)}
            disabled={createTicket.isPending}
          >
            Normal
          </PillChip>
          <PillChip
            selected={priority === TICKET_PRIORITY.URGENT}
            onClick={() => setPriority(TICKET_PRIORITY.URGENT)}
            disabled={createTicket.isPending}
          >
            Urgent
          </PillChip>
        </PillChipGroup>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="emp-ticket-body">How can we help?</label>
        <textarea
          id="emp-ticket-body"
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe your question in a little detail so our team can help faster."
          rows={4}
          maxLength={BODY_MAX}
          disabled={createTicket.isPending}
        />
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => onCancel?.()}
          disabled={createTicket.isPending}
        >
          Cancel
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSubmit}>
          {createTicket.isPending ? 'Sending…' : 'Send to support'}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  EmployerTickets — employer↔platform support (raise + reply)                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function EmployerTickets({ splitMode = false }) {
  const { supportOpen, setSupportOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const { data: metrics } = useEmployerTicketMetrics(employerId);
  const {
    data: tickets = [],
    isLoading: ticketsLoading,
    isError: ticketsError,
    error: ticketsErrorObj,
    refetch: refetchTickets,
  } = useEmployerTickets(employerId);

  // View state: 'list' inbox, 'thread' conversation, 'new' raise-a-ticket form.
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const bodyRef = useRef(null);

  // Thread for the drilled-in ticket (only fetched once a row is selected).
  const {
    data: thread,
    isLoading: threadLoading,
    isError: threadError,
    error: threadErrorObj,
    refetch: refetchThread,
  } = useTicketThread(view === 'thread' ? selectedId : null);

  // Mark the open thread read for the employer once it resolves, so the unread
  // badge clears (mirrors the subscriber/agent mark-read-on-open behaviour).
  const markRead = useMarkTicketRead(selectedId);
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (view !== 'thread' || !selectedId || !thread) return;
    if ((thread.unread?.employer ?? 0) > 0) {
      markReadMutate({ viewer: SENDER_ROLE.EMPLOYER });
    }
  }, [view, selectedId, thread, markReadMutate]);

  const isCold = ticketsLoading && tickets.length === 0;

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return tickets;
    return tickets.filter((t) => t.status === statusFilter);
  }, [tickets, statusFilter]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedId) || null,
    [tickets, selectedId],
  );

  const handleClose = useCallback(() => setSupportOpen(false), [setSupportOpen]);

  function handleSelect(ticket) {
    setSelectedId(ticket.id);
    setView('thread');
  }
  function handleBack() {
    setView('list');
    setSelectedId(null);
  }
  function handleNew() {
    setView('new');
    setSelectedId(null);
  }
  function handleCreated(created) {
    // Drop straight into the freshly-created thread.
    setSelectedId(created.id);
    setView('thread');
  }

  // Reset transient state shortly after the panel closes (after the exit anim).
  useEffect(() => {
    if (supportOpen) return undefined;
    const t = setTimeout(() => {
      setView('list');
      setSelectedId(null);
      setStatusFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [supportOpen]);

  // Scroll the body to the top on a view switch.
  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [view]);

  const openCount = metrics?.openCount ?? 0;

  const headerActions =
    view === 'list' ? (
      <button type="button" className={styles.newBtn} onClick={handleNew}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        New ticket
      </button>
    ) : (
      <button type="button" className={styles.backBtn} onClick={handleBack} aria-label="Back to all tickets">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All tickets
      </button>
    );

  const panelTitle =
    view === 'new' ? 'New ticket' : view === 'thread' ? 'Conversation' : 'Support';

  const isClosed = (thread || selectedTicket)?.status === TICKET_STATUS.CLOSED;

  return (
    <EmployerSlidePanel
      open={supportOpen}
      onClose={handleClose}
      title={panelTitle}
      eyebrow="Employer · Support"
      width={PANEL_WIDTH}
      splitMode={splitMode}
      headerActions={headerActions}
    >
      <div className={styles.wrap} ref={bodyRef}>
        <AnimatePresence mode="wait">
          {/* ── List view ──────────────────────────────────────────────── */}
          {view === 'list' && (
            <motion.div
              key="emp-tk-list"
              className={styles.viewPane}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.summaryRow}>
                <span className={styles.summaryItem}>
                  <strong>{openCount}</strong> open
                </span>
                <span className={styles.summaryItem}>
                  <strong>{metrics?.closedCount ?? 0}</strong> closed
                </span>
              </div>

              <PillChipGroup label="Filter tickets by status" className={styles.statusGroup}>
                {STATUS_OPTIONS.map((opt) => (
                  <PillChip
                    key={opt.value}
                    selected={statusFilter === opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                  >
                    {opt.label}
                  </PillChip>
                ))}
              </PillChipGroup>

              {isCold ? (
                <div className={styles.listPad}>
                  <SkeletonRow count={5} label="Loading tickets" />
                </div>
              ) : ticketsError ? (
                <div className={styles.stateWrap}>
                  <ErrorCard
                    title="We couldn't load your tickets"
                    message={ticketsErrorObj}
                    onRetry={refetchTickets}
                  />
                </div>
              ) : filtered.length === 0 ? (
                <div className={styles.stateWrap}>
                  {statusFilter === 'all' ? (
                    <EmptyState
                      kind="no-data"
                      title="No tickets yet"
                      body="Raise a ticket and our support team will reply right here."
                      cta={{ label: 'New ticket', onClick: handleNew }}
                    />
                  ) : (
                    <EmptyState
                      kind="no-match"
                      title="No tickets match"
                      body="Try a different status filter."
                    />
                  )}
                </div>
              ) : (
                <ul className={styles.list}>
                  {filtered.map((ticket) => (
                    <li key={ticket.id}>
                      <TicketListRow
                        ticket={ticket}
                        onClick={handleSelect}
                        unreadFor="employer"
                        subtitle={CATEGORY_LABELS[ticket.category] || ticket.category}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}

          {/* ── New-ticket view ────────────────────────────────────────── */}
          {view === 'new' && (
            <motion.div
              key="emp-tk-new"
              className={styles.viewPane}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <p className={styles.formIntro}>
                Send a message to the Universal Pensions support team. We&rsquo;ll reply right
                here in your inbox.
              </p>
              <NewTicketForm
                employerId={employerId}
                onCreated={handleCreated}
                onCancel={handleBack}
              />
            </motion.div>
          )}

          {/* ── Thread view ────────────────────────────────────────────── */}
          {view === 'thread' && selectedId && (
            <motion.div
              key="emp-tk-thread"
              className={styles.threadWrap}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <ThreadView
                ticket={thread || selectedTicket}
                messages={thread?.messages ?? []}
                currentRole={SENDER_ROLE.EMPLOYER}
                participantLabel="Universal Pensions Support"
                loading={threadLoading && !thread}
                error={threadError ? threadErrorObj : undefined}
                onRetry={refetchThread}
                footer={<ReplyComposer ticketId={selectedId} disabled={isClosed} />}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </EmployerSlidePanel>
  );
}
