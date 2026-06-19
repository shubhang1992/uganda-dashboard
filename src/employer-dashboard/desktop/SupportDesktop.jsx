// SupportDesktop — employer↔platform support for the DESKTOP dashboard.
//
// Mirrors the mobile/slide-panel EmployerTickets list↔thread + compose logic
// (same ticket hooks, same SENDER_ROLE wiring, same mark-read-on-open and
// new-ticket create flow) but lays it out as a persistent desktop split: the
// ticket list lives on the LEFT and the selected thread (or the New-ticket
// form) on the RIGHT — never a slide-in. The "platform support" side answers
// as a SYSTEM message in the demo store, so an employer sees its own `employer`
// bubbles on the right and the canned `system` replies on the left.

import { useState, useEffect } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployer } from '../../hooks/useEmployer';
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
import { formatRelativeTime } from '../../utils/date';
import { PageHead, MetricRow, Tile, Card, StatusBadge, Tag, Btn, Avatar } from './ui';
import { searchIcon, plusIcon, sendIcon, backIcon, closeIcon } from './icons';
import ui from './ui.module.css';
import styles from './SupportDesktop.module.css';

const SUBJECT_MAX = 120;
const BODY_MAX = 1000;

// Title-Case category labels keyed by the frozen enum value (mirrors the
// slide-panel EmployerTickets map; the employer-relevant subset only).
const CATEGORY_LABELS = {
  [TICKET_CATEGORY.CONTRIBUTIONS]: 'Contributions',
  [TICKET_CATEGORY.ACCOUNT]: 'Billing & account',
  [TICKET_CATEGORY.SCHEDULE]: 'Schedule',
  [TICKET_CATEGORY.CLAIMS]: 'Claims',
  [TICKET_CATEGORY.OTHER]: 'Other',
};

const CATEGORY_ORDER = [
  TICKET_CATEGORY.CONTRIBUTIONS,
  TICKET_CATEGORY.ACCOUNT,
  TICKET_CATEGORY.SCHEDULE,
  TICKET_CATEGORY.CLAIMS,
  TICKET_CATEGORY.OTHER,
];

/* Display ref derived from the ticket id (the mockup's "#UP-1042" is
   illustrative — the demo store has no ref column, so we surface a stable,
   human-readable token from the id, e.g. tk-emp-001 → #TK-EMP-001). */
function displayRef(id) {
  return id ? `#${String(id).toUpperCase()}` : '';
}

// Round the avg first-response hours into the mockup's "~4h" / "~2d" style.
function avgResponseLabel(hours) {
  if (!hours || hours <= 0) return '—';
  if (hours < 24) return `~${Math.round(hours)}h`;
  return `~${Math.round(hours / 24)}d`;
}

/* ── Reply composer (right pane footer) ─────────────────────────────────── */
function ReplyComposer({ ticketId, disabled }) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(ticketId);
  const trimmed = body.trim();
  const canSend = !disabled && !sendMessage.isPending && trimmed !== '';

  // Clear the draft when switching threads so one ticket's reply never bleeds
  // into another (reset-during-render on the ticketId change).
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
    <form className={styles.replyRow} onSubmit={handleSubmit}>
      <div className={styles.replyInput}>
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={disabled ? 'This ticket is closed' : 'Write a reply…'}
          maxLength={BODY_MAX}
          disabled={disabled || sendMessage.isPending}
          aria-label="Write a reply"
        />
      </div>
      <button
        type="submit"
        className={styles.replySend}
        disabled={!canSend}
        aria-label="Send reply"
      >
        {sendIcon(18)}
      </button>
    </form>
  );
}

