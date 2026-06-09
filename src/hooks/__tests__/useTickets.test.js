// Unit tests for the `useTickets` family of hooks (audit §7b.7).
//
// The ticket SERVICE is already well covered (tickets.test.js); this file pins
// the React-Query wiring the service tests don't see: query enablement/gating,
// the derived unread badge, and the optimistic mutation patches + rollback
// (send / close / reopen / markRead) that drive the live-feel cross-view sync.
//
// Strategy mirrors useEntity.test.js / useEmployer.test.js: mock the service
// module so no real store is touched. The frozen enum module (ticketsSeed.js)
// is NOT mocked — the hook imports SENDER_ROLE / TICKET_STATUS from it as
// contract constants, and the optimistic patches depend on their real values.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SENDER_ROLE, TICKET_STATUS } from '../../data/ticketsSeed.js';

vi.mock('../../services/tickets', () => ({
  listTicketsForSubscriber: vi.fn(),
  listTicketsForAgent: vi.fn(),
  listTicketsForBranch: vi.fn(),
  listTicketsForDistributor: vi.fn(),
  listTicketsForEmployer: vi.fn(),
  getThread: vi.fn(),
  getBranchTicketMetrics: vi.fn(),
  getDistributorTicketMetrics: vi.fn(),
  getEmployerTicketMetrics: vi.fn(),
  createTicket: vi.fn(),
  createAgentMessage: vi.fn(),
  createEmployerTicket: vi.fn(),
  sendMessage: vi.fn(),
  closeTicket: vi.fn(),
  reopenTicket: vi.fn(),
  markRead: vi.fn(),
}));

const tickets = await import('../../services/tickets');
const {
  useSubscriberTickets,
  useAgentTickets,
  useAgentUnreadTicketCount,
  useEmployerTickets,
  useTicketThread,
  useCreateTicket,
  useSendMessage,
  useCloseTicket,
  useReopenTicket,
  useMarkTicketRead,
} = await import('../useTickets');

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Disable polling refetch in tests so the queryFn fires exactly once.
      queries: { retry: false, staleTime: 5 * 60 * 1000, refetchInterval: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
  return { queryClient, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('useTickets hooks — reads', () => {
  it('useSubscriberTickets is disabled without a subscriberId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubscriberTickets(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(tickets.listTicketsForSubscriber).not.toHaveBeenCalled();
  });

  it('useSubscriberTickets fetches scoped to id + status', async () => {
    tickets.listTicketsForSubscriber.mockResolvedValue([{ id: 'tk-1' }]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubscriberTickets('s-1', { status: 'open' }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'tk-1' }]);
    expect(tickets.listTicketsForSubscriber).toHaveBeenCalledWith('s-1', { status: 'open' });
  });

  it('useAgentTickets with no status shares the "all" cache key', async () => {
    tickets.listTicketsForAgent.mockResolvedValue([{ id: 'tk-2' }]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentTickets('a-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tickets.listTicketsForAgent).toHaveBeenCalledWith('a-1', { status: undefined });
  });

  it('useEmployerTickets is disabled without an employerId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useEmployerTickets(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(tickets.listTicketsForEmployer).not.toHaveBeenCalled();
  });

  it('useAgentUnreadTicketCount sums agent unread over OPEN tickets only', async () => {
    tickets.listTicketsForAgent.mockResolvedValue([
      { id: 'tk-1', status: TICKET_STATUS.OPEN, unread: { agent: 3 } },
      { id: 'tk-2', status: TICKET_STATUS.OPEN, unread: { agent: 2 } },
      // A closed ticket carries no actionable unread — excluded.
      { id: 'tk-3', status: TICKET_STATUS.CLOSED, unread: { agent: 9 } },
    ]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentUnreadTicketCount('a-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current).toBe(5));
  });

  it('useAgentUnreadTicketCount returns 0 with no agentId / no data', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentUnreadTicketCount(null), { wrapper: Wrapper });
    expect(result.current).toBe(0);
  });

  it('useTicketThread is disabled without a ticketId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTicketThread(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(tickets.getThread).not.toHaveBeenCalled();
  });
});

