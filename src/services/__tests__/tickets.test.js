// Support-ticketing service tests.
//
// Unlike the other service suites, tickets.js has no Supabase dependency — it is
// a pure in-memory session store seeded from `seedTickets()` (the same idiom as
// `subscriber._sessionMutations`). So there is nothing to mock: we exercise the
// real module against its frozen seed.
//
// The store is module-level and lazy-seeded once, so writes accumulate across
// tests within this file. The suite is therefore written to assert INVARIANTS
// (scoping, sort order, guard behaviour, counter arithmetic on freshly-created
// tickets, metric reconciliation) rather than absolute seed counts — every
// assertion holds regardless of what earlier tests created.

import { describe, it, expect } from 'vitest';
import {
  listTicketsForSubscriber,
  listTicketsForAgent,
  listTicketsForBranch,
  listTicketsForDistributor,
  getThread,
  getBranchTicketMetrics,
  getDistributorTicketMetrics,
  createTicket,
  sendMessage,
  closeTicket,
  reopenTicket,
  markRead,
} from '../tickets.js';
import {
  TICKET_STATUS,
  SENDER_ROLE,
  TICKET_PRIORITY,
  TICKET_CATEGORY,
} from '../../data/ticketsSeed.js';

// The seeded "real chain" the demo personas fall back to.
const SUB = 's-0001';
const AGENT = 'a-001';
const BRANCH = 'b-bui-001';
const DISTRIBUTOR = 'd-001';

const draft = (over = {}) => ({
  subject: 'Test issue',
  category: TICKET_CATEGORY.ACCOUNT,
  priority: TICKET_PRIORITY.NORMAL,
  body: 'I need help with my account.',
  ...over,
});

describe('tickets service — scoping & reads', () => {
  it('scopes a subscriber inbox to its owner, returns summaries (no messages[]), sorted updatedAt desc', async () => {
    const list = await listTicketsForSubscriber(SUB);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => t.subscriberId === SUB)).toBe(true);
    // TicketSummary strips the messages array.
    expect(list.every((t) => !('messages' in t))).toBe(true);
    // Newest-updated first (ISO strings sort chronologically).
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1].updatedAt >= list[i].updatedAt).toBe(true);
    }
  });

  it('filters a list by status', async () => {
    const open = await listTicketsForSubscriber(SUB, { status: TICKET_STATUS.OPEN });
    expect(open.every((t) => t.status === TICKET_STATUS.OPEN)).toBe(true);
    const closed = await listTicketsForSubscriber(SUB, { status: TICKET_STATUS.CLOSED });
    expect(closed.every((t) => t.status === TICKET_STATUS.CLOSED)).toBe(true);
  });

  it('scopes the agent inbox to the assigned agent', async () => {
    const list = await listTicketsForAgent(AGENT);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => t.agentId === AGENT)).toBe(true);
  });

  it('scopes a branch to its denormalized branchId; the distributor sees everything', async () => {
    const branch = await listTicketsForBranch(BRANCH);
    expect(branch.length).toBeGreaterThan(0);
    expect(branch.every((t) => t.branchId === BRANCH)).toBe(true);

    const all = await listTicketsForDistributor(DISTRIBUTOR);
    expect(all.length).toBeGreaterThanOrEqual(branch.length);

    // Distributor narrowed by branch === that branch's list.
    const narrowed = await listTicketsForDistributor(DISTRIBUTOR, { branchId: BRANCH });
    expect(narrowed.length).toBe(branch.length);
  });

  it('returns the full thread oldest→newest, and null for an unknown id', async () => {
    const [first] = await listTicketsForSubscriber(SUB);
    const thread = await getThread(first.id);
    expect(thread).not.toBeNull();
    expect(thread.id).toBe(first.id);
    expect(Array.isArray(thread.messages)).toBe(true);
    expect(thread.messages.length).toBeGreaterThan(0);
    for (let i = 1; i < thread.messages.length; i += 1) {
      expect(thread.messages[i - 1].at <= thread.messages[i].at).toBe(true);
    }
    expect(await getThread('tk-nonexistent-999')).toBeNull();
  });
});

