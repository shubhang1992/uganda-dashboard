// Search service — Supabase-backed via the `search_entities` RPC.
//
// The RPC returns `(entity_id, entity_name, level, label, parent_id, score)`
// — see `supabase/migrations/0002_rpc_functions.sql` (line 546). The OUT
// columns are named with the `entity_` prefix to avoid a PL/pgSQL OUT-variable
// shadowing collision with the underlying tables' `id`/`name` columns. We map
// them back to the caller-friendly `{ id, name, level, label, parentId }`
// shape that `src/hooks/useEntity.js#useSearch` and the components built
// against `services/search.js` have always consumed.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import { REGIONS, DISTRICTS, BRANCHES, AGENTS } from '../data/mockData';

/**
 * @endpoint RPC `search_entities(p_q)`
 * @param {string} query - Search string. RPC already short-circuits on <2 chars
 *   but we also short-circuit here to save the round-trip.
 * @returns {Promise<Array<{id: string, name: string, level: string, label: string, parentId: string}>>}
 *   Max 8 results (the RPC enforces this).
 * @cache ['search', query]
 * @scope All authenticated roles. RLS is permissive on search (read-only,
 *   non-PII fields).
 */
export async function searchEntities(query) {
  if (!query || query.length < 2) return [];

  if (!IS_SUPABASE_ENABLED) {
    return mockSearch(query);
  }

  const { data, error } = await supabase.rpc('search_entities', { p_q: query });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.entity_id,
    name: row.entity_name,
    level: row.level,
    label: row.label,
    parentId: row.parent_id,
  }));
}

// ─── Mock fallback ──────────────────────────────────────────────────────────

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
      _index.push({
        id: entity.id,
        name: entity.name,
        level,
        label,
        parentId: entity.parentId,
      });
    }
  }
  return _index;
}

function mockSearch(query) {
  const lower = query.toLowerCase();
  return getIndex()
    .filter((item) => item.name.toLowerCase().includes(lower))
    .slice(0, 8);
}
