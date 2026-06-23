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
import { PillChip, PillChipGroup } from '../../components/PillChip';
import { useEmployerAppBar } from '../shell/employerAppBarContext';
import s from './employerMobile.module.css';

const SUBJECT_MAX = 120;
const BODY_MAX = 1000;

const CATEGORY_LABELS = {
  [TICKET_CATEGORY.CONTRIBUTIONS]: 'Contributions',
  [TICKET_CATEGORY.ACCOUNT]: 'Account',
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

const displayRef = (id) => (id ? `#${String(id).toUpperCase()}` : '');
const initials = (name) => (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const SendIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
);
const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);

function ReplyComposer({ ticketId, disabled }) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(ticketId);
  const trimmed = body.trim();
  const canSend = !disabled && !sendMessage.isPending && trimmed !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    try {
      await sendMessage.mutateAsync({ sender: SENDER_ROLE.EMPLOYER, body: trimmed });
      setBody('');
    } catch {
      /* hook rolls back the optimistic update; keep the draft for a retry */
    }
  }

  return (
    <form className={s.composer} onSubmit={handleSubmit}>
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={disabled ? 'This ticket is closed' : 'Type a reply to support…'}
        maxLength={BODY_MAX}
        disabled={disabled || sendMessage.isPending}
        aria-label="Type a reply"
      />
      <button type="submit" className={s.composerSend} disabled={!canSend} aria-label="Send reply">{SendIcon}</button>
    </form>
  );
}

