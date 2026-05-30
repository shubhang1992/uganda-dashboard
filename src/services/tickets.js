// Support-ticketing service — Phase 0 of the subscriber ⇄ agent support inbox.
//
// The "backend" is an in-memory session store (mirroring subscriber.js): a
// module-level Map, lazy-seeded from seedTickets() on first access, that layers
// demo writes over the seed and resets on refresh. Every mutation clones the
// target ticket and writes a NEW object reference back into the store, so React
// Query's identity-based change detection re-renders consumers (the seed objects
// themselves are never mutated in place).
//
// IS_SUPABASE_ENABLED is imported for parity with the sibling services
// (subscriber.js / commissions.js, which branch on it). Ticketing has no
// Supabase tables in this phase, so there is no real-backend branch to fork —
// the import simply marks this as the in-memory store and leaves a clean seam
// for a future migration. ESLint's flat config does not flag it as unused.
//
// Enums are the FROZEN contract owned by ../data/ticketsSeed.js — never inline a
// status / role / category / priority string literal; import the enum instead.
// Services MAY import mockData; AGENTS is used only to resolve an agent's display
// name for the oversight metrics.

import { IS_SUPABASE_ENABLED } from './api';
import { AGENTS, SUBSCRIBERS } from '../data/mockData';
import {
  TICKET_STATUS,
  SENDER_ROLE,
  seedTickets,
} from '../data/ticketsSeed.js';

// ─── In-memory session store ─────────────────────────────────────────────────
// Keyed by ticket id. Lazy-seeded on first access from a DEEP clone of the seed
// so the frozen seed objects are never touched and every value in the store is
// independently mutable.
let _store = null;

function cloneMessage(m) {
  return { ...m };
}

function cloneTicket(t) {
  return {
    ...t,
    unread: { ...t.unread },
    messages: t.messages.map(cloneMessage),
  };
}

