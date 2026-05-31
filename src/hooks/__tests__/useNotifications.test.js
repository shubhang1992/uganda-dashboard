// Unit tests for the `useNotifications` family of hooks.
//
// Strategy: mock the `../../services/notifications` service so we test the hook
// layer in isolation — React Query keys, query gating, and the invalidation
// blast on mark-read. The service module is covered directly in
// `src/services/__tests__/notifications.test.js`. Mirrors useCommission.test.js.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/notifications', () => ({
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationsRead: vi.fn(),
}));

const notifications = await import('../../services/notifications');
const {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationsRead,
} = await import('../useNotifications');

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000 },
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

describe('useNotifications hooks — queries', () => {
  it('useNotifications is disabled without role/entityId', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications({ role: 'agent', entityId: null }), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(notifications.listNotifications).not.toHaveBeenCalled();
  });

  it('useNotifications forwards the params and keys cache by role/entityId/unreadOnly', async () => {
    notifications.listNotifications.mockResolvedValueOnce(['all']);
    notifications.listNotifications.mockResolvedValueOnce(['unread']);
    const { Wrapper } = makeWrapper();
    const { result: rAll } = renderHook(
      () => useNotifications({ role: 'agent', entityId: 'a-001' }),
      { wrapper: Wrapper },
    );
    const { result: rUnread } = renderHook(
      () => useNotifications({ role: 'agent', entityId: 'a-001', unreadOnly: true }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(rAll.current.isSuccess).toBe(true));
    await waitFor(() => expect(rUnread.current.isSuccess).toBe(true));
    expect(rAll.current.data).toEqual(['all']);
    expect(rUnread.current.data).toEqual(['unread']);
    expect(notifications.listNotifications).toHaveBeenCalledWith({ role: 'agent', entityId: 'a-001', unreadOnly: false });
    expect(notifications.listNotifications).toHaveBeenCalledWith({ role: 'agent', entityId: 'a-001', unreadOnly: true });
  });

  it('useUnreadNotificationCount gates on role/entityId and returns the count', async () => {
    notifications.getUnreadCount.mockResolvedValue(3);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useUnreadNotificationCount({ role: 'branch', entityId: 'b-1' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(3);
    expect(notifications.getUnreadCount).toHaveBeenCalledWith({ role: 'branch', entityId: 'b-1' });
  });

  it('useNotifications (feed list) polls on the same cadence as the unread badge', async () => {
    // BL-11/D-M1: the feed list and the badge must share a poll so the popover/
    // inline card can't show "all caught up" while the bell shows unread. Assert
    // the list query carries a numeric refetchInterval and force-refetches on
    // mount (so opening the bell shows the latest list, not a stale cached one).
    notifications.listNotifications.mockResolvedValue(['n1']);
    notifications.getUnreadCount.mockResolvedValue(0);
    const { queryClient, Wrapper } = makeWrapper();
    const { result: rList } = renderHook(
      () => useNotifications({ role: 'agent', entityId: 'a-001' }),
      { wrapper: Wrapper },
    );
    const { result: rBadge } = renderHook(
      () => useUnreadNotificationCount({ role: 'agent', entityId: 'a-001' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(rList.current.isSuccess).toBe(true));
    await waitFor(() => expect(rBadge.current.isSuccess).toBe(true));

    const listQuery = queryClient
      .getQueryCache()
      .find({ queryKey: ['notifications', 'agent', 'a-001', false] });
    const badgeQuery = queryClient
      .getQueryCache()
      .find({ queryKey: ['notificationsUnread', 'agent', 'a-001'] });

    expect(typeof listQuery.options.refetchInterval).toBe('number');
    expect(listQuery.options.refetchInterval).toBe(badgeQuery.options.refetchInterval);
    expect(listQuery.options.refetchOnMount).toBe('always');
  });
});

describe('useNotifications hooks — mutations', () => {
  it('useMarkNotificationsRead forwards args and invalidates both feed keys on success', async () => {
    notifications.markNotificationsRead.mockResolvedValue(undefined);
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper: Wrapper });

    const args = { role: 'agent', entityId: 'a-001', ids: ['ntf-1'] };
    await act(async () => {
      await result.current.mutateAsync(args);
    });

    expect(notifications.markNotificationsRead).toHaveBeenCalledWith(args);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notificationsUnread'] });
  });
});
