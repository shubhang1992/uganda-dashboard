import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import styles from './BottomSheet.module.css';

const CloseIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/**
 * BottomSheet — the shared mobile sheet primitive for the branch app-bar surfaces
 * (Ask AI + Notifications). Portals to <body> so it layers above the fixed bottom
 * tab bar, dims with a scrim, slides up from the bottom, and closes on
 * scrim-click or Escape. Honours reduced-motion. Mobile-only — the app bar that
 * opens it never renders on desktop (>=1024px uses BranchDesktopShell's chrome).
 * A standalone copy of the agent shell's primitive so the branch shell stays
 * self-contained.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  icon,
  headerRight,
  height = '78%',
  footer,
  children,
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.scrim}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            aria-hidden="true"
          />
          <motion.div
            className={styles.sheet}
            style={{ height }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: 0.34, ease: EASE_OUT_EXPO }}
          >
            <div className={styles.grip} aria-hidden="true" />
            <div className={styles.head}>
              <span className={styles.title}>
                {icon && <span className={styles.titleIcon}>{icon}</span>}
                {title}
              </span>
              <span className={styles.headRight}>
                {headerRight}
                <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
                  {CloseIcon}
                </button>
              </span>
            </div>
            <div className={styles.body}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
