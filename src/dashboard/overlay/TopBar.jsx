import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentEntity, useChildren } from '../../hooks/useEntity';
import { CHILD_LEVEL } from '../../constants/levels';
import { formatUGX, EASE_OUT_EXPO as EASE } from '../../utils/finance';
import { downloadCSV } from '../../utils/csv';
import { useIsMobile } from '../../hooks/useIsMobile';
import styles from './TopBar.module.css';

const CHILD_LABEL_PLURAL = {
  region: 'Regions',
  district: 'Districts',
  branch: 'Branches',
  agent: 'Agents',
  subscriber: 'Subscribers',
};

function buildCSVRows(children) {
  const headers = ['Name', 'Level', 'Subscribers', 'Active Rate', 'AUM/Balance', 'Contributions', 'Withdrawals'];
  const rows = children.map((child) => {
    const m = child.metrics;
    const isActive = child.active !== false && m;
    return [
      child.name || '',
      child.level || '',
      isActive ? String(m.totalSubscribers || 0) : '0',
      isActive ? `${m.activeRate || 0}%` : '0%',
      isActive ? formatUGX(m.aum || m.totalContributions || 0) : formatUGX(0),
      isActive ? formatUGX(m.totalContributions || 0) : formatUGX(0),
      isActive ? formatUGX(m.totalWithdrawals || 0) : formatUGX(0),
    ];
  });
  return { headers, rows };
}

function getDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Filter options per level
function getFilterOptions(level, children) {
  if (level === 'country') {
    const names = children.map((c) => c.name).sort();
    return { label: 'All Regions', options: ['All Regions', ...names] };
  }
  if (level === 'region') {
    const names = children.map((c) => c.name).sort();
    return { label: 'All Districts', options: ['All Districts', ...names] };
  }
  if (level === 'district') {
    return { label: 'Status', options: ['All', 'Active', 'Inactive'] };
  }
  return null;
}

export default function TopBar() {
  const isMobile = useIsMobile();
  const { level, selectedIds } = useDashboard();

  const parentId = level === 'country' ? 'ug' : selectedIds[level];
  const { data: currentEntity } = useCurrentEntity(level, selectedIds);
  const { data: children = [] } = useChildren(level, parentId);

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterValue, setFilterValue] = useState(null);
  const filterRef = useRef(null);
  const filterBtnRef = useRef(null);

  // Reset filter when navigating to a different level/entity. Adjusting state
  // during render (instead of in an effect) avoids a cascading render.
  const navKey = `${level}-${parentId}`;
  const [lastNavKey, setLastNavKey] = useState(navKey);
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey);
    setFilterValue(null);
    setFilterOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e) {
      if (
        filterRef.current && !filterRef.current.contains(e.target) &&
        filterBtnRef.current && !filterBtnRef.current.contains(e.target)
      ) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  // Close on Escape
  useEffect(() => {
    if (!filterOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape') setFilterOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [filterOpen]);

  // Filter config for current level
  const filterConfig = getFilterOptions(level, children);

  // Apply the active filter to the children list before CSV export.
  const filteredChildren = useMemo(() => {
    if (!filterValue || !filterConfig) return children;
    const defaultOption = filterConfig.options[0];
    if (filterValue === defaultOption) return children;
    if (level === 'district') {
      // Status filter: 'Active' or 'Inactive'
      const wantActive = filterValue === 'Active';
      return children.filter((c) => (c.active !== false) === wantActive);
    }
    // Region/district: filter by name
    return children.filter((c) => c.name === filterValue);
  }, [children, filterValue, filterConfig, level]);

  // CSV download handler — exports the filtered children
  const handleDownload = useCallback(() => {
    if (!filteredChildren.length || !currentEntity) return;

    const childLevel = CHILD_LEVEL[level];
    const childLabel = childLevel ? CHILD_LABEL_PLURAL[childLevel] : 'Data';
    const entityName = currentEntity.name || 'Uganda';
    const safeName = entityName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const filterSuffix = filterValue && filterValue !== filterConfig?.options[0]
      ? `-${filterValue.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
      : '';
    const filename = `upensions-${childLabel.toLowerCase()}-${safeName}${filterSuffix}-${getDateStamp()}.csv`;

    const tagged = filteredChildren.map((c) => ({ ...c, level: childLevel || '' }));
    const { headers, rows } = buildCSVRows(tagged);
    downloadCSV(filename, headers, rows);
  }, [filteredChildren, currentEntity, level, filterValue, filterConfig]);

  const handleFilterSelect = useCallback((option) => {
    const defaultOption = filterConfig?.options[0];
    setFilterValue(option === defaultOption ? null : option);
    setFilterOpen(false);
  }, [filterConfig]);

  // Don't render at branch/agent level (slide-in panels take over)
  if (level === 'branch' || level === 'agent') return null;

  const dropdownMotion = {
    initial: { opacity: 0, scale: 0.95, y: isMobile ? 8 : -8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: isMobile ? 8 : -8 },
    transition: { duration: 0.18, ease: EASE },
  };

  return (
    <div className={styles.topBar}>
      <div className={styles.btnWrap}>
        <button
          ref={filterBtnRef}
          className={styles.btn}
          data-active={!!filterValue || undefined}
          aria-label={filterValue ? `Filter: ${filterValue}` : 'Filters'}
          aria-expanded={filterOpen}
          aria-haspopup="true"
          onClick={() => setFilterOpen((v) => !v)}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="18" height="18">
            <path d="M3 4h14M3 10h14M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {filterValue || 'Filters'}
        </button>
        <AnimatePresence>
          {filterOpen && filterConfig && (
            <motion.div
              ref={filterRef}
              className={styles.dropdown}
              data-position={isMobile ? 'above' : 'below'}
              role="listbox"
              aria-label={`Filter by ${filterConfig.label}`}
              {...dropdownMotion}
            >
              <span className={styles.dropdownLabel}>{filterConfig.label}</span>
              {filterConfig.options.map((option) => (
                <button
                  key={option}
                  className={styles.dropdownItem}
                  data-selected={filterValue === option || (!filterValue && option === filterConfig.options[0])}
                  role="option"
                  aria-selected={filterValue === option || (!filterValue && option === filterConfig.options[0])}
                  onClick={() => handleFilterSelect(option)}
                >
                  {option}
                  {(filterValue === option || (!filterValue && option === filterConfig.options[0])) && (
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12" className={styles.checkIcon}>
                      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <button
        className={styles.btn}
        aria-label="Download CSV"
        onClick={handleDownload}
        disabled={!filteredChildren.length}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="18" height="18">
          <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Download
      </button>
    </div>
  );
}