/* ── New-ticket form (replaces the thread pane on the right) ─────────────── */
function NewTicketForm({ employerId, onCreated, onCancel }) {
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
      onCreated?.(created);
    } catch {
      // Hook surfaces the error; leave the draft intact for a retry.
    }
  }

  return (
    <Card>
      <div className={styles.threadHead}>
        <div>
          <div className={styles.threadSubj}>New ticket</div>
          <div className={styles.threadSub}>
            Send a message to the Universal Pensions support team.
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={onCancel}>
          {closeIcon(16)} Cancel
        </Btn>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="emp-tk-subject">Subject</label>
          <input
            id="emp-tk-subject"
            type="text"
            className={ui.fieldInput}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Query about this month's contribution run"
            maxLength={SUBJECT_MAX}
            autoComplete="off"
            disabled={createTicket.isPending}
          />
          <span className={ui.fieldHint}>{subject.length}/{SUBJECT_MAX}</span>
        </div>

        <div className={ui.fieldGrid}>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="emp-tk-category">Category</label>
            <select
              id="emp-tk-category"
              className={ui.fieldSelect}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={createTicket.isPending}
            >
              {CATEGORY_ORDER.map((value) => (
                <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
              ))}
            </select>
          </div>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="emp-tk-priority">Priority</label>
            <select
              id="emp-tk-priority"
              className={ui.fieldSelect}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={createTicket.isPending}
            >
              <option value={TICKET_PRIORITY.NORMAL}>Normal</option>
              <option value={TICKET_PRIORITY.URGENT}>Urgent</option>
            </select>
          </div>
        </div>

        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="emp-tk-body">How can we help?</label>
          <textarea
            id="emp-tk-body"
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe your question in a little detail so our team can help faster."
            rows={5}
            maxLength={BODY_MAX}
            disabled={createTicket.isPending}
          />
          <span className={ui.fieldHint}>{body.length}/{BODY_MAX}</span>
        </div>

        <div className={ui.footerActions}>
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={!canSubmit}>
            {createTicket.isPending ? 'Sending…' : 'Send to support'}
          </Btn>
        </div>
      </form>
    </Card>
  );
}

