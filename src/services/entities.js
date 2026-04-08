// Entity data service — the ONLY file that imports from mockData.
// When backend is ready, replace these implementations with api.get() calls.
// The hook layer and all components remain untouched.

import {
  COUNTRY, REGIONS, DISTRICTS, BRANCHES, AGENTS,
  getEntityById, getChildEntities, getAllEntities,
  getParentEntity, getTopBranch, getBreadcrumbPath,
} from '../data/mockData';

export async function getCountry() {
  // Future: api.get('/country')
  return COUNTRY;
}

export async function getEntity(level, id) {
  // Future: api.get(`/${level}s/${id}`)
  return getEntityById(level, id);
}

export async function getChildren(level, parentId) {
  // Future: api.get(`/${level}s/${parentId}/children`)
  return getChildEntities(level, parentId);
}

export async function getAllAtLevel(level) {
  // Future: api.get(`/${level}s`)
  return getAllEntities(level);
}

export async function getParent(level, id) {
  // Future: included in entity response from API
  return getParentEntity(level, id);
}

export async function getTopPerformingBranch(level, parentId) {
  // Future: api.get(`/${level}s/${parentId}/top-branch`)
  return getTopBranch(level, parentId);
}

export async function getBreadcrumb(currentLevel, selectedIds) {
  // Future: api.get(`/breadcrumb?level=${currentLevel}&ids=...`)
  return getBreadcrumbPath(currentLevel, selectedIds);
}

export async function createBranch(data) {
  // Future: api.post('/branches', data)
  return { id: `b-new-${Date.now()}`, ...data, status: 'active', metrics: null };
}

export async function getAllAtLevelMap(level) {
  // Returns entities as a { id: entity } map for O(1) lookups (used by reports)
  const list = await getAllAtLevel(level);
  const map = {};
  list.forEach((e) => { map[e.id] = e; });
  return map;
}

// Synchronous entity lookup — used by DashboardContext for URL → state derivation.
// When backend is ready, the API should return ancestor IDs with each entity,
// or the URL can encode the full path, removing the need for this function.
export function getEntitySync(level, id) {
  return getEntityById(level, id);
}
