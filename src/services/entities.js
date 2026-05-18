// Entity data service — Supabase-backed.
//
// Phase 3 / Agent 9 rewrite: replaced the frozen-mockData + _entityOverrides
// pattern with direct `supabase.from()` selects and the three read-side RPCs
// (`get_entity_commission_summary`, `get_top_branch`, `get_breadcrumb`).
//
// Rollback path: when `IS_SUPABASE_ENABLED === false`, every function falls
// through to a mock implementation that reads `src/data/mockData.js` so the
// app keeps working from the seed snapshot. See `src/services/api.js` for the
// flag wiring.
//
// Naming convention: Supabase returns snake_case rows. We map them into the
// camelCase shape that components/hooks have always consumed (see
// CLAUDE.md "Data access rule") so this rewrite stays caller-transparent.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import {
  COUNTRY, REGIONS, DISTRICTS, BRANCHES, AGENTS, DISTRIBUTORS,
  getEntityById, getChildEntities, getAllEntities,
  getParentEntity, getTopBranch, getBreadcrumbPath,
} from '../data/mockData';

// ─── Mappers ────────────────────────────────────────────────────────────────
// Each table-row → entity mapper preserves the legacy camelCase keys that the
// hooks + components have been built against. The aggregated `metrics` block
// (landing-page-style totals) is not yet computed by the entity rewrite —
// `ViewAgents` and `ViewBranches` access `.metrics.totalSubscribers` etc.
// unguarded, so we return a zero-shape default rather than `null` to avoid
// crashing the branch/distributor shells. Real aggregation will replace these
// zeros once it's wired from commissions/transactions.
const EMPTY_METRICS = Object.freeze({
  totalSubscribers: 0,
  totalAgents: 0,
  totalContributions: 0,
  aum: 0,
  activeRate: 0,
  monthlyContributions: [],
  newSubscribersToday: 0,
  newSubscribersThisWeek: 0,
  newSubscribersThisMonth: 0,
});

function center(row) {
  if (row?.center_lng == null || row?.center_lat == null) return null;
  return [Number(row.center_lng), Number(row.center_lat)];
}

function mapRegion(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? 'ug',
    center: center(row),
    metrics: EMPTY_METRICS,
  };
}

function mapDistrict(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentId: row.region_id,
    center: center(row),
    active: row.active,
    metrics: EMPTY_METRICS,
  };
}

function mapBranch(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentId: row.district_id,
    center: center(row),
    managerName: row.manager_name,
    managerPhone: row.manager_phone,
    managerEmail: row.manager_email,
    status: row.status,
    score: row.score,
    rank: row.rank,
    districtRank: row.district_rank,
    districtBranchCount: row.district_branch_count,
    createdAt: row.created_at,
    metrics: EMPTY_METRICS,
  };
}

function mapAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    employeeId: row.employee_id,
    parentId: row.branch_id,
    center: center(row),
    phone: row.phone,
    email: row.email,
    rating: row.rating,
    performance: row.performance,
    status: row.status,
    languages: Array.isArray(row.languages) ? row.languages : [],
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    tenureMonths: row.tenure_months,
    joinedDate: row.joined_date,
    createdAt: row.created_at,
    metrics: EMPTY_METRICS,
  };
}

function mapSubscriber(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    age: row.age,
    dob: row.dob,
    nin: row.nin,
    occupation: row.occupation,
    parentId: row.agent_id,
    districtId: row.district_id,
    kycStatus: row.kyc_status,
    isActive: row.is_active,
    registeredDate: row.registered_date,
    productsHeld: Array.isArray(row.products_held) ? row.products_held : [],
    contributionHistory: Array.isArray(row.contribution_history) ? row.contribution_history : [],
    currentUnitValue: row.current_unit_value,
    unitValueAsOf: row.unit_value_as_of,
  };
}

// Distributors sit just above the country sentinel — there is one row in the
// demo seed (`d-001`). The `metrics` block is overwritten by
// `getDistributorMetrics()` once aggregated counts have been fetched.
function mapDistributor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? 'ug',
    managerName: row.manager_name,
    managerPhone: row.manager_phone,
    managerEmail: row.manager_email,
    status: row.status,
    createdAt: row.created_at,
    metrics: EMPTY_METRICS,
  };
}