/* ── Thread pane (right; selected conversation + reply composer) ─────────── */
function ThreadPane({ ticketId, fallbackTicket, youLabel, onBack }) {
  const {
    data: thread,
    isLoading,
  } = useTicketThread(ticketId);

  const ticket = thread || fallbackTicket;
  const messages = thread?.messages ?? [];
  const isClosed = ticket?.status === TICKET_STATUS.CLOSED;

  // Mark the open thread read for the employer once it resolves so the unread
  // badge clears (mirrors the slide-panel mark-read-on-open behaviour).
  const markRead = useMarkTicketRead(ticketId);
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (!ticketId || !thread) return;
    if ((thread.unread?.employer ?? 0) > 0) {
      markReadMutate({ viewer: SENDER_ROLE.EMPLOYER });
    }
  }, [ticketId, thread, markReadMutate]);

  return (
    <Card>
      <div className={styles.threadHead}>
        <div className={styles.threadHeadMain}>
          <button type="button" className={styles.threadBack} onClick={onBack} aria-label="Back to all tickets">
            {backIcon(16)}
          </button>
          <div>
            <div className={styles.threadSubj}>{ticket?.subject || 'Conversation'}</div>
            <div className={styles.threadRef}>{displayRef(ticket?.id)}</div>
          </div>
        </div>
        {ticket && (
          isClosed
            ? <StatusBadge tone="done">Resolved</StatusBadge>
            : <StatusBadge tone="open">Open</StatusBadge>
        )}
      </div>

      {isLoading && !thread ? (
        <p className={styles.threadEmpty}>Loading conversation…</p>
      ) : messages.length === 0 ? (
        <p className={styles.threadEmpty}>No messages in this conversation yet.</p>
      ) : (
        <div className={styles.msgs}>
          {messages.map((msg) => {
            const mine = msg.sender === SENDER_ROLE.EMPLOYER;
            const who = mine ? youLabel : 'Support';
            return (
              <div key={msg.id} className={`${styles.msg} ${mine ? styles.msgYou : styles.msgAgent}`}>
                <div className={styles.msgWho}>
                  <b>{who}</b>
                  <span>· {formatRelativeTime(msg.at)}</span>
                </div>
                <div className={styles.msgBubble}>{msg.body}</div>
              </div>
            );
          })}
        </div>
      )}

      <ReplyComposer ticketId={ticketId} disabled={isClosed} />
    </Card>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function SupportDesktop() {
  const { employerId } = useEmployerScope();
  const { data: employer } = useEmployer(employerId);

  const { data: metrics } = useEmployerTicketMetrics(employerId);
  const { data: tickets = [] } = useEmployerTickets(employerId);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(false);

  const youLabel = employer?.contactName || employer?.name || 'You';

  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? tickets
    : tickets.filter((t) =>
        t.subject?.toLowerCase().includes(q) || displayRef(t.id).toLowerCase().includes(q));

  // Default the selection to the newest ticket once data lands (and keep a
  // valid selection if the current one drops out of the list).
  const hasSelection = selectedId != null && tickets.some((t) => t.id === selectedId);
  const activeId = composing
    ? null
    : (hasSelection ? selectedId : (tickets[0]?.id ?? null));
  const activeTicket = tickets.find((t) => t.id === activeId) || null;

  const openCount = metrics?.openCount ?? 0;
  const resolvedCount = metrics?.closedCount ?? 0;
  const avgResponse = avgResponseLabel(metrics?.avgFirstResponseHours);

  function handleSelect(id) {
    setComposing(false);
    setSelectedId(id);
  }
  function handleNew() {
    setComposing(true);
    setSelectedId(null);
  }
  function handleCreated(created) {
    setComposing(false);
    setSelectedId(created?.id ?? null);
  }

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Help"
        title="Support"
        sub="Raise and track requests with the Universal Pensions team."
      />

      <div className={ui.toolrow}>
        <div className={ui.search}>
          <span className={ui.searchIcon}>{searchIcon(16)}</span>
          <input
            type="text"
            className={ui.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets by subject or ref…"
            aria-label="Search tickets"
          />
        </div>
        <span className={styles.grow} />
        <Btn variant="primary" onClick={handleNew}>
          {plusIcon(16)} New ticket
        </Btn>
      </div>

      <MetricRow cols={3}>
        <Tile
          accent="amber"
          icon={ticketIcon(18)}
          label="Open tickets"
          value={openCount}
          sub="Awaiting a reply from us"
        />
        <Tile
          accent="green"
          icon={checkCircleIcon(18)}
          label="Resolved"
          value={resolvedCount}
          sub="Closed support requests"
        />
        <Tile
          accent="indigo"
          icon={clockIcon(18)}
          label="Avg. response"
          value={avgResponse}
          sub="How fast we get back to you"
        />
      </MetricRow>

      <div className={ui.split2}>
        {/* LEFT — ticket list */}
        <div className={styles.tkCard}>
          {filtered.length === 0 ? (
            <p className={styles.listEmpty}>
              {tickets.length === 0
                ? 'No tickets yet. Raise a ticket and our support team will reply right here.'
                : 'No tickets match your search.'}
            </p>
          ) : (
            filtered.map((ticket) => {
              const isOpen = ticket.status === TICKET_STATUS.OPEN;
              const isUrgent = ticket.priority === TICKET_PRIORITY.URGENT && isOpen;
              const selected = ticket.id === activeId;
              return (
                <button
                  type="button"
                  key={ticket.id}
                  className={`${styles.tkRow} ${selected ? styles.tkRowSelected : ''}`}
                  onClick={() => handleSelect(ticket.id)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <Avatar name={ticket.subject} />
                  <div className={styles.tkMain}>
                    <div className={styles.tkSubj}>{ticket.subject}</div>
                    <div className={styles.tkMeta}>
                      <span className={styles.tkRef}>{displayRef(ticket.id)}</span>
                      <span className={styles.tkSep}>·</span>
                      <span>Updated {formatRelativeTime(ticket.updatedAt)}</span>
                    </div>
                  </div>
                  <div className={styles.tkRight}>
                    {isOpen
                      ? <StatusBadge tone="open">Open</StatusBadge>
                      : <StatusBadge tone="done">Resolved</StatusBadge>}
                    {isUrgent
                      ? <Tag>Urgent</Tag>
                      : <Tag>Normal</Tag>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* RIGHT — thread or new-ticket form */}
        {composing ? (
          <NewTicketForm
            employerId={employerId}
            onCreated={handleCreated}
            onCancel={() => setComposing(false)}
          />
        ) : activeId ? (
          <ThreadPane
            key={activeId}
            ticketId={activeId}
            fallbackTicket={activeTicket}
            youLabel={youLabel}
            onBack={handleNew}
          />
        ) : (
          <Card>
            <div className={styles.threadHead}>
              <div className={styles.threadSubj}>No ticket selected</div>
            </div>
            <p className={styles.threadEmpty}>
              Select a ticket on the left to read the conversation, or raise a new one.
            </p>
            <div className={ui.footerActions}>
              <Btn variant="primary" onClick={handleNew}>{plusIcon(16)} New ticket</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── Page-local icons (not in icons.jsx: ticket, check-circle, clock) ────── */
function ticketIcon(size = 18) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path d="M4 7a1 1 0 011-1h14a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3a2 2 0 000-4V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function checkCircleIcon(size = 18) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function clockIcon(size = 18) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
