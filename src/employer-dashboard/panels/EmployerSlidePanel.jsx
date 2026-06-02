// Reusable employer slide-in panel chrome.
//
// Mirrors the branch panel idiom (src/branch-dashboard/tickets/ViewTickets.jsx +
// the ViewAgents/ViewBranches family) rather than the centered shared Modal:
//   * a Framer Motion backdrop that is SUPPRESSED when `splitMode` is true (so
//     the dashboard docks the panel alongside <main> and reflows beside it), and
//   * a right-docked panel that slides in from x:'100%' with EASE_OUT_EXPO and
//     carries `data-split-mode` so the CSS swaps to the flat split-view chrome.
//
// Every employer module panel (ViewEmployees, ContributionRuns, …) wraps THIS —
// the content phases fill `children`; the chrome stays identical. `width` sizes
// the docked panel (kept in sync with EmployerOverview's PANEL_PADDING so the
// overview reflows exactly enough to clear it).

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import styles from './EmployerSlidePanel.module.css';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title - visible heading + dialog aria-label.
 * @param {string} [props.eyebrow] - small label above the title (default "Employer").
 * @param {number} [props.width] - docked panel width in px (default 560).
 * @param {boolean} [props.splitMode] - suppress the backdrop + dock the panel.
 * @param {React.ReactNode} [props.headerActions] - optional right-aligned header controls.
 * @param {React.ReactNode} props.children - panel body.
 */
export default function EmployerSlidePanel({
  open,
  onClose,
  title,
  eyebrow = 'Employer',
  width = 560,
  splitMode = false,
  headerActions,
  children,
}) {
  const handleClose = useCallback(() => onClose?.(), [onClose]);

  // Escape closes the panel (matches the branch panels' idiom).
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  return (
    <>
      <AnimatePresence>
        {open && !splitMode && (
          <motion.div
            key="emp-panel-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="emp-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            style={{ '--panel-width': `${width}px` }}
            role="dialog"
            aria-modal={splitMode ? undefined : true}
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
          >
            <header className={styles.header}>
              <div className={styles.headerText}>
                {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
                <h2 className={styles.title}>{title}</h2>
              </div>
              {headerActions ? <div className={styles.headerActions}>{headerActions}</div> : null}
              <button
                type="button"
                className={styles.closeBtn}
                onClick={handleClose}
                aria-label="Close panel"
              >
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <div className={styles.body}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
