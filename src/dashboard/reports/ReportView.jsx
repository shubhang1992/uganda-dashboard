import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/finance';
import styles from './ReportView.module.css';

export default function ReportView({ title, description, filters, children, onBack }) {
  const navigate = useNavigate();

  const handleBack = onBack || (() => navigate('/dashboard/reports'));

  return (
    <div className={onBack ? styles.viewPanel : styles.view}>
      <motion.div
        className={styles.inner}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {!onBack && (
              <button
                className={styles.backBtn}
                onClick={handleBack}
                aria-label="Back to reports"
              >
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
                  <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className={styles.headerText}>
              <h1 className={styles.title}>{title}</h1>
              {description && <p className={styles.subtitle}>{description}</p>}
            </div>
          </div>
          <button className={styles.exportBtn} aria-label="Export report">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <span>Export</span>
          </button>
        </div>

        {/* Filters bar */}
        {filters && <div className={styles.filters}>{filters}</div>}

        {/* Content */}
        <div className={styles.content}>{children}</div>
      </motion.div>
    </div>
  );
}
