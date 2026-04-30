import { lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import PageHeader from '../shell/PageHeader';
import styles from './ReportsPage.module.css';

const REPORT_VIEWS = {
  'all-transactions':      lazy(() => import('../reports/views/AllTransactions')),
  'contributions-summary': lazy(() => import('../reports/views/ContributionsSummary')),
  'withdrawals-history':   lazy(() => import('../reports/views/WithdrawalsHistory')),
  'insurance-statement':   lazy(() => import('../reports/views/InsuranceStatement')),
  'annual-statement':      lazy(() => import('../reports/views/AnnualStatement')),
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
    description: 'Month-by-month, retirement vs. emergency.',
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
    description: 'Bucket, reason and settlement time.',
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
    description: 'Premiums paid, claims filed, current cover.',
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

export default function ReportsPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();

  if (reportId) {
    const ActiveReportComponent = REPORT_VIEWS[reportId];
    if (!ActiveReportComponent) {
      return (
        <div className={styles.page}>
          <PageHeader title="Report not found" backTo="/dashboard/reports" />
          <div className={styles.body}>
            <p className={styles.empty}>That report doesn&apos;t exist.</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.page}>
        <PageHeader title={REPORT_TITLES[reportId]} backTo="/dashboard/reports" />
        <div className={styles.body}>
          <Suspense fallback={<ReportLoading />}>
            <ActiveReportComponent />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Reports"
        subtitle="Every transaction. Every claim. Every number."
      />

      <div className={styles.body}>
        <div className={styles.grid}>
          {REPORTS.map((r, i) => (
            <motion.button
              key={r.id}
              type="button"
              className={styles.card}
              onClick={() => navigate(`/dashboard/reports/${r.id}`)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 + i * 0.05, ease: EASE_OUT_EXPO }}
              whileHover={{ y: -2 }}
            >
              <span className={styles.cardIcon}>{r.icon}</span>
              <div className={styles.cardText}>
                <span className={styles.cardTitle}>{r.title}</span>
                <span className={styles.cardDesc}>{r.description}</span>
              </div>
              <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className={styles.cardArrow}>
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
