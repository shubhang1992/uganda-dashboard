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

export async function searchEntities(query) {
  // Future: api.get(`/search?q=${encodeURIComponent(query)}`)
  if (!query || query.length < 2) return [];
  const lower = query.toLowerCase();
  return getIndex()
    .filter((item) => item.name.toLowerCase().includes(lower))
    .slice(0, 8);
}
