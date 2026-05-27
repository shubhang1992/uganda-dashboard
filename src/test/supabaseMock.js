// Test helper — mock chain for `@supabase/supabase-js` calls.
//
// supabase-js exposes a fluent query builder (`.from(t).select(...).eq(...).maybeSingle()`)
// that resolves at the `await` point to `{ data, error }`. Each link in the
// chain returns `this`, so we expose a thenable proxy that any chained method
// can be invoked on. Awaiting the chain resolves the canned `{ data, error }`
// result the test seeded.
//
// Usage:
//   import { vi } from 'vitest';
//   import { makeSupabaseMock, makeChain } from '@/test/supabaseMock';
//
//   const mock = makeSupabaseMock();
//   vi.mock('@/services/supabaseClient', () => ({
//     supabase: mock,
//     getToken: vi.fn(),
//     setToken: vi.fn(),
//     clearToken: vi.fn(),
//   }));
//
//   // Per test:
//   mock.__queueFrom('settlement_runs', { data: [...], error: null });
//   mock.__queueRpc('get_commission_summary', { data: {...}, error: null });
//
// Each `.from(table)` call pulls the next queued result for that table off
// a FIFO; each `.rpc(name)` call pulls the next queued result for that RPC.
// If nothing is queued, we resolve to `{ data: null, error: null }` and emit
// a warning — useful for surfacing tests that forgot to seed.

import { vi } from 'vitest';

/** Create a chainable query-builder stub that resolves to `result` on await. */
export function makeChain(result) {
  const chain = {};
  const passThrough = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'in', 'is', 'not', 'or', 'filter', 'match',
    'contains', 'containedBy', 'overlaps',
    'order', 'limit', 'range', 'offset',
    'single', 'maybeSingle',
  ];
  for (const m of passThrough) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Thenable so `await chain` resolves to the canned result.
  chain.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  // Some chains await `.then()` chained off a terminating method that already
  // returned a Promise (e.g. supabase's `.single()` returns `PromiseLike`); the
  // fluent fallback above handles that because `.single()` returns `this`.
  return chain;
}

/**
 * Build a mock supabase client with FIFO-queued responses per table/rpc name.
 *
 * Methods exposed on the returned object:
 *   - `from(table)` / `rpc(name, args)` — the supabase API (vi.fn instances)
 *   - `__queueFrom(table, result)` — push a canned `{data, error}` for one call
 *   - `__queueRpc(name, result)` — push a canned `{data, error}` for one call
 *   - `__reset()` — clear all queued responses + call history
 *   - `__getFromCalls(table?)`, `__getRpcCalls(name?)` — inspect call args
 */
export function makeSupabaseMock() {
  /** Map<string, Array<result>> — FIFO of seeded results per table. */
  const fromQueue = new Map();
  /** Map<string, Array<result>> — FIFO of seeded results per rpc name. */
  const rpcQueue = new Map();
  /** Array<{table, chain}> — every `.from(table)` call. */
  const fromCalls = [];
  /** Array<{name, args, result}> — every `.rpc(name, args)` call. */
  const rpcCalls = [];

  const client = {
    from: vi.fn((table) => {
      const queued = (fromQueue.get(table) || []).shift();
      const result = queued ?? { data: null, error: null };
      const chain = makeChain(result);
      fromCalls.push({ table, chain });
      return chain;
    }),
    rpc: vi.fn((name, args) => {
      const queued = (rpcQueue.get(name) || []).shift();
      const result = queued ?? { data: null, error: null };
      rpcCalls.push({ name, args, result });
      return Promise.resolve(result);
    }),
    __queueFrom(table, result) {
      if (!fromQueue.has(table)) fromQueue.set(table, []);
      fromQueue.get(table).push(result);
    },
    __queueRpc(name, result) {
      if (!rpcQueue.has(name)) rpcQueue.set(name, []);
      rpcQueue.get(name).push(result);
    },
    __reset() {
      fromQueue.clear();
      rpcQueue.clear();
      fromCalls.length = 0;
      rpcCalls.length = 0;
      client.from.mockClear();
      client.rpc.mockClear();
    },
    __getFromCalls(table) {
      return table ? fromCalls.filter((c) => c.table === table) : fromCalls;
    },
    __getRpcCalls(name) {
      return name ? rpcCalls.filter((c) => c.name === name) : rpcCalls;
    },
  };
  return client;
}
