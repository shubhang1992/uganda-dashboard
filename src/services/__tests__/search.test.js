// search service tests — exercise both the Supabase-backed RPC path and the
// env-fallback (`IS_SUPABASE_ENABLED === false`) mock branch.
//
// The X11 finding is the load-bearing concern here: both branches must return
// the SAME shape — `{id, name, level, label, parentId}` with `parentId`
// camelCase, never `parent_id`. The mock branch reads camelCase already
// (mockData carries `parentId`), but the RPC returns `parent_id` and the
// service must remap. We assert both paths return the same field names.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';

const supabaseMock = makeSupabaseMock();

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

beforeEach(() => {
  supabaseMock.__reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('search service — real (Supabase) branch', () => {
  // Default IS_SUPABASE_ENABLED is true for these tests.
  let searchEntities;
  beforeEach(async () => {
    const mod = await import('../search');
    searchEntities = mod.searchEntities;
  });

  it('returns [] when query is empty', async () => {
    expect(await searchEntities('')).toEqual([]);
    expect(supabaseMock.__getRpcCalls('search_entities')).toHaveLength(0);
  });

  it('returns [] when query is shorter than 2 chars (no round-trip)', async () => {
    expect(await searchEntities('a')).toEqual([]);
    expect(supabaseMock.__getRpcCalls('search_entities')).toHaveLength(0);
  });

  it('calls the search_entities RPC with the query string', async () => {
    supabaseMock.__queueRpc('search_entities', { data: [], error: null });
    await searchEntities('kamp');
    const call = supabaseMock.__getRpcCalls('search_entities').at(-1);
    expect(call.args).toEqual({ p_q: 'kamp' });
  });

  it('maps RPC OUT columns (entity_id, entity_name, parent_id) to camelCase', async () => {
    supabaseMock.__queueRpc('search_entities', {
      data: [
        {
          entity_id: 'b-kam-015',
          entity_name: 'Kampala Branch 15',
          level: 'branch',
          label: 'Branch',
          parent_id: 'd-kampala',
          score: 0.9,
        },
        {
          entity_id: 'r-central',
          entity_name: 'Central',
          level: 'region',
          label: 'Region',
          parent_id: 'ug',
          score: 0.5,
        },
      ],
      error: null,
    });
    const results = await searchEntities('central');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: 'b-kam-015',
      name: 'Kampala Branch 15',
      level: 'branch',
      label: 'Branch',
      parentId: 'd-kampala',
    });
    // `score` is intentionally dropped — UI doesn't need it.
    expect(results[0].score).toBeUndefined();
  });

  it('returns [] when the RPC returns null data', async () => {
    supabaseMock.__queueRpc('search_entities', { data: null, error: null });
    expect(await searchEntities('xyz')).toEqual([]);
  });

  it('throws when the RPC returns an error', async () => {
    supabaseMock.__queueRpc('search_entities', {
      data: null,
      error: { message: 'permission denied' },
    });
    await expect(searchEntities('kamp')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

describe('search service — mock-fallback branch (IS_SUPABASE_ENABLED=false)', () => {
  let searchEntities;

  beforeEach(async () => {
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    // Re-mock the supabase client for the freshly imported module graph.
    vi.doMock('../supabaseClient', () => ({
      supabase: supabaseMock,
      default: supabaseMock,
      getToken: vi.fn(),
      setToken: vi.fn(),
      clearToken: vi.fn(),
    }));
    const mod = await import('../search');
    searchEntities = mod.searchEntities;
  });

  it('still respects the <2-char short-circuit', async () => {
    expect(await searchEntities('a')).toEqual([]);
  });

  it('returns results filtered against the seeded mockData index', async () => {
    const results = await searchEntities('kampala');
    expect(Array.isArray(results)).toBe(true);
    // Every result must have the same camelCase shape as the real branch.
    if (results.length > 0) {
      const sample = results[0];
      expect(sample).toHaveProperty('id');
      expect(sample).toHaveProperty('name');
      expect(sample).toHaveProperty('level');
      expect(sample).toHaveProperty('label');
      expect(sample).toHaveProperty('parentId');
      // Crucially NOT parent_id — that's the X11 parity check.
      expect(sample).not.toHaveProperty('parent_id');
    }
  });

  it('caps at 8 results to match the RPC contract', async () => {
    // Single-letter query would be filtered by the short-circuit; "a" still
    // hits the short-circuit. Use a common pattern in branches/agents pool.
    const results = await searchEntities('na');
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('does not call Supabase in mock mode', async () => {
    supabaseMock.__reset();
    await searchEntities('kampala');
    expect(supabaseMock.__getRpcCalls('search_entities')).toHaveLength(0);
  });
});

describe('search service — real/mock branch parity (X11)', () => {
  it('real and mock branches produce the same field names on a hit', async () => {
    // Real branch
    const realMod = await import('../search');
    supabaseMock.__queueRpc('search_entities', {
      data: [{
        entity_id: 'x', entity_name: 'X', level: 'region', label: 'Region',
        parent_id: 'ug', score: 1,
      }],
      error: null,
    });
    const realResults = await realMod.searchEntities('xx');
    const realKeys = Object.keys(realResults[0]).sort();

    // Mock branch
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    vi.doMock('../supabaseClient', () => ({
      supabase: supabaseMock,
      default: supabaseMock,
      getToken: vi.fn(),
      setToken: vi.fn(),
      clearToken: vi.fn(),
    }));
    const mockMod = await import('../search');
    const mockResults = await mockMod.searchEntities('kampala');
    if (mockResults.length > 0) {
      const mockKeys = Object.keys(mockResults[0]).sort();
      expect(mockKeys).toEqual(realKeys);
    }
  });
});
