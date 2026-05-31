// Notifications service tests — mock mode (IS_SUPABASE_ENABLED forced false).
//
// Phase 3 of the commission-flow simplification. These exercise the in-memory
// branch of the service (the rollback path used when VITE_USE_SUPABASE=false):
// the seeded feed reads, the unread count, the mark-read flip, and the
// settlement-notification creation hook. We force that branch by mocking
// `../api` (mirrors commissions.test.js).
//
// supabaseClient is mocked to a no-op so importing the service never touches a
// live client; the mock branch never calls it.

import { describe, it, expect, vi } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';

const supabaseMock = makeSupabaseMock();

// Force the rollback/mock branch in every service function.
vi.mock('../api', () => ({
  IS_SUPABASE_ENABLED: false,
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));
vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  createCommissionSettledNotifications,
} = await import('../notifications');
const { applySettlementUpload } = await import('../commissions');
const { commissionsByAgent, AGENTS } = await import('../../data/mockData');

describe('notifications service (mock mode)', () => {
  describe('listNotifications()', () => {
    it('filters by recipient (role + entityId) and returns newest-first', async () => {
      const rows = await listNotifications({ role: 'agent', entityId: 'a-001' });
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((n) => {
        expect(n.recipientRole).toBe('agent');
        expect(n.recipientId).toBe('a-001');
      });
      // newest-first by createdAt
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].createdAt >= rows[i].createdAt).toBe(true);
      }
    });

    it('does not leak another recipient\'s feed', async () => {
      const rows = await listNotifications({ role: 'agent', entityId: 'a-002' });
      rows.forEach((n) => expect(n.recipientId).toBe('a-002'));
    });

    it('unreadOnly returns only unread notifications', async () => {
      const all = await listNotifications({ role: 'agent', entityId: 'a-001' });
      const unread = await listNotifications({ role: 'agent', entityId: 'a-001', unreadOnly: true });
      unread.forEach((n) => expect(n.isRead).toBe(false));
      expect(unread.length).toBeLessThanOrEqual(all.length);
    });

    it('returns the full notification shape', async () => {
      const [n] = await listNotifications({ role: 'agent', entityId: 'a-001' });
      expect(n).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          recipientRole: 'agent',
          recipientId: 'a-001',
          type: expect.any(String),
          title: expect.any(String),
          body: expect.any(String),
          refId: expect.any(String),
          isRead: expect.any(Boolean),
          createdAt: expect.any(String),
        }),
      );
      expect(typeof n.amount).toBe('number');
    });

    it('stamps each mock row with a MOCK_NOW relative-time anchor (BL-37)', async () => {
      // In mock mode the seeded createdAts are anchored to MOCK_NOW, so the feed
      // must compute "3d"/"2w" labels against currentTime(), not the real wall
      // clock — the service supplies the anchor since components never import the
      // mock store. currentTime() === MOCK_NOW (2026-05-26) in mock mode.
      const { currentTime } = await import('../../data/mockData');
      const rows = await listNotifications({ role: 'agent', entityId: 'a-001' });
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((n) => {
        expect(n.nowAnchor).toBe(currentTime().toISOString());
      });
    });
  });

  describe('getUnreadCount()', () => {
    it('counts only the recipient\'s unread notifications', async () => {
      const unread = await listNotifications({ role: 'agent', entityId: 'a-002', unreadOnly: true });
      const count = await getUnreadCount({ role: 'agent', entityId: 'a-002' });
      expect(count).toBe(unread.length);
    });

    it('returns 0 for an unknown recipient', async () => {
      expect(await getUnreadCount({ role: 'agent', entityId: 'no-such-agent' })).toBe(0);
    });
  });

  describe('markNotificationsRead()', () => {
    it('flips all of a recipient\'s unread notifications when no ids are given', async () => {
      // Use a dedicated agent so this test doesn't perturb the others.
      const created = createCommissionSettledNotifications({
        agentId: 'a-mark-all',
        branchId: null,
        amount: 5000,
        lineCount: 2,
        refId: 'sb-mark-all',
      });
      expect(created.length).toBe(1);
      expect(await getUnreadCount({ role: 'agent', entityId: 'a-mark-all' })).toBe(1);

      await markNotificationsRead({ role: 'agent', entityId: 'a-mark-all' });
      expect(await getUnreadCount({ role: 'agent', entityId: 'a-mark-all' })).toBe(0);
      const after = await listNotifications({ role: 'agent', entityId: 'a-mark-all' });
      after.forEach((n) => expect(n.isRead).toBe(true));
    });

    it('flips only the supplied ids', async () => {
      createCommissionSettledNotifications({
        agentId: 'a-mark-some',
        branchId: null,
        amount: 1000,
        lineCount: 1,
        refId: 'sb-mark-some-1',
      });
      const second = createCommissionSettledNotifications({
        agentId: 'a-mark-some',
        branchId: null,
        amount: 2000,
        lineCount: 1,
        refId: 'sb-mark-some-2',
      });
      expect(await getUnreadCount({ role: 'agent', entityId: 'a-mark-some' })).toBe(2);

      await markNotificationsRead({ role: 'agent', entityId: 'a-mark-some', ids: [second[0].id] });
      expect(await getUnreadCount({ role: 'agent', entityId: 'a-mark-some' })).toBe(1);
    });
  });

  describe('createCommissionSettledNotifications()', () => {
    it('creates an agent + branch notification when a branchId is given', () => {
      const created = createCommissionSettledNotifications({
        agentId: 'a-create-both',
        branchId: 'b-create-both',
        amount: 9000,
        lineCount: 3,
        refId: 'sb-create-both',
      });
      expect(created.length).toBe(2);
      const agentN = created.find((n) => n.recipientRole === 'agent');
      const branchN = created.find((n) => n.recipientRole === 'branch');
      expect(agentN.recipientId).toBe('a-create-both');
      expect(branchN.recipientId).toBe('b-create-both');
      created.forEach((n) => {
        expect(n.type).toBe('commission_settled');
        expect(n.title).toBe('Commission settled');
        // BL-18: thousands separators + correct pluralization.
        expect(n.body).toBe('UGX 9,000 paid for 3 commissions.');
        expect(n.amount).toBe(9000);
        expect(n.refId).toBe('sb-create-both');
        expect(n.isRead).toBe(false);
        expect(typeof n.id).toBe('string');
      });
    });

    it('creates only an agent notification when no branchId is given', () => {
      const created = createCommissionSettledNotifications({
        agentId: 'a-create-agent-only',
        branchId: null,
        amount: 4000,
        lineCount: 1,
        refId: 'sb-create-agent-only',
      });
      expect(created.length).toBe(1);
      expect(created[0].recipientRole).toBe('agent');
      // Singular pluralization for a one-line settlement (BL-18).
      expect(created[0].body).toBe('UGX 4,000 paid for 1 commission.');
    });

    it('mints unique ids per notification', () => {
      const a = createCommissionSettledNotifications({
        agentId: 'a-unique', branchId: 'b-unique', amount: 1, lineCount: 1, refId: 'sb-u',
      });
      expect(a[0].id).not.toBe(a[1].id);
    });
  });

  describe('integration: applySettlementUpload emits notifications', () => {
    it('produces a fresh notification for the settled agent', async () => {
      // Choose an agent that has at least one due line.
      const agentId = Object.keys(commissionsByAgent).find(
        (id) => (commissionsByAgent[id] || []).some((c) => c.status === 'due'),
      );
      expect(agentId).toBeTruthy();

      // Pay the full due total so the agent fully settles (FIFO covers all).
      const dueTotal = (commissionsByAgent[agentId] || [])
        .filter((c) => c.status === 'due')
        .reduce((s, c) => s + c.amount, 0);

      const before = await listNotifications({ role: 'agent', entityId: agentId });
      const result = await applySettlementUpload({
        rows: [{ agentId, amountPaid: dueTotal, paymentRef: 'TX-NTF-1', paymentDate: '2026-05-22' }],
      });
      expect(result.agentsSettled).toBe(1);
      expect(result.linesSettled).toBeGreaterThan(0);

      const after = await listNotifications({ role: 'agent', entityId: agentId });
      expect(after.length).toBe(before.length + 1);
      const newest = after[0];
      expect(newest.type).toBe('commission_settled');
      // The notification amount is the actually-allocated total (BL-2).
      expect(newest.amount).toBe(dueTotal);
      // The settlement result doesn't surface the batch id, but the notification
      // carries it as refId (the mock batch id is `sb-<year>-<base36>-<agentId>`).
      expect(newest.refId).toMatch(/^sb-/);

      // If the agent has a branch, the branch was notified too.
      const branchId = AGENTS[agentId]?.parentId || null;
      if (branchId) {
        const branchFeed = await listNotifications({ role: 'branch', entityId: branchId });
        expect(branchFeed.some((n) => n.refId === newest.refId)).toBe(true);
      }
    });
  });
});