describe('tickets service — mutations', () => {
  it('createTicket routes to the subscriber’s agent + branch, opens, and seeds the first message + unread', async () => {
    const t = await createTicket(SUB, draft());
    expect(t.id).toMatch(/^tk-\d+$/);
    expect(t.status).toBe(TICKET_STATUS.OPEN);
    expect(t.agentId).toBe(AGENT);
    expect(t.branchId).toBe(BRANCH);
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0].sender).toBe(SENDER_ROLE.SUBSCRIBER);
    expect(t.unread).toEqual({ subscriber: 0, agent: 1 });

    // It surfaces in both the subscriber and agent inboxes.
    const agentList = await listTicketsForAgent(AGENT);
    expect(agentList.some((x) => x.id === t.id)).toBe(true);
  });

  it('createTicket throws on a blank subject or body', async () => {
    await expect(createTicket(SUB, draft({ subject: '   ' }))).rejects.toThrow();
    await expect(createTicket(SUB, draft({ body: '  ' }))).rejects.toThrow();
  });

  it('createTicket routes by the caller-supplied LIVE routing when the subscriber has no prior thread (BL-4)', async () => {
    // A subscriber whose id is NOT in the frozen mockData chain (mirrors the live
    // demo, where the live seed and mockData generate separate subscriber sets).
    // The mockData chain would resolve to null; the live routing must win.
    const ORPHAN = 's-orphan-live-routing';
    const t = await createTicket(
      ORPHAN,
      draft(),
      { agentId: AGENT, branchId: BRANCH },
    );
    expect(t.agentId).toBe(AGENT);
    expect(t.branchId).toBe(BRANCH);

    // It reaches the routed agent's inbox + that branch's oversight.
    const agentList = await listTicketsForAgent(AGENT);
    expect(agentList.some((x) => x.id === t.id)).toBe(true);
    const branchList = await listTicketsForBranch(BRANCH);
    expect(branchList.some((x) => x.id === t.id)).toBe(true);
  });

  it('createTicket does NOT dead-letter: with no routing AND an unknown subscriber it files with agentId=null (BL-4)', async () => {
    // No live routing passed and the id isn't a mockData key → resolveRouting
    // returns null. The ticket must still be created (so it surfaces in the
    // distributor's unfiltered oversight, not silently lost) — and the caller can
    // detect agentId===null to avoid a false "sent to your agent" success toast.
    const ORPHAN = 's-orphan-null-agent';
    const t = await createTicket(ORPHAN, draft());
    expect(t.agentId).toBeNull();
    expect(t.branchId).toBeNull();
    expect(t.status).toBe(TICKET_STATUS.OPEN);

    // Invisible to every agent + branch inbox, but visible to distributor oversight.
    const distList = await listTicketsForDistributor(DISTRIBUTOR);
    expect(distList.some((x) => x.id === t.id)).toBe(true);
  });

  it('createTicket prefers an existing thread assignment over caller routing (keeps a saver with one agent)', async () => {
    // First ticket via the mock chain pins SUB to AGENT/BRANCH.
    const first = await createTicket(SUB, draft());
    expect(first.agentId).toBe(AGENT);

    // A second ticket that passes DIFFERENT live routing still re-uses the
    // subscriber's existing assignment — threads don't scatter across agents.
    const second = await createTicket(
      SUB,
      draft({ subject: 'Second issue' }),
      { agentId: 'a-999-different', branchId: 'b-999-different' },
    );
    expect(second.agentId).toBe(AGENT);
    expect(second.branchId).toBe(BRANCH);
  });

  it('sendMessage appends and bumps the recipient’s unread counter; throws on a blank body', async () => {
    const t = await createTicket(SUB, draft()); // unread.agent = 1
    const afterAgent = await sendMessage(t.id, { sender: SENDER_ROLE.AGENT, body: 'On it — checking now.' });
    expect(afterAgent.messages).toHaveLength(2);
    expect(afterAgent.unread).toEqual({ subscriber: 1, agent: 1 }); // agent reply → subscriber unread++
    expect(afterAgent.lastMessagePreview).toContain('On it');

    const afterSub = await sendMessage(t.id, { sender: SENDER_ROLE.SUBSCRIBER, body: 'Thank you!' });
    expect(afterSub.messages).toHaveLength(3);
    expect(afterSub.unread).toEqual({ subscriber: 1, agent: 2 }); // subscriber send → agent unread++

    await expect(sendMessage(t.id, { sender: SENDER_ROLE.SUBSCRIBER, body: '' })).rejects.toThrow();
  });

  it('closeTicket closes an open ticket and is a guarded no-op when already closed', async () => {
    const t = await createTicket(SUB, draft());
    const closed = await closeTicket(t.id, { by: SENDER_ROLE.SUBSCRIBER });
    expect(closed.status).toBe(TICKET_STATUS.CLOSED);
    expect(closed.closedBy).toBe(SENDER_ROLE.SUBSCRIBER);
    expect(closed.closedAt).toBeTruthy();

    const msgCount = closed.messages.length;
    const again = await closeTicket(t.id, { by: SENDER_ROLE.AGENT }); // guard: no-op
    expect(again.status).toBe(TICKET_STATUS.CLOSED);
    expect(again.closedBy).toBe(SENDER_ROLE.SUBSCRIBER); // unchanged
    expect(again.messages).toHaveLength(msgCount);
  });

  it('reopenTicket reopens a closed ticket with a SYSTEM message; is a no-op on an open ticket', async () => {
    const t = await createTicket(SUB, draft());

    // Reopen on an OPEN ticket → unchanged, no system message appended.
    const noop = await reopenTicket(t.id, { by: SENDER_ROLE.AGENT });
    expect(noop.status).toBe(TICKET_STATUS.OPEN);
    expect(noop.messages).toHaveLength(1);

    await closeTicket(t.id, { by: SENDER_ROLE.AGENT });
    const reopened = await reopenTicket(t.id, { by: SENDER_ROLE.SUBSCRIBER });
    expect(reopened.status).toBe(TICKET_STATUS.OPEN);
    expect(reopened.closedAt).toBeNull();
    expect(reopened.closedBy).toBeNull();
    const last = reopened.messages[reopened.messages.length - 1];
    expect(last.sender).toBe(SENDER_ROLE.SYSTEM);
    expect(last.body).toMatch(/reopened/i);
  });

  it('markRead zeroes only the requested viewer’s unread counter', async () => {
    const t = await createTicket(SUB, draft()); // unread.agent = 1
    const read = await markRead(t.id, { viewer: SENDER_ROLE.AGENT });
    expect(read.unread.agent).toBe(0);
    expect(read.unread.subscriber).toBe(0);
  });

  it('mutations on an unknown ticket return null instead of throwing', async () => {
    expect(await sendMessage('tk-nope', { sender: SENDER_ROLE.AGENT, body: 'x' })).toBeNull();
    expect(await closeTicket('tk-nope', { by: SENDER_ROLE.AGENT })).toBeNull();
    expect(await reopenTicket('tk-nope', { by: SENDER_ROLE.AGENT })).toBeNull();
    expect(await markRead('tk-nope', { viewer: SENDER_ROLE.AGENT })).toBeNull();
  });
});

