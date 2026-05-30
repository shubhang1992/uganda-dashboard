import { useState, useEffect, useCallback } from 'react';

/**
 * Drilldown state machine for the ViewBranches panel.
 *
 * Owns view (`list | detail | agent | edit`), `selectedBranch`,
 * `selectedAgent`, `editSection`, plus the auto-select effect that fires when
 * the map drills into a branch and the soft reset that runs after the panel
 * closes.
 *
 * Inputs:
 *  - drillTargetBranchId: id from DashboardPanelContext when a map drill opens
 *    the panel pre-selected on a branch.
 *  - isOpen: whether the panel is currently open.
 *  - allBranches: the metrics-overlaid branch array (must come from the
 *    parent so KPI cards read live numbers, not EMPTY_METRICS).
 *
 * Outputs preserve byte-identical behavior with the prior inline state.
 */
export function useBranchDrilldown({ drillTargetBranchId, isOpen, allBranches }) {
  const [view, setView] = useState('list');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [editSection, setEditSection] = useState(null);

  // Auto-select branch when opened via map drill-down. Reads from the
  // metrics-overlaid `allBranches`, not the raw list (which has EMPTY_METRICS),
  // so the BranchDetail KPI cards bind to real numbers.
  useEffect(() => {
    if (!isOpen || !drillTargetBranchId || allBranches.length === 0) return;
    const branch = allBranches.find((b) => b.id === drillTargetBranchId);
    if (!branch) return;
    setSelectedBranch(branch);
    // Only snap to 'detail' on the first auto-select for this drill target;
    // later metrics-overlay updates refresh selectedBranch in place without
    // overwriting a user-initiated nav to an agent / edit pane.
    if (!selectedBranch || selectedBranch.id !== drillTargetBranchId) {
      setView('detail');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedBranch intentionally excluded to avoid self-triggered loop
  }, [isOpen, drillTargetBranchId, allBranches]);

  // Soft reset 400ms after the panel closes so the slide-out animation
  // doesn't show stale state.
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      setView('list');
      setSelectedBranch(null);
      setSelectedAgent(null);
      setEditSection(null);
    }, 400);
    return () => clearTimeout(t);
  }, [isOpen]);

  const goList = useCallback(() => {
    setView('list');
    setSelectedBranch(null);
  }, []);

  const goDetail = useCallback((branch) => {
    if (branch) setSelectedBranch(branch);
    setView('detail');
  }, []);

  const goAgent = useCallback((agent) => {
    setSelectedAgent(agent);
    setView('agent');
  }, []);

  const goEdit = useCallback((section) => {
    setEditSection(section);
    setView('edit');
  }, []);

  return {
    view,
    selectedBranch,
    selectedAgent,
    editSection,
    setSelectedBranch,
    setSelectedAgent,
    setEditSection,
    setView,
    goList,
    goDetail,
    goAgent,
    goEdit,
  };
}
