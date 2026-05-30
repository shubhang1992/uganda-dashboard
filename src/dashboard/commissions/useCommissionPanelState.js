import { useCallback, useEffect, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

/**
 * State container for `CommissionPanel`. Owns the 13+ slices of local UI
 * state that drove the original parent component, the 200ms search
 * debounce, and the two `commissionsOpen`-driven side effects (panel
 * reset after close, Escape-to-close while open).
 *
 * The hook intentionally takes `commissionsOpen` + `setCommissionsOpen`
 * as inputs rather than calling `useDashboard()` itself — keeps the
 * panel state pure UI state and leaves dashboard-context wiring in the
 * parent. Setters returned here are React's stable `useState` setters,
 * so children can treat them as identity-stable across renders.
 */
export function useCommissionPanelState({ commissionsOpen, setCommissionsOpen }) {
  const [view, setView] = useState('home');
  const [statusFocus, setStatusFocus] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [subFilter, setSubFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [editingCadence, setEditingCadence] = useState(false);
  const [selectedDisputeAgent, setSelectedDisputeAgent] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  // 'approved' (bulk) | 'branch'
  const [releaseScope, setReleaseScope] = useState('approved');
  const [selectedRunBranchId, setSelectedRunBranchId] = useState(null);

  // Resolution modal — single-row + bulk approve/reject.
  // target: { ids: string[], action: 'approve'|'reject', label: string, prePaymentCount, postPaymentCount }
  const [resolutionTarget, setResolutionTarget] = useState(null);
  const [resolutionReason, setResolutionReason] = useState('');

  // Branch-side hold/dispute line action modal.
  // target: { line, action: 'hold'|'dispute' }
  const [lineActionTarget, setLineActionTarget] = useState(null);
  const [lineActionReason, setLineActionReason] = useState('');

  // Debounce the search input — the filter memos in the parent run a full
  // `.toLowerCase()` + `.includes()` pass over the agent list on every
  // keystroke. With 2k+ agents that's enough work to drop a frame on every
  // letter. 200ms aligns with the OverlayPanel debounce so the two search
  // surfaces feel uniform.
  const debouncedSearch = useDebouncedValue(search, 200);

  // Reset state when panel closes
  useEffect(() => {
    if (commissionsOpen) return;
    const t = setTimeout(() => {
      setView('home');
      setStatusFocus(null);
      setSelectedAgentId(null);
      setSubFilter(null);
      setSearch('');
      setEditingRate(false);
      setEditingCadence(false);
      setSelectedDisputeAgent(null);
      setSelectedIds(new Set());
      setReleaseModalOpen(false);
      setReleaseScope('approved');
      setSelectedRunBranchId(null);
      setResolutionTarget(null);
      setResolutionReason('');
      setLineActionTarget(null);
      setLineActionReason('');
    }, 400);
    return () => clearTimeout(t);
  }, [commissionsOpen]);

  // Escape closes the panel. The shared <Modal> primitive stops propagation
  // when a child modal is open, so this handler never fires while a modal
  // is active — the modal closes first, then a second Escape closes the
  // panel.
  useEffect(() => {
    if (!commissionsOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        setCommissionsOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [commissionsOpen, setCommissionsOpen]);

  // Multi-select helpers — wrapped in useCallback so children memoised
  // with React.memo don't re-render on unrelated parent state changes.
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback((ids) => setSelectedIds(new Set(ids)), []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    view, setView,
    statusFocus, setStatusFocus,
    selectedAgentId, setSelectedAgentId,
    subFilter, setSubFilter,
    search, setSearch,
    debouncedSearch,
    editingRate, setEditingRate,
    rateInput, setRateInput,
    editingCadence, setEditingCadence,
    selectedDisputeAgent, setSelectedDisputeAgent,
    selectedIds, setSelectedIds,
    releaseModalOpen, setReleaseModalOpen,
    releaseScope, setReleaseScope,
    selectedRunBranchId, setSelectedRunBranchId,
    resolutionTarget, setResolutionTarget,
    resolutionReason, setResolutionReason,
    lineActionTarget, setLineActionTarget,
    lineActionReason, setLineActionReason,
    toggleSelect, selectAll, clearSelection,
  };
}