describe('tickets service — oversight metrics', () => {
  it('branch metrics reconcile counts, bound unanswered by open, and break down by agent', async () => {
    const m = await getBranchTicketMetrics(BRANCH);
    expect(m.openCount + m.closedCount).toBe(m.totalCount);
    expect(typeof m.avgFirstResponseHours).toBe('number');
    expect(typeof m.avgResolutionHours).toBe('number');
    expect(m.avgFirstResponseHours).toBeGreaterThanOrEqual(0);
    expect(m.avgResolutionHours).toBeGreaterThanOrEqual(0);
    expect(m.unansweredCount).toBeGreaterThanOrEqual(0);
    expect(m.unansweredCount).toBeLessThanOrEqual(m.openCount);

    const row = m.byAgent.find((r) => r.agentId === AGENT);
    expect(row).toBeDefined();
    expect(row.name).toBeTruthy();
    expect(row.name).not.toBe('Unknown');
    expect(row.openCount + row.closedCount).toBeLessThanOrEqual(m.totalCount);
  });

  it('distributor metrics aggregate at least the branch totals', async () => {
    const branchM = await getBranchTicketMetrics(BRANCH);
    const distM = await getDistributorTicketMetrics(DISTRIBUTOR);
    expect(distM.totalCount).toBeGreaterThanOrEqual(branchM.totalCount);
    expect(distM.openCount + distM.closedCount).toBe(distM.totalCount);
  });
});