function store() {
  if (!_store) {
    _store = new Map();
    // `seedTickets()` already returns the demo threads sorted by updatedAt; we
    // deep-clone each so the frozen seed objects are never mutated and the store
    // holds independently-writable values.
    for (const t of seedTickets()) {
      _store.set(t.id, cloneTicket(t));
    }
  }
  return _store;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const PREVIEW_LEN = 80;
function preview(body) {
  const trimmed = body.trim();
  return trimmed.length <= PREVIEW_LEN ? trimmed : `${trimmed.slice(0, PREVIEW_LEN - 1).trimEnd()}…`;
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

/** Strip the messages[] array — a TicketSummary keeps every scalar + unread. */
function toSummary(ticket) {
  const { messages, ...summary } = ticket; // eslint-disable-line no-unused-vars
  return { ...summary, unread: { ...summary.unread } };
}

/** Newest-updated first — the order an inbox renders in. */
function byUpdatedDesc(a, b) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Build a sorted TicketSummary[] from the store given a predicate. */
function summaries(predicate) {
  return Array.from(store().values())
    .filter(predicate)
    .sort(byUpdatedDesc)
    .map(toSummary);
}

/** Apply the optional status filter on top of a scope predicate. */
function matchesStatus(ticket, status) {
  return status == null || ticket.status === status;
}

function resolveAgentName(agentId) {
  return AGENTS[agentId]?.name ?? 'Unknown';
}

/**
 * Resolve the agent + (denormalized) branch a new ticket should route to.
 * Preference order: (1) the subscriber's most recent existing ticket — keeps a
 * saver's threads with the same agent; (2) the real org chain from mockData
 * (subscriber.parentId → agentId, agent.parentId → branchId) so a subscriber's
 * FIRST-ever ticket still reaches their assigned agent's inbox + branch oversight.
 */
function resolveRouting(subscriberId, existing) {
  if (existing?.agentId) {
    return { agentId: existing.agentId, branchId: existing.branchId ?? null };
  }
  const agentId = SUBSCRIBERS[subscriberId]?.parentId ?? null;
  const branchId = agentId ? (AGENTS[agentId]?.parentId ?? null) : null;
  return { agentId, branchId };
}

/** Next msg-<tk>-<n> id for a ticket's thread. */
function nextMessageId(ticket) {
  return `msg-${ticket.id}-${ticket.messages.length + 1}`;
}

/**
 * Clone a ticket, append a message, and refresh the derived fields
 * (updatedAt, lastMessagePreview) plus the relevant unread counter. Returns the
 * fresh clone WITHOUT writing it to the store — callers decide when to persist.
 */
function appendMessage(ticket, { sender, body, at }) {
  const next = cloneTicket(ticket);
  const message = {
    id: nextMessageId(next),
    ticketId: next.id,
    sender,
    body,
    at,
  };
  next.messages.push(message);
  next.updatedAt = at;
  next.lastMessagePreview = preview(body);
  // System messages don't belong to either party's unread count.
  if (sender === SENDER_ROLE.SUBSCRIBER) next.unread.agent += 1;
  else if (sender === SENDER_ROLE.AGENT) next.unread.subscriber += 1;
  return next;
}

// ─── Reads (lists return TicketSummary[]) ────────────────────────────────────

/**
 * Subscriber inbox — tickets owned by one subscriber, newest-updated first.
 * @param {string} subscriberId
 * @param {{ status?: string }} [opts]
 * @returns {Promise<object[]>} TicketSummary[]
 */
export async function listTicketsForSubscriber(subscriberId, { status } = {}) {
  return summaries((t) => t.subscriberId === subscriberId && matchesStatus(t, status));
}

/**
 * Agent inbox — tickets assigned to one agent, newest-updated first.
 * @param {string} agentId
 * @param {{ status?: string }} [opts]
 * @returns {Promise<object[]>} TicketSummary[]
 */
export async function listTicketsForAgent(agentId, { status } = {}) {
  return summaries((t) => t.agentId === agentId && matchesStatus(t, status));
}

/**
 * Branch oversight (view-only) — every ticket whose denormalized branchId
 * matches, optionally narrowed to a single agent. No join: branchId rides on
 * each ticket so a branch can read its whole inbox without resolving agents.
 * @param {string} branchId
 * @param {{ status?: string, agentId?: string }} [opts]
 * @returns {Promise<object[]>} TicketSummary[]
 */
export async function listTicketsForBranch(branchId, { status, agentId } = {}) {
  return summaries(
    (t) =>
      t.branchId === branchId &&
      (agentId == null || t.agentId === agentId) &&
      matchesStatus(t, status),
  );
}

/**
 * Distributor oversight (view-only) — the distributor sits at the top of the
 * tree and sees ALL tickets, optionally narrowed by branch and/or agent. The
 * distributorId is accepted for signature symmetry with the branch/agent reads
 * (there is one distributor in the demo network) but does not filter — there is
 * no per-distributor partition of tickets to scope to.
 * @param {string} distributorId
 * @param {{ status?: string, branchId?: string, agentId?: string }} [opts]
 * @returns {Promise<object[]>} TicketSummary[]
 */
export async function listTicketsForDistributor(distributorId, { status, branchId, agentId } = {}) {
  return summaries(
    (t) =>
      (branchId == null || t.branchId === branchId) &&
      (agentId == null || t.agentId === agentId) &&
      matchesStatus(t, status),
  );
}

/**
 * Full thread for one ticket, with messages[] oldest → newest. Returns a fresh
 * clone (never the stored reference) or null if the ticket doesn't exist.
 * @param {string} ticketId
 * @returns {Promise<object|null>} Ticket | null
 */
export async function getThread(ticketId) {
  const ticket = store().get(ticketId);
  return ticket ? cloneTicket(ticket) : null;
}

// ─── Metrics (oversight) ─────────────────────────────────────────────────────

const MS_PER_HOUR = 3600000;

/** Round to one decimal place — enough precision for an hours figure. */
function roundHours(value) {
  return Math.round(value * 10) / 10;
}

/** First agent reply timestamp in a thread, or null if the agent never replied. */
function firstAgentMessageAt(ticket) {
  const reply = ticket.messages.find((m) => m.sender === SENDER_ROLE.AGENT);
  return reply ? reply.at : null;
}

/** True when the latest message in an OPEN thread is from the subscriber. */
function isUnanswered(ticket) {
  if (ticket.status !== TICKET_STATUS.OPEN) return false;
  const last = ticket.messages[ticket.messages.length - 1];
  return !!last && last.sender === SENDER_ROLE.SUBSCRIBER;
}

/**
 * Fold a set of tickets into the TicketMetrics shape. Shared by the branch and
 * distributor metric reads — they differ only in which tickets they pass in.
 */
function computeMetrics(tickets) {
  let openCount = 0;
  let closedCount = 0;
  let unansweredCount = 0;

  const firstResponseHours = [];
  const resolutionHours = [];

  // Per-agent tallies, keyed by agentId in first-seen order.
  const agentRows = new Map();
  const ensureAgentRow = (agentId) => {
    if (!agentRows.has(agentId)) {
      agentRows.set(agentId, {
        agentId,
        name: resolveAgentName(agentId),
        openCount: 0,
        closedCount: 0,
        unansweredCount: 0,
      });
    }
    return agentRows.get(agentId);
  };

  for (const t of tickets) {
    const open = t.status === TICKET_STATUS.OPEN;
    const closed = t.status === TICKET_STATUS.CLOSED;
    if (open) openCount += 1;
    if (closed) closedCount += 1;

    const unanswered = isUnanswered(t);
    if (unanswered) unansweredCount += 1;

    const firstReplyAt = firstAgentMessageAt(t);
    if (firstReplyAt) {
      firstResponseHours.push(
        (new Date(firstReplyAt).getTime() - new Date(t.createdAt).getTime()) / MS_PER_HOUR,
      );
    }
    if (closed && t.closedAt) {
      resolutionHours.push(
        (new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / MS_PER_HOUR,
      );
    }

    const row = ensureAgentRow(t.agentId);
    if (open) row.openCount += 1;
    if (closed) row.closedCount += 1;
    if (unanswered) row.unansweredCount += 1;
  }

  const mean = (arr) => (arr.length ? roundHours(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);

  return {
    openCount,
    closedCount,
    totalCount: tickets.length,
    avgFirstResponseHours: mean(firstResponseHours),
    avgResolutionHours: mean(resolutionHours),
    unansweredCount,
    byAgent: Array.from(agentRows.values()),
  };
}

/**
 * Branch ticket metrics — folds every ticket in the branch into counts +
 * response/resolution averages + a per-agent breakdown.
 * @param {string} branchId
 * @returns {Promise<object>} TicketMetrics
 */
export async function getBranchTicketMetrics(branchId) {
  const tickets = Array.from(store().values()).filter((t) => t.branchId === branchId);
  return computeMetrics(tickets);
}

/**
 * Distributor ticket metrics — folds ALL tickets (optionally narrowed to one
 * branch) into the same TicketMetrics shape.
 * @param {string} distributorId
 * @param {{ branchId?: string }} [opts]
 * @returns {Promise<object>} TicketMetrics
 */
export async function getDistributorTicketMetrics(distributorId, { branchId } = {}) {
  const tickets = Array.from(store().values()).filter(
    (t) => branchId == null || t.branchId === branchId,
  );
  return computeMetrics(tickets);
}

// ─── Mutations (every write returns a fresh cloned Ticket) ───────────────────

let _createSeq = 0;
/** Mint a tk-<n> id that won't collide with the seeded ids already in the store. */
function nextTicketId() {
  let id;
  do {
    _createSeq += 1;
    id = `tk-${String(seedTickets().length + _createSeq).padStart(3, '0')}`;
  } while (store().has(id));
  return id;
}

/**
 * Open a new ticket on behalf of a subscriber. The subscriber is resolved to an
 * agent + branch via their own ticket history if any exists; otherwise the
 * caller's first existing ticket would be the only source, so we fall back to
 * the subscriber's most recent ticket assignment. The first message is the
 * subscriber's body; unread.agent starts at 1 (the agent has it un-seen).
 *
 * @param {string} subscriberId
 * @param {{ subject: string, category: string, priority: string, body: string }} payload
 * @returns {Promise<object>} the newly created Ticket
 * @throws if subject or body is empty/whitespace
 */
export async function createTicket(subscriberId, { subject, category, priority, body } = {}) {
  if (isBlank(subject)) throw new Error('Ticket subject is required');
  if (isBlank(body)) throw new Error('Ticket message is required');

  // Resolve the subscriber's agent + branch so the new ticket carries the same
  // denormalized routing the oversight views rely on. Prefer an existing thread's
  // assignment; fall back to the real org chain for a first-ever ticket.
  const existing = Array.from(store().values())
    .filter((t) => t.subscriberId === subscriberId)
    .sort(byUpdatedDesc)[0];
  const { agentId, branchId } = resolveRouting(subscriberId, existing);

  const now = new Date().toISOString();
  const id = nextTicketId();
  const trimmedSubject = subject.trim();
  const message = {
    id: `msg-${id}-1`,
    ticketId: id,
    sender: SENDER_ROLE.SUBSCRIBER,
    body,
    at: now,
  };
  const ticket = {
    id,
    subscriberId,
    agentId,
    branchId,
    subject: trimmedSubject,
    category,
    status: TICKET_STATUS.OPEN,
    priority,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    closedBy: null,
    lastMessagePreview: preview(body),
    unread: { subscriber: 0, agent: 1 },
    messages: [message],
  };
  store().set(id, ticket);
  return cloneTicket(ticket);
}

/**
 * Append a message to a thread, bump updatedAt + lastMessagePreview, and
 * increment the recipient's unread counter. Returns the full updated ticket.
 *
 * @param {string} ticketId
 * @param {{ sender: string, body: string }} payload
 * @returns {Promise<object|null>} the updated Ticket, or null if not found
 * @throws if body is empty/whitespace
 */
export async function sendMessage(ticketId, { sender, body } = {}) {
  if (isBlank(body)) throw new Error('Message body is required');
  const ticket = store().get(ticketId);
  if (!ticket) return null;

  const next = appendMessage(ticket, { sender, body, at: new Date().toISOString() });
  store().set(ticketId, next);
  return cloneTicket(next);
}

/**
 * Close a ticket. GUARD: only an OPEN ticket can be closed — otherwise the
 * ticket is returned unchanged (mirrors commissions.js invalid-transition idiom).
 *
 * @param {string} ticketId
 * @param {{ by: string }} payload - SenderRole that closed it
 * @returns {Promise<object|null>} the updated Ticket, or null if not found
 */
export async function closeTicket(ticketId, { by } = {}) {
  const ticket = store().get(ticketId);
  if (!ticket) return null;
  if (ticket.status !== TICKET_STATUS.OPEN) return cloneTicket(ticket);

  const next = cloneTicket(ticket);
  next.status = TICKET_STATUS.CLOSED;
  next.closedAt = new Date().toISOString();
  next.closedBy = by;
  store().set(ticketId, next);
  return cloneTicket(next);
}

/**
 * Reopen a ticket. GUARD: only a CLOSED ticket can be reopened — otherwise the
 * ticket is returned unchanged. Reopening flips the status back to open, clears
 * closedAt/closedBy, AND appends a SYSTEM message marking the reopen (which
 * bumps updatedAt + lastMessagePreview). A system message belongs to neither
 * party's unread count.
 *
 * @param {string} ticketId
 * @param {{ by: string }} payload - SenderRole that reopened it
 * @returns {Promise<object|null>} the updated Ticket, or null if not found
 */
export async function reopenTicket(ticketId, { by } = {}) {
  const ticket = store().get(ticketId);
  if (!ticket) return null;
  if (ticket.status !== TICKET_STATUS.CLOSED) return cloneTicket(ticket);

  const reopened = appendMessage(ticket, {
    sender: SENDER_ROLE.SYSTEM,
    body: `Ticket reopened by ${by}`,
    at: new Date().toISOString(),
  });
  reopened.status = TICKET_STATUS.OPEN;
  reopened.closedAt = null;
  reopened.closedBy = null;
  store().set(ticketId, reopened);
  return cloneTicket(reopened);
}

/**
 * Mark a thread read for one viewer — zero that viewer's unread counter.
 * @param {string} ticketId
 * @param {{ viewer: 'subscriber'|'agent' }} payload
 * @returns {Promise<object|null>} the updated Ticket, or null if not found
 */
export async function markRead(ticketId, { viewer } = {}) {
  const ticket = store().get(ticketId);
  if (!ticket) return null;

  const next = cloneTicket(ticket);
  if (viewer === SENDER_ROLE.SUBSCRIBER) next.unread.subscriber = 0;
  else if (viewer === SENDER_ROLE.AGENT) next.unread.agent = 0;
  store().set(ticketId, next);
  return cloneTicket(next);
}
