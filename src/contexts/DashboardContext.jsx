import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SEGMENT_TO_LEVEL, LEVEL_TO_SEGMENT, PARENT_LEVEL } from '../constants/levels';
import { getEntitySync } from '../services/entities';

const DashboardContext = createContext(null);

// Derive level + entityId from the URL pathname
function parsePath(pathname) {
  const path = pathname.replace(/^\/dashboard\/?/, '');
  if (!path) return { level: 'country', entityId: null };
  const [segment, entityId] = path.split('/');
  const level = SEGMENT_TO_LEVEL[segment];
  if (level && entityId) return { level, entityId };
  return { level: 'country', entityId: null };
}

// Walk the parent chain to build selectedIds from a single entity
function buildSelectedIds(level, entityId) {
  if (level === 'country' || !entityId) return {};
  const ids = {};
  let currentLevel = level;
  let currentId = entityId;
  while (currentLevel && currentLevel !== 'country' && currentId) {
    ids[currentLevel] = currentId;
    const entity = getEntitySync(currentLevel, currentId);
    if (!entity?.parentId || entity.parentId === 'ug') break;
    const parentLevel = PARENT_LEVEL[currentLevel];
    if (!parentLevel || parentLevel === 'country') break;
    currentLevel = parentLevel;
    currentId = entity.parentId;
  }
  return ids;
}

export function DashboardProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive drill-down state from URL
  const { level, entityId } = useMemo(() => parsePath(location.pathname), [location.pathname]);
  const selectedIds = useMemo(() => buildSelectedIds(level, entityId), [level, entityId]);

  // UI-only state (not URL-based)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [viewBranchesOpen, setViewBranchesOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [viewAgentsOpen, setViewAgentsOpen] = useState(false);

  // Navigation actions — translate to URL changes
  const drillDown = useCallback((targetLevel, id) => {
    const segment = LEVEL_TO_SEGMENT[targetLevel];
    if (segment) navigate(`/dashboard/${segment}/${id}`);
  }, [navigate]);

  const drillUp = useCallback((fromLevel) => {
    const level = fromLevel || 'country';
    if (level === 'country') return;
    const parentLevel = PARENT_LEVEL[level];
    if (!parentLevel || parentLevel === 'country') {
      navigate('/dashboard');
    } else {
      const parentId = buildSelectedIds(level, parsePath(location.pathname).entityId)[parentLevel];
      if (parentId) {
        navigate(`/dashboard/${LEVEL_TO_SEGMENT[parentLevel]}/${parentId}`);
      } else {
        navigate('/dashboard');
      }
    }
  }, [navigate, location.pathname]);

  const goToLevel = useCallback((targetLevel) => {
    if (targetLevel === 'country') {
      navigate('/dashboard');
    } else {
      const currentIds = buildSelectedIds(
        parsePath(location.pathname).level,
        parsePath(location.pathname).entityId,
      );
      const id = currentIds[targetLevel];
      if (id) navigate(`/dashboard/${LEVEL_TO_SEGMENT[targetLevel]}/${id}`);
      else navigate('/dashboard');
    }
  }, [navigate, location.pathname]);

  const reset = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  const value = useMemo(() => ({
    level, selectedIds,
    drillDown, drillUp, goToLevel, reset,
    branchMenuOpen, setBranchMenuOpen,
    createBranchOpen, setCreateBranchOpen,
    viewBranchesOpen, setViewBranchesOpen,
    agentMenuOpen, setAgentMenuOpen,
    viewAgentsOpen, setViewAgentsOpen,
  }), [
    level, selectedIds,
    drillDown, drillUp, goToLevel, reset,
    branchMenuOpen, createBranchOpen, viewBranchesOpen,
    agentMenuOpen, viewAgentsOpen,
  ]);

  return (
    <DashboardContext value={value}>
      {children}
    </DashboardContext>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