function ThreadView({ ticketId, fallbackTicket, youLabel }) {
  const { data: thread, isLoading } = useTicketThread(ticketId);
  const ticket = thread || fallbackTicket;
  const messages = thread?.messages ?? [];
  const isClosed = ticket?.status === TICKET_STATUS.CLOSED;

  const markRead = useMarkTicketRead(ticketId);
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (!ticketId || !thread) return;
    if ((thread.unread?.employer ?? 0) > 0) markReadMutate({ viewer: SENDER_ROLE.EMPLOYER });
  }, [ticketId, thread, markReadMutate]);

  return (
    <>
      <div className={`${s.card} ${s.grad}`}>
        <div className={s.cardHd} style={{ marginBottom: 6 }}>
          <h3 style={{ fontSize: 15 }}>{ticket?.subject || 'Conversation'}</h3>
          <span className={`${s.pill} ${isClosed ? s.pillOk : s.pillWarn}`}><i />{isClosed ? 'Resolved' : 'Open'}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-gray)' }}>{displayRef(ticket?.id)}</div>
      </div>

      <div className={s.card}>
        {isLoading && !thread ? (
          <p style={{ fontSize: 13, color: 'var(--color-gray)' }}>Loading conversation…</p>
        ) : messages.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-gray)' }}>No messages in this conversation yet.</p>
        ) : (
          <div className={s.msgs}>
            {messages.map((msg) => {
              const mine = msg.sender === SENDER_ROLE.EMPLOYER;
              return (
                <div key={msg.id} className={`${s.bubble} ${mine ? s.bubbleYou : s.bubbleThem}`}>
                  <div className={s.msgWho} style={mine ? { color: 'rgba(255,255,255,0.7)' } : undefined}>
                    {mine ? youLabel : 'Universal Pensions support'} · {formatRelativeTime(msg.at)}
                  </div>
                  {msg.body}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ReplyComposer ticketId={ticketId} disabled={isClosed} />
    </>
  );
}

function NewTicketForm({ employerId, onCreated }) {
  const createTicket = useCreateEmployerTicket(employerId);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(TICKET_CATEGORY.OTHER);
  const [priority, setPriority] = useState(TICKET_PRIORITY.NORMAL);
  const [body, setBody] = useState('');

  const canSubmit = !createTicket.isPending && subject.trim() !== '' && body.trim() !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const created = await createTicket.mutateAsync({ subject: subject.trim(), category, priority, body: body.trim() });
      onCreated?.(created);
    } catch {
      /* hook surfaces the error; keep the draft */
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      <div className={s.card}>
        <span className={s.fl}>Subject</span>
        <input className={s.fieldInput} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly, what's this about?" maxLength={SUBJECT_MAX} autoComplete="off" aria-label="Subject" />
        <span className={s.fl} style={{ marginTop: 16 }}>Category</span>
        <PillChipGroup label="Ticket category">
          {CATEGORY_ORDER.map((value) => (
            <PillChip key={value} selected={category === value} onClick={() => setCategory(value)}>{CATEGORY_LABELS[value]}</PillChip>
          ))}
        </PillChipGroup>
        <span className={s.fl} style={{ marginTop: 16 }}>Priority</span>
        <PillChipGroup label="Ticket priority">
          <PillChip selected={priority === TICKET_PRIORITY.NORMAL} onClick={() => setPriority(TICKET_PRIORITY.NORMAL)}>Normal</PillChip>
          <PillChip selected={priority === TICKET_PRIORITY.URGENT} onClick={() => setPriority(TICKET_PRIORITY.URGENT)}>Urgent</PillChip>
        </PillChipGroup>
        <span className={s.fl} style={{ marginTop: 16 }}>How can we help?</span>
        <textarea className={s.fieldArea} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the issue…" rows={4} maxLength={BODY_MAX} aria-label="Message" />
      </div>
      <button type="submit" className={`${s.btn} ${s.btnPri} ${s.btnBlock}`} disabled={!canSubmit}>
        {createTicket.isPending ? 'Sending…' : 'Send to support'}
      </button>
    </form>
  );
}

/**
 * SupportMobile — employer↔platform support on the phone. Fresh body against the
 * ticket hooks (the EmployerTickets panel couples to slide-panel chrome), with a
 * local list↔thread↔new view machine. Registers an app-bar back handler so the
 * persistent back steps thread/new → list before leaving the route.
 */
export default function SupportMobile() {
  const { employerId } = useEmployerScope();
  const { data: employer } = useEmployer(employerId);
  const { data: metrics } = useEmployerTicketMetrics(employerId);
  const { data: tickets = [] } = useEmployerTickets(employerId);
  const { registerBack } = useEmployerAppBar();

  const [view, setView] = useState('list'); // 'list' | 'thread' | 'new'
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (view === 'list') return undefined;
    const title = view === 'new' ? 'New ticket' : 'Ticket';
    return registerBack(() => { setView('list'); setSelectedId(null); }, title);
  }, [view, registerBack]);

  const youLabel = employer?.contactName || employer?.name || 'You';
  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? tickets
    : tickets.filter((t) => t.subject?.toLowerCase().includes(q) || displayRef(t.id).toLowerCase().includes(q));

  const openCount = metrics?.openCount ?? 0;
  const closedCount = metrics?.closedCount ?? 0;
  const activeTicket = tickets.find((t) => t.id === selectedId) || null;

  if (view === 'thread' && selectedId) {
    return (
      <div className={s.page}>
        <ThreadView key={selectedId} ticketId={selectedId} fallbackTicket={activeTicket} youLabel={youLabel} />
      </div>
    );
  }

  if (view === 'new') {
    return (
      <div className={s.page}>
        <NewTicketForm employerId={employerId} onCreated={(created) => { if (created?.id) { setSelectedId(created.id); setView('thread'); } else { setView('list'); } }} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.grad}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className={s.eyebrow}>Support inbox</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--color-indigo)', marginTop: 3 }}>
            {openCount} open · {closedCount} closed
          </div>
        </div>
        <button type="button" className={`${s.btn} ${s.btnPri}`} style={{ padding: '11px 15px' }} onClick={() => setView('new')}>{PlusIcon}New</button>
      </div>

      <div className={s.search}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
        <input type="search" placeholder="Search tickets" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tickets" />
      </div>

      {filtered.length === 0 ? (
        <p className={s.intro} style={{ marginTop: 8 }}>
          {tickets.length === 0
            ? 'No tickets yet. Raise a ticket and our support team will reply right here.'
            : 'No tickets match your search.'}
        </p>
      ) : (
        <div className={s.card} style={{ paddingTop: 4, paddingBottom: 4 }}>
          {filtered.map((ticket) => {
            const isOpen = ticket.status === TICKET_STATUS.OPEN;
            return (
              <button key={ticket.id} type="button" className={s.lrow} onClick={() => { setSelectedId(ticket.id); setView('thread'); }} aria-label={`Open ${ticket.subject}`}>
                <span className={s.av}>{initials(ticket.subject)}</span>
                <span className={s.lMid}>
                  <b>{ticket.subject}</b>
                  <small>{displayRef(ticket.id)} · updated {formatRelativeTime(ticket.updatedAt)}</small>
                </span>
                <span className={`${s.pill} ${isOpen ? s.pillWarn : s.pillOk}`}><i />{isOpen ? 'Open' : 'Resolved'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
