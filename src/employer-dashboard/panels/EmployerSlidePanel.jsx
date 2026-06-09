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

import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import styles from './EmployerSlidePanel.module.css';

// Focusable-elements selector + filter — mirrors the canonical implementation in
// src/components/Modal.jsx so this panel's focus trap behaves identically to the
// shared Modal primitive (no second, divergent mechanism).
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

function getFocusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.hasAttribute('hidden')) return false;
    const style = el.style;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }
    return true;
  });
}

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

  // Panel surface ref (focus target + Tab-trap root) and the element to restore
  // focus to on close. Only engaged in modal mode (`!splitMode`); in splitMode
  // the panel is a non-modal docked region and must not steal/trap focus.
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const isModal = !splitMode;

  // Escape closes the panel (matches the branch panels' idiom).
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  // -- Focus management (modal mode only) -----------------------------------
  // On open: remember the trigger, move focus into the panel. On close: restore
  // focus to the trigger. Mirrors src/components/Modal.jsx's focus lifecycle.
  useEffect(() => {
    if (!open || !isModal) return undefined;

    previousFocusRef.current =
      typeof document !== 'undefined' ? document.activeElement : null;

    // Defer until after the slide-in panel mounts.
    const focusTimer = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const focusables = getFocusableElements(root);
      const target = focusables[0] || root;
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus?.();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          prev.focus();
        }
      }
      previousFocusRef.current = null;
    };
  }, [open, isModal]);

  // -- Tab trap (modal mode only) -------------------------------------------
  const handleKeyDown = useCallback(
    (e) => {
      if (!isModal || e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    },
    [isModal],
  );

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
            ref={panelRef}
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            style={{ '--panel-width': `${width}px` }}
            role="dialog"
            aria-modal={splitMode ? undefined : true}
            aria-label={title}
            // tabIndex -1 so the panel surface can receive focus on open (and as
            // the Tab-trap fallback) without entering the normal tab order.
            tabIndex={-1}
            onKeyDown={handleKeyDown}
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
