import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './SubscriberReports.module.css';

const REPORT_VIEWS = {
  'all-transactions':      lazy(() => import('./views/AllTransactions')),
  'contributions-summary': lazy(() => import('./views/ContributionsSummary')),
  'withdrawals-history':   lazy(() => import('./views/WithdrawalsHistory')),
  'insurance-statement':   lazy(() => import('./views/InsuranceStatement')),
  'annual-statement':      lazy(() => import('./views/AnnualStatement')),
};

const REPORTS = [
  {
    id: 'all-transactions',
    title: 'All Transactions',
    description: 'Every contribution, withdrawal, premium, and claim.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 9h18M8 13h8M8 16h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'contributions-summary',
    title: 'Contributions Summary',
    description: 'Month-by-month breakdown, retirement vs. emergency.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 14l4-4 4 4 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'withdrawals-history',
    title: 'Withdrawals',
    description: 'Every withdrawal with bucket, reason and settlement time.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'insurance-statement',
    title: 'Insurance Statement',
    description: 'Premiums paid, claims filed, and current cover.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'annual-statement',
    title: 'Annual Tax Statement',
    description: 'Year-end summary for tax filing.',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const REPORT_TITLES = Object.fromEntries(REPORTS.map((r) => [r.id, r.title]));

function ReportLoading() {
  return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
    </div>
  );
}

export default function SubscriberReports({ splitMode = false }) {
  const { subscriberReportsOpen, setSubscriberReportsOpen, reportContext, setReportContext } = useDashboard();
  const [activeReportId, setActiveReportId] = useState(null);
  const bodyRef = useRef(null);

  /* Auto-navigate on context set */
  useEffect(() => {
    if (subscriberReportsOpen && reportContext) {
      if (REPORT_VIEWS[reportContext]) {
        setActiveReportId(reportContext);
      }
      setReportContext(null);
    }
  }, [subscriberReportsOpen, reportContext, setReportContext]);

  /* Reset on close (400ms delay) */
  useEffect(() => {
    if (subscriberReportsOpen) return;
    const t = setTimeout(() => {
      setActiveReportId(null);
    }, 400);
    return () => clearTimeout(t);
  }, [subscriberReportsOpen]);

  /* Scroll to top on view change */
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [activeReportId]);

  /* Escape */
  useEffect(() => {
    if (!subscriberReportsOpen) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (activeReportId) setActiveReportId(null);
      else setSubscriberReportsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [subscriberReportsOpen, setSubscriberReportsOpen, activeReportId]);

  const headerTitle = activeReportId ? REPORT_TITLES[activeReportId] || 'Report' : 'Reports';
  const headerSubtitle = activeReportId ? null : 'Every transaction. Every claim. Every number.';
  const ActiveReportComponent = activeReportId ? REPORT_VIEWS[activeReportId] : null;

  return (
    <>
      <AnimatePresence>
        {subscriberReportsOpen && !splitMode && (
          <motion.div
            key="sr-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setSubscriberReportsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {subscriberReportsOpen && (
          <motion.div
            key="sr-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sr-title"
          >
            <header className={styles.header}>
              <div className={styles.headerTop}>
                {activeReportId && (
                  <button className={styles.backBtn} onClick={() => setActiveReportId(null)} aria-label="Back to reports">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                <div className={styles.headerText}>
                  <AnimatePresence mode="wait">
                    <motion.h2
                      key={headerTitle}
                      id="sr-title"
                      className={styles.title}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      {headerTitle}
                    </motion.h2>
                  </AnimatePresence>
                  {headerSubtitle && <p className={styles.subtitle}>{headerSubtitle}</p>}
                </div>
                <button className={styles.closeBtn} onClick={() => setSubscriberReportsOpen(false)} aria-label="Close">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </header>

            <div className={styles.body} ref={bodyRef}>
              {!activeReportId ? (
                <ReportIndex onSelect={setActiveReportId} />
              ) : ActiveReportComponent ? (
                <Suspense fallback={<ReportLoading />}>
                  <ActiveReportComponent onBack={() => setActiveReportId(null)} />
                </Suspense>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ReportIndex({ onSelect }) {
  return (
    <div className={styles.index}>
      <div className={styles.indexGrid}>
        {REPORTS.map((r, i) => (
          <motion.button
            key={r.id}
            type="button"
            className={styles.indexCard}
            onClick={() => onSelect(r.id)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 + i * 0.05, ease: EASE_OUT_EXPO }}
            whileHover={{ y: -2 }}
          >
            <span className={styles.indexIcon}>{r.icon}</span>
            <div className={styles.indexText}>
              <span className={styles.indexTitle}>{r.title}</span>
              <span className={styles.indexDesc}>{r.description}</span>
            </div>
            <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className={styles.indexArrow}>
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