const LEVEL_TABLES = {
  region: 'regions',
  district: 'districts',
  branch: 'branches',
  agent: 'agents',
  subscriber: 'subscribers',
  distributor: 'distributors',
};

const LEVEL_PARENT_FK = {
  // For a given parent level, which column on the *child* table is the FK?
  country: { childLevel: 'region', column: 'parent_id' },     // regions.parent_id = 'ug'
  region: { childLevel: 'district', column: 'region_id' },
  district: { childLevel: 'branch', column: 'district_id' },
  branch: { childLevel: 'agent', column: 'branch_id' },
  agent: { childLevel: 'subscriber', column: 'agent_id' },
};

const LEVEL_MAPPERS = {
  region: mapRegion,
  district: mapDistrict,
  branch: mapBranch,
  agent: mapAgent,
  subscriber: mapSubscriber,
  distributor: mapDistributor,
};

// ─── In-memory sync cache for getEntitySync ─────────────────────────────────
// `getEntitySync` is called by `DashboardNavContext.buildSelectedIds` during
// URL routing to walk the parent chain. Supabase calls are async, so we keep
// a per-process cache that is opportunistically populated by every async
// read in this file. First navigation may return null (the URL effect will
// then re-render once React Query resolves the data and the cache fills);
// subsequent navigations are sync. This is the minimum-surface alternative
// to refactoring DashboardNavContext to be async-aware.
const _syncCache = new Map();
function syncCacheKey(level, id) { return `${level}:${id}`; }
function cacheEntity(level, entity) {
  if (entity && entity.id) _syncCache.set(syncCacheKey(level, entity.id), entity);
}

// ─── Country sentinel ───────────────────────────────────────────────────────

/**
 * @endpoint (none — static sentinel)
 * @returns {Promise<{id: 'ug', name: 'Uganda', center: [number, number], metrics: null|Object}>}
 * @description Returns the country-level entity. Static — no DB hit. Falls
 *   back to the mockData country (which carries aggregated metrics) so the
 *   Distributor overlay panel keeps showing roll-up numbers; under Supabase
 *   the live aggregation is done by the read RPCs.
 * @cache ['country']
 * @scope All authenticated roles.
 */
