import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../contexts/ToastContext';
import styles from './Toast.module.css';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

/* ── Icons per type ─────────────────────────────────────────────────────── */
function ToastIcon({ type }) {
  const shared = {
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    fill: 'none',
    width: 14,
    height: 14,
  };

  if (type === 'success') {
    return (
      <svg {...shared}>
        <polyline
          points="20,6 9,17 4,12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === 'error') {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
        <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }

  /* info (default) */
  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <line x1="12" y1="16" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="12" y1="8" x2="12.01" y2="8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/* ── Single toast ───────────────────────────────────────────────────────── */
function ToastItem({ toast, onClose }) {
  return (
    <motion.div
      className={styles.toast}
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon} data-type={toast.type}>
        <ToastIcon type={toast.type} />
      </span>
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={() => onClose(toast.id)}
        aria-label="Dismiss notification"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="14" height="14">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </motion.div>
  );
}

/* ── Toast stack container ──────────────────────────────────────────────── */
export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className={styles.container}>
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
