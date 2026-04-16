// Entity data service — the ONLY file that imports from mockData.
// When backend is ready, replace these implementations with api.get() calls.
// The hook layer and all components remain untouched.

import {
  COUNTRY, REGIONS, DISTRICTS, BRANCHES, AGENTS,
  getEntityById, getChildEntities, getAllEntities,
  getParentEntity, getTopBranch, getBreadcrumbPath,
} from '../data/mockData';

/**
 * @endpoint GET /api/country
 * @returns {Promise<{id: string, name: string, center: [number, number], metrics: Metrics}>}
 * @description Returns the country-level entity with aggregated metrics.
 * @cache ['country'] — stale time: default (React Query default)
 * @scope All authenticated roles.
 */
export async function getCountry() {
  // Future: api.get('/country')
  return COUNTRY;
}

/**
 * @endpoint GET /api/entities/:level/:id
 * @param {string} level - Hierarchy level (region|district|branch|agent|subscriber)
 * @param {string} id - Entity ID
 * @returns {Promise<Object>} Entity object with fields varying by level. See data-model.md.
 * @description Fetches a single entity by level and ID. Returns null if not found.
 * @cache ['entity', level, id]
 * @scope Distributor: any entity. Branch: own branch and its children only.
 */
export async function getEntity(level, id) {
  // Future: api.get(`/${level}s/${id}`)
  return getEntityById(level, id);
}

/**
 * @endpoint GET /api/entities/:level/:parentId/children
 * @param {string} level - Parent's hierarchy level (country|region|district|branch|agent)
 * @param {string} parentId - ID of the parent entity
 * @returns {Promise<Array<Object>>} Array of child entities at the next hierarchy level
 * @description Returns all direct children of a parent entity. Used by OverlayPanel,
 *   ViewBranches, ViewAgents, and report views to list sub-entities.
 * @cache ['children', level, parentId]
 * @scope Distributor: all children. Branch: only own branch's agents/subscribers.
 */
export async function getChildren(level, parentId) {
  // Future: api.get(`/${level}s/${parentId}/children`)
  return getChildEntities(level, parentId);
}

/**
 * @endpoint GET /api/entities/:level
 * @param {string} level - Hierarchy level (region|district|branch|agent|subscriber)
 * @returns {Promise<Array<Object>>} All entities at the given level
 * @description Returns every entity at a hierarchy level. Used by report views
 *   (AllBranches, AllAgents, AllSubscribers) and for building filter dropdowns.
 *   WARNING: For subscribers (~30K), this needs server-side pagination in production.
 * @cache ['entities', level]
 * @scope Distributor: all entities. Branch: filtered to branch scope by component.
 */
export async function getAllAtLevel(level) {
  // Future: api.get(`/${level}s`)
  return getAllEntities(level);
}

/**
 * @endpoint GET /api/entities/:level/:id/parent
 * @param {string} level - Entity's hierarchy level
 * @param {string} id - Entity ID
 * @returns {Promise<Object|null>} Parent entity, or null if at country level
 * @description Returns the parent entity. In production, the parent data could be
 *   embedded in the entity response to avoid a separate call.
 * @cache Not cached separately — typically accessed through entity data.
 * @scope Same as getEntity.
 */
export async function getParent(level, id) {
  // Future: included in entity response from API
  return getParentEntity(level, id);
}

/**
 * @endpoint GET /api/entities/:level/:parentId/top-branch
 * @param {string} level - Scope level (country|region|district)
 * @param {string} parentId - Parent entity ID
 * @returns {Promise<{name: string, contribution: number}|null>} Top branch by latest month's contributions
 * @description Finds the highest-contributing branch within an entity's scope.
 *   Used by OverlayPanel's "Top Branch" metric card.
 * @cache ['topBranch', level, parentId]
 * @scope Distributor only — Branch Admin sees own branch data directly.
 */
export async function getTopPerformingBranch(level, parentId) {
  // Future: api.get(`/${level}s/${parentId}/top-branch`)
  return getTopBranch(level, parentId);
}

/**
 * @endpoint GET /api/breadcrumb
 * @param {string} currentLevel - Current drill-down level
 * @param {Object} selectedIds - Map of { level: entityId } for the current path
 * @returns {Promise<Array<{level: string, id: string, name: string}>>} Breadcrumb path from country to current level
 * @description Builds the navigation breadcrumb for the drill-down hierarchy.
 *   In production, the backend could return ancestor chain with each entity response.
 * @cache ['breadcrumb', currentLevel, selectedIds]
 * @scope Distributor: full hierarchy. Branch: not used (no drill-down).
 */
export async function getBreadcrumb(currentLevel, selectedIds) {
  // Future: api.get(`/breadcrumb?level=${currentLevel}&ids=...`)
  return getBreadcrumbPath(currentLevel, selectedIds);
}

/**
 * @endpoint POST /api/branches
 * @param {Object} data - Branch creation payload
 * @param {string} data.name - Branch name
 * @param {string} data.districtId - District ID
 * @param {string} data.cityTown - City/town name
 * @param {string} data.address - Physical address
 * @param {string} [data.landmark] - Landmark/directions (optional)
 * @param {string} [data.poBox] - P.O. Box (optional)
 * @param {string} data.adminName - Branch admin's full name
 * @param {string} data.adminPhone - Admin phone (9 digits, +256 prefix)
 * @param {string} [data.adminEmail] - Admin email (optional)
 * @returns {Promise<{id: string, status: 'active', metrics: null, ...data}>}
 * @description Creates a new branch and assigns an admin. Should also create a user
 *   account for the admin with role 'branch' and send SMS credentials.
 * @cache Invalidates: ['entities', 'branch'], ['children']
 * @scope Distributor only.
 */
export async function createBranch(data) {
  // Future: api.post('/branches', data)
  return { id: `b-new-${Date.now()}`, ...data, status: 'active', metrics: null };
}

/**
 * @endpoint GET /api/entities/:level (same as getAllAtLevel, different client-side shape)
 * @param {string} level - Hierarchy level
 * @returns {Promise<Object<string, Object>>} Map of { entityId: entity } for O(1) lookups
 * @description Returns all entities as a keyed map. Used by report views to resolve
 *   parent names without additional queries (e.g., agent → branch name lookup).
 * @cache ['entitiesMap', level]
 * @scope Same as getAllAtLevel.
 */
export async function getAllAtLevelMap(level) {
  // Returns entities as a { id: entity } map for O(1) lookups (used by reports)
  const list = await getAllAtLevel(level);
  const map = {};
  list.forEach((e) => { map[e.id] = e; });
  return map;
}

/**
 * @description Synchronous entity lookup — used only by DashboardContext for URL → state
 *   derivation during routing. In production, the API should return ancestor IDs with
 *   each entity, or the URL can encode the full hierarchy path, removing this need.
 * @param {string} level - Hierarchy level
 * @param {string} id - Entity ID
 * @returns {Object|null} Entity object or null
 */
export function getEntitySync(level, id) {
  return getEntityById(level, id);
}
