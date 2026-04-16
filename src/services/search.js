// Search service — mock client-side search. Replace with API when backend is ready.

import { REGIONS, DISTRICTS, BRANCHES, AGENTS } from '../data/mockData';

const SEARCH_LEVELS = [
  { level: 'region', label: 'Region', map: REGIONS },
  { level: 'district', label: 'District', map: DISTRICTS },
  { level: 'branch', label: 'Branch', map: BRANCHES },
  { level: 'agent', label: 'Agent', map: AGENTS },
];

let _index = null;

function getIndex() {
  if (_index) return _index;
  _index = [];
  for (const { level, label, map } of SEARCH_LEVELS) {
    for (const entity of Object.values(map)) {
      _index.push({ id: entity.id, name: entity.name, level, label, parentId: entity.parentId });
    }
  }
  return _index;
}

/**
 * @endpoint GET /api/search?q=:query
 * @param {string} query - Search string (min 2 characters)
 * @returns {Promise<Array<{id: string, name: string, level: string, label: string, parentId: string}>>}
 * @description Searches regions, districts, branches, and agents by name.
 *   Returns max 8 results. Does NOT search subscribers (too many for client-side).
 *   In production, implement server-side full-text search with relevance scoring.
 * @cache ['search', query]
 * @scope Distributor: all entities. Branch: should be scoped to branch's children.
 */
export async function searchEntities(query) {
  // Future: api.get(`/search?q=${encodeURIComponent(query)}`)
  if (!query || query.length < 2) return [];
  const lower = query.toLowerCase();
  return getIndex()
    .filter((item) => item.name.toLowerCase().includes(lower))
    .slice(0, 8);
}