export async function getCountry() {
  // The country row isn't stored in Supabase (regions.parent_id = 'ug' is the
  // sentinel reference). Returning the mock COUNTRY keeps the overlay's
  // pre-computed metrics block working. Once we wire live aggregation we'll
  // recompute these from get_entity_commission_summary + transactions.
  cacheEntity('country', COUNTRY);
  return COUNTRY;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * @endpoint SELECT 1 row from the level's table.
 * @param {string} level - region|district|branch|agent|subscriber
 * @param {string} id
 * @returns {Promise<Object|null>} mapped entity, or null if not found.
 * @cache ['entity', level, id]
 * @scope RLS-enforced. Distributor: any; Branch: own branch + children; etc.
 */
export async function getEntity(level, id) {
  if (!IS_SUPABASE_ENABLED) {
    return getEntityById(level, id);
  }
  if (level === 'country') {
    return getCountry();
  }
  const table = LEVEL_TABLES[level];
  const mapper = LEVEL_MAPPERS[level];
  if (!table || !mapper) return null;

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    // PGRST116 = no row found via .single(); .maybeSingle returns null already.
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const entity = mapper(data);
  cacheEntity(level, entity);
  return entity;
}

/**
 * @endpoint SELECT * FROM <child-table> WHERE <parent-fk> = $1
 * @param {string} parentLevel - country|region|district|branch|agent
 * @param {string} parentId
 * @returns {Promise<Array<Object>>}
 * @cache ['children', parentLevel, parentId]
 */
export async function getChildren(parentLevel, parentId) {
  if (!IS_SUPABASE_ENABLED) {
    const childLevel = LEVEL_PARENT_FK[parentLevel]?.childLevel;
    const list = getChildEntities(parentLevel, parentId);
    if (!childLevel) return list;
    return list;
  }
  const cfg = LEVEL_PARENT_FK[parentLevel];
  if (!cfg) return [];
  const table = LEVEL_TABLES[cfg.childLevel];
  const mapper = LEVEL_MAPPERS[cfg.childLevel];
  if (!table || !mapper) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(cfg.column, parentId);

  if (error) throw error;
  const mapped = (data ?? []).map(mapper);
  mapped.forEach((e) => cacheEntity(cfg.childLevel, e));
  return mapped;
}

/**
 * @endpoint SELECT * FROM <level-table>
 * @param {string} level - region|district|branch|agent|subscriber
 * @returns {Promise<Array<Object>>}
 * @cache ['entities', level]
 * @description WARNING: for `subscriber` this is ~30k rows; the existing
 *   prototype paginates client-side. Production will need server-side
 *   pagination — see `docs/api-contracts.md`. We keep the function shape so
 *   no caller has to change today.
 */
export async function getAllAtLevel(level) {
  if (!IS_SUPABASE_ENABLED) {
    return getAllEntities(level);
  }
  const table = LEVEL_TABLES[level];
  const mapper = LEVEL_MAPPERS[level];
  if (!table || !mapper) return [];

  const { data, error } = await supabase
    .from(table)
    .select('*');

  if (error) throw error;
  const mapped = (data ?? []).map(mapper);
  mapped.forEach((e) => cacheEntity(level, e));
  return mapped;
}

/**
 * @description Returns all entities at a level as a Map<id, entity> for
 *   O(1) lookups (used by report views).
 * @param {string} level
 * @returns {Promise<Object<string, Object>>}
 * @cache ['entitiesMap', level]
 */
export async function getAllAtLevelMap(level) {
  const list = await getAllAtLevel(level);
  const map = {};
  list.forEach((e) => { map[e.id] = e; });
  return map;
}

/**
 * @description Walks back to the parent at the next level up. Kept for hook
 *   compat — production callers should pull `parentId` off the entity row
 *   directly (the React Query cache already has it).
 * @param {string} level
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getParent(level, id) {
  if (!IS_SUPABASE_ENABLED) {
    return getParentEntity(level, id);
  }
  const entity = await getEntity(level, id);
  if (!entity?.parentId) return null;
  const order = ['country', 'region', 'district', 'branch', 'agent'];
  const idx = order.indexOf(level);
  if (idx <= 0) return COUNTRY;
  return getEntity(order[idx - 1], entity.parentId);
}

/**
 * @endpoint RPC `get_top_branch(level, parent_id)`
 * @param {string} level - country|region|district
 * @param {string} parentId
 * @returns {Promise<{name: string, contribution: number}|null>}
 * @cache ['topBranch', level, parentId]
 */
export async function getTopPerformingBranch(level, parentId) {
  if (!IS_SUPABASE_ENABLED) {
    return getTopBranch(level, parentId);
  }
  const { data, error } = await supabase.rpc('get_top_branch', {
    p_level: level,
    p_parent_id: parentId,
  });
  if (error) throw error;
  return data ?? null;
}

/**
 * @endpoint RPC `get_breadcrumb(level, ids)`
 * @param {string} currentLevel
 * @param {Record<string,string>} selectedIds
 * @returns {Promise<Array<{level: string, id: string, name: string}>>}
 * @cache ['breadcrumb', currentLevel, selectedIds]
 */
export async function getBreadcrumb(currentLevel, selectedIds) {
  if (!IS_SUPABASE_ENABLED) {
    return getBreadcrumbPath(currentLevel, selectedIds);
  }
  const { data, error } = await supabase.rpc('get_breadcrumb', {
    p_level: currentLevel,
    p_ids: selectedIds ?? {},
  });
  if (error) throw error;
  // RPC returns jsonb array of { level, id, name } — pass through.
  return Array.isArray(data) ? data : [];
}

/**
 * @description Synchronous entity lookup. Used by `DashboardNavContext` to
 *   derive `selectedIds` from the URL during render.
 *
 *   DECISION (Agent 9): keep this sync but back it with a client-side cache
 *   that every async read in this file opportunistically populates. First
 *   navigation to a deep URL may return null (the route effect re-renders
 *   once React Query resolves and the cache fills); subsequent renders are
 *   sync. This required ZERO caller changes — the only caller is
 *   `DashboardNavContext.buildSelectedIds`, which already treated a null
 *   return as "stop walking". Alternative (a) — making the function async
 *   and refactoring the context — would have cascaded into every
 *   `useMemo`/`useEffect` in `DashboardNavContext` and is out of scope.
 *
 *   Under `IS_SUPABASE_ENABLED === false` this still reads frozen mockData
 *   directly (truly sync).
 */
export function getEntitySync(level, id) {
  if (!IS_SUPABASE_ENABLED) {
    return getEntityById(level, id);
  }
  if (level === 'country') return COUNTRY;
  return _syncCache.get(syncCacheKey(level, id)) ?? null;
}

/**
 * @description Aggregate the national roll-up displayed on the Distributor
 *   home view. Counts subscribers / agents / branches in parallel; AUM
 *   (sum of `subscriber_balances.total_balance`) is fetched once via a
 *   dedicated RPC-style aggregate select and folded into the result. Under
 *   the mock fallback we read straight from `mockData` lookup maps so the
 *   shape matches the live-DB path.
 *
 *   The numbers are non-personally-identifying totals, so RLS allows
 *   distributor-role JWTs to issue these reads against the bare tables.
 *
 * @returns {Promise<{
 *   totalSubscribers: number,
 *   totalAgents: number,
 *   totalBranches: number,
 *   aum: number,
 *   aumNote?: string,
 * }>}
 * @cache ['distributor-metrics']
 * @scope Distributor only.
 */
export async function getDistributorMetrics() {
  if (!IS_SUPABASE_ENABLED) {
    // Mock fallback: read off the frozen `mockData` lookup maps. AUM isn't
    // tracked in the mock seed, so we leave it at 0 + note the shortfall.
    return {
      totalSubscribers: Object.keys(AGENTS).length === 0 ? 0 : getAllEntities('subscriber').length,
      totalAgents: Object.keys(AGENTS).length,
      totalBranches: Object.keys(BRANCHES).length,
      aum: 0,
      aumNote: 'AUM unavailable under mock fallback',
    };
  }

  // Parallel head() counts + the single AUM aggregate. supabase-js exposes
  // `count: 'exact', head: true` for a COUNT(*) without dragging row data
  // over the wire; we still issue them as Promise.all so all four round-trip
  // concurrently. See react-best-practices `async-parallel`.
  const [subsRes, agentsRes, branchesRes, aumRes] = await Promise.all([
    supabase.from('subscribers').select('*', { count: 'exact', head: true }),
    supabase.from('agents').select('*', { count: 'exact', head: true }),
    supabase.from('branches').select('*', { count: 'exact', head: true }),
    // AUM aggregate. We `select(total_balance)` and sum client-side rather
    // than issuing `sum()` via a Postgres function — the dataset is bounded
    // at ~30k subscribers and the response is light. If this becomes
    // expensive a `get_distributor_aum()` RPC is the natural next step
    // (mentioned in BACKEND.md §9 as a follow-up).
    supabase.from('subscriber_balances').select('total_balance'),
  ]);

  if (subsRes.error) throw subsRes.error;
  if (agentsRes.error) throw agentsRes.error;
  if (branchesRes.error) throw branchesRes.error;
  if (aumRes.error) throw aumRes.error;

  const aum = Array.isArray(aumRes.data)
    ? aumRes.data.reduce((sum, row) => sum + Number(row?.total_balance ?? 0), 0)
    : 0;

  return {
    totalSubscribers: subsRes.count ?? 0,
    totalAgents: agentsRes.count ?? 0,
    totalBranches: branchesRes.count ?? 0,
    aum,
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * @endpoint INSERT INTO branches
 * @param {Object} payload - branch creation payload (camelCase, see legacy
 *   JSDoc for fields). Translated to snake_case for the DB column names.
 * @returns {Promise<Object>} The newly-inserted, mapped branch row.
 * @cache Invalidates: ['entities','branch'], ['children']
 * @scope Distributor only (RLS WRITE policy in 0003_rls_policies.sql).
 */
export async function createBranch(payload) {
  if (!IS_SUPABASE_ENABLED) {
    return mockCreateBranch(payload);
  }
  // The mock service generated an ID. Schema has TEXT id (no default) so we
  // mint one client-side. Format mirrors mockData ('b-new-…') so the React
  // Query cache key stays predictable.
  const id = payload.id ?? `b-new-${Date.now()}`;
  const row = {
    id,
    name: payload.name,
    district_id: payload.districtId,
    manager_name: payload.adminName ?? payload.managerName ?? null,
    manager_phone: payload.adminPhone ?? payload.managerPhone ?? null,
    manager_email: payload.adminEmail ?? payload.managerEmail ?? null,
    status: payload.status ?? 'active',
  };
  const { data, error } = await supabase
    .from('branches')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  const mapped = mapBranch(data);
  cacheEntity('branch', mapped);
  return mapped;
}

/**
 * @endpoint INSERT INTO agents
 * @param {Object} payload - agent creation payload (camelCase).
 * @returns {Promise<Object>} The newly-inserted, mapped agent row.
 * @cache Invalidates: ['children','branch',branchId], ['entities','agent']
 * @scope Branch admin (own branch only) — RLS-enforced.
 */
export async function createAgent(payload) {
  if (!IS_SUPABASE_ENABLED) {
    return mockCreateAgent(payload);
  }
  const id = payload.id ?? `a-new-${Date.now()}`;
  const row = {
    id,
    name: payload.name,
    gender: payload.gender ?? null,
    employee_id: payload.employeeId ?? null,
    branch_id: payload.branchId,
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    status: payload.status ?? 'active',
    languages: payload.languages ?? [],
    specialties: payload.specialties ?? [],
  };
  const { data, error } = await supabase
    .from('agents')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  const mapped = mapAgent(data);
  cacheEntity('agent', mapped);
  return mapped;
}

/**
 * @endpoint UPDATE branches SET <patch> WHERE id = $1
 * @param {string} id
 * @param {Object} patch - camelCase patch — only known columns are mapped.
 * @returns {Promise<Object>} The updated, mapped branch.
 * @cache Invalidates: ['entity','branch',id], ['entities','branch'], ['children']
 * @scope Distributor only.
 */
export async function updateBranch(id, patch) {
  if (!IS_SUPABASE_ENABLED) {
    return mockUpdateBranch(id, patch);
  }
  const row = {};
  if (patch.name != null) row.name = patch.name;
  if (patch.districtId != null) row.district_id = patch.districtId;
  if (patch.managerName != null) row.manager_name = patch.managerName;
  if (patch.managerPhone != null) row.manager_phone = patch.managerPhone;
  if (patch.managerEmail != null) row.manager_email = patch.managerEmail;
  if (patch.status != null) row.status = patch.status;

  const { data, error } = await supabase
    .from('branches')
    .update(row)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  const mapped = mapBranch(data);
  cacheEntity('branch', mapped);
  return mapped;
}

/**
 * @endpoint Thin wrapper over updateBranch — kept as a separate export for
 *   hook compat (`useSetBranchStatus`) and so the intent is explicit in
 *   callers.
 * @param {string} id
 * @param {'active'|'inactive'} status
 */
export async function setBranchStatus(id, status) {
  return updateBranch(id, { status });
}

// ─── Mock-fallback shims (used when IS_SUPABASE_ENABLED === false) ─────────
// These mirror the original mock behaviour just well enough to keep the
// rollback flag flipping the app back to a working state. They INTENTIONALLY
// do NOT recreate the per-session _entityOverrides map — the rollback is for
// emergency-demo continuity, not feature parity with the old prototype's
// edit-and-see-it-persist trick.

function mockCreateBranch(data) {
  return {
    id: `b-new-${Date.now()}`,
    ...data,
    status: 'active',
    metrics: EMPTY_METRICS,
  };
}

function mockCreateAgent(data) {
  return {
    id: `a-new-${Date.now()}`,
    parentId: data.branchId,
    ...data,
    status: 'active',
    metrics: EMPTY_METRICS,
  };
}

function mockUpdateBranch(id, updates) {
  const existing = getEntityById('branch', id);
  return existing ? { ...existing, ...updates } : null;
}

// Re-export the data sources we still touch via the mock fallback so static
// analysis flags any future drift. (No callers; the imports above keep the
// fallback shims honest.)
export const _mockSources = { COUNTRY, REGIONS, DISTRICTS, BRANCHES, AGENTS, DISTRIBUTORS };
