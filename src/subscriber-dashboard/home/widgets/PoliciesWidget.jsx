import { useNavigate } from 'react-router-dom';
import { formatMemberId } from '../../../utils/memberId';
import { useSubscriberNominees } from '../../../hooks/useSubscriber';
import { useToast } from '../../../contexts/ToastContext';
import { openPolicyCertificate } from '../../../signup/contribution/insurancePolicyCertificate';
import styles from './PoliciesWidget.module.css';

/**
 * "Your policies" home card — two document rows the subscriber can open:
 *   1. Life cover certificate — only when life cover exists and the policy is
 *      active. Click assembles the certificate payload (nominees + premium) and
 *      opens the printable certificate in a new tab. Pop-up blocked → toast.
 *   2. Annual statement 2025 — routes to the reports page.
 *
 * PDF metadata (size, issued date) is decorative — no real file is generated.
 */
export default function PoliciesWidget({ subscriber }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { data: nominees } = useSubscriberNominees(subscriber?.id);

  const insurance = subscriber?.insurance || {};
  const cover = insurance?.cover || 0;
  const policyActive = insurance?.status === 'active';
  const hasLifeCover = cover > 0 && policyActive;

  function handleOpenCertificate() {
    const ok = openPolicyCertificate({
      holderName: subscriber?.name,
      memberId: formatMemberId(subscriber?.phone),
      dob: subscriber?.dob,
      cover,
      premiumPerPeriod: insurance?.premiumMonthly,
      frequency: subscriber?.contributionSchedule?.frequency,
      policyStart: insurance?.policyStart,
      renewalDate: insurance?.renewalDate,
      beneficiaries: nominees?.insurance ?? [],
    });
    if (!ok) {
      addToast('error', 'Please allow pop-ups for this site, then try again to open your certificate.');
    }
  }

  return (
    <section className={styles.card} aria-labelledby="policies-title">
      <header className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Documents
          </span>
          <h3 id="policies-title" className={styles.title}>Your policies</h3>
        </div>
        <button
          type="button"
          className={styles.viewAll}
          onClick={() => navigate('/dashboard/reports/annual-statement')}
        >
          View all
          <svg aria-hidden="true" viewBox="0 0 14 14" width="12" height="12" fill="none">
            <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </header>

      <div className={styles.rows}>
        {hasLifeCover && (
          <button
            type="button"
            className={styles.row}
            onClick={handleOpenCertificate}
            aria-label="Open your life cover certificate"
          >
            <span className={styles.docIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                <path d="M13 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>Life cover certificate</span>
              <span className={styles.rowMeta}>PDF · Certificate of life insurance</span>
            </span>
            <span className={styles.rowAction} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        )}

        <button
          type="button"
          className={styles.row}
          onClick={() => navigate('/dashboard/reports/annual-statement')}
          aria-label="Open your 2025 annual statement"
        >
          <span className={styles.docIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M13 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M9 13h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </span>
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>Annual statement 2025</span>
            <span className={styles.rowMeta}>PDF · Yearly savings summary</span>
          </span>
          <span className={styles.rowAction} aria-hidden="true">
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      </div>
    </section>
  );
}