describe('useTickets hooks — mutations', () => {
  it('useCreateTicket calls the service with routing and invalidates the ticket caches', async () => {
    tickets.createTicket.mockResolvedValue({ id: 'tk-new' });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const routing = { agentId: 'a-1', branchId: 'b-1' };
    const { result } = renderHook(() => useCreateTicket('s-1', routing), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ subject: 'Help', body: 'I need help' });
    });

    expect(tickets.createTicket).toHaveBeenCalledWith('s-1', { subject: 'Help', body: 'I need help' }, routing);
    // invalidateAllTickets touches all three prefixes.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tickets'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ticketThread'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ticketMetrics'] });
  });

  it('useSendMessage optimistically appends the message + bumps the recipient unread', async () => {
    let resolveSend;
    tickets.sendMessage.mockReturnValue(new Promise((res) => { resolveSend = res; }));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['ticketThread', 'tk-1'], {
      id: 'tk-1',
      messages: [{ id: 'm-1', sender: SENDER_ROLE.SUBSCRIBER, body: 'hi', at: '2026-05-01' }],
      unread: { subscriber: 0, agent: 0 },
      updatedAt: '2026-05-01',
      lastMessagePreview: 'hi',
    });

    const { result } = renderHook(() => useSendMessage('tk-1'), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ sender: SENDER_ROLE.SUBSCRIBER, body: 'second message' });
    });

    await waitFor(() => {
      const thread = queryClient.getQueryData(['ticketThread', 'tk-1']);
      expect(thread.messages).toHaveLength(2);
      expect(thread.messages[1].body).toBe('second message');
      // A subscriber message bumps the agent's unread counter.
      expect(thread.unread.agent).toBe(1);
      expect(thread.lastMessagePreview).toBe('second message');
    });

    await act(async () => { resolveSend({ id: 'm-2' }); });
  });

  it('useSendMessage rolls the thread back on error', async () => {
    tickets.sendMessage.mockRejectedValue(new Error('store down'));
    const { queryClient, Wrapper } = makeWrapper();
    const original = {
      id: 'tk-1',
      messages: [{ id: 'm-1', sender: SENDER_ROLE.AGENT, body: 'hi', at: '2026-05-01' }],
      unread: { subscriber: 0, agent: 0 },
      updatedAt: '2026-05-01',
      lastMessagePreview: 'hi',
    };
    queryClient.setQueryData(['ticketThread', 'tk-1'], original);

    const { result } = renderHook(() => useSendMessage('tk-1'), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ sender: SENDER_ROLE.SUBSCRIBER, body: 'will fail' });
      } catch {
        // Expected.
      }
    });

    expect(queryClient.getQueryData(['ticketThread', 'tk-1'])).toEqual(original);
  });

  it('useCloseTicket optimistically flips an OPEN thread to CLOSED', async () => {
    let resolveClose;
    tickets.closeTicket.mockReturnValue(new Promise((res) => { resolveClose = res; }));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['ticketThread', 'tk-1'], { id: 'tk-1', status: TICKET_STATUS.OPEN });

    const { result } = renderHook(() => useCloseTicket('tk-1'), { wrapper: Wrapper });
    act(() => { result.current.mutate({ by: SENDER_ROLE.AGENT }); });

    await waitFor(() => {
      const t = queryClient.getQueryData(['ticketThread', 'tk-1']);
      expect(t.status).toBe(TICKET_STATUS.CLOSED);
      expect(t.closedBy).toBe(SENDER_ROLE.AGENT);
    });

    await act(async () => { resolveClose({ id: 'tk-1' }); });
  });

  it('useReopenTicket optimistically flips a CLOSED thread back to OPEN', async () => {
    let resolveReopen;
    tickets.reopenTicket.mockReturnValue(new Promise((res) => { resolveReopen = res; }));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['ticketThread', 'tk-1'], {
      id: 'tk-1', status: TICKET_STATUS.CLOSED, closedAt: '2026-05-02', closedBy: SENDER_ROLE.AGENT,
    });

    const { result } = renderHook(() => useReopenTicket('tk-1'), { wrapper: Wrapper });
    act(() => { result.current.mutate({ by: SENDER_ROLE.SUBSCRIBER }); });

    await waitFor(() => {
      const t = queryClient.getQueryData(['ticketThread', 'tk-1']);
      expect(t.status).toBe(TICKET_STATUS.OPEN);
      expect(t.closedAt).toBeNull();
      expect(t.closedBy).toBeNull();
    });

    await act(async () => { resolveReopen({ id: 'tk-1' }); });
  });

  it('useMarkTicketRead optimistically zeroes the viewer unread counter', async () => {
    let resolveRead;
    tickets.markRead.mockReturnValue(new Promise((res) => { resolveRead = res; }));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['ticketThread', 'tk-1'], { id: 'tk-1', unread: { subscriber: 4, agent: 2 } });

    const { result } = renderHook(() => useMarkTicketRead('tk-1'), { wrapper: Wrapper });
    act(() => { result.current.mutate({ viewer: SENDER_ROLE.SUBSCRIBER }); });

    await waitFor(() => {
      const t = queryClient.getQueryData(['ticketThread', 'tk-1']);
      expect(t.unread.subscriber).toBe(0);
      // The other viewer's counter is untouched.
      expect(t.unread.agent).toBe(2);
    });

    await act(async () => { resolveRead({ id: 'tk-1' }); });
  });
});
