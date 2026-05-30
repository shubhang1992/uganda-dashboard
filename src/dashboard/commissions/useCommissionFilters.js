import { useMemo } from 'react';

/**
 * Pure-derived data for `CommissionPanel`. Inputs are the branch-scoped
 * agent / disputed lists, the debounced search query, and the branch
 * review payload; outputs are the memoised filtered lists + the three
 * derivations off `branchReview.lines` (total amount, pending lines,
 * held lines).
 *
 * All values memoise off the smallest reasonable dependency surface so
 * unrelated state setters in the parent (toolbar focus, modal open) do
 * NOT re-run O(n) filter passes over the agent list or the branch lines.
 */
export function useCommissionFilters({
  scopedAgentList,
  scopedDisputedAgents,
  debouncedSearch,
  branchReview,
}) {
  const filteredAgents = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return scopedAgentList;
    return scopedAgentList.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedAgentList, debouncedSearch]);

  const filteredDisputed = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return scopedDisputedAgents;
    return scopedDisputedAgents.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedDisputedAgents, debouncedSearch]);

  // Branch view of the open run — memoize the three derivations off
  // `branchReview.lines` so they only recompute when the underlying lines
  // change. Without this, re-renders triggered by any unrelated state
  // setter (toolbar focus, search, modal open) would re-run all three
  // O(n) passes even though the lines themselves haven't changed.
  const branchSliceTotal = useMemo(
    () => branchReview?.lines?.reduce((s, c) => s + (c.amount || 0), 0) || 0,
    [branchReview?.lines]
  );
  const branchPendingLines = useMemo(
    () => branchReview?.lines?.filter((c) => c.status === 'in_run') || [],
    [branchReview?.lines]
  );
  const branchHeldLines = useMemo(
    () => branchReview?.lines?.filter((c) => c.status === 'held') || [],
    [branchReview?.lines]
  );

  return {
    filteredAgents,
    filteredDisputed,
    branchSliceTotal,
    branchPendingLines,
    branchHeldLines,
  };
}
