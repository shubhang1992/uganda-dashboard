import styles from '../SubscriberDetailPage.module.css';

export function StatusPill({ status }) {
  return (
    <span className={styles.statusPill} data-tone={status}>
      <span className={styles.statusDot} />
      {status === 'active' ? 'Active' : 'Dormant'}
    </span>
  );
}

export function KycBadge({ status }) {
  // Map the raw kyc_status field to a chip. Anything missing or unrecognised
  // renders as a neutral "Pending" — we never default to "verified" because
  // that would lie to an agent looking at an un-verified subscriber.
  const normalised = status === 'verified' || status === 'pending' || status === 'rejected'
    ? status
    : 'pending';
  const label =
    normalised === 'verified' ? 'KYC verified'
    : normalised === 'rejected' ? 'KYC rejected'
    : 'KYC pending';
  return (
    <span className={styles.kycBadge} data-kyc={normalised}>
      {normalised === 'verified' ? (
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
          <path d="M2.5 6.2l2.3 2.3L9.5 3.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : normalised === 'rejected' ? (
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 4v2.2L7.4 7.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )}
      {label}
    </span>
  );
}

export function SparkBars({ values }) {
  const max = Math.max(...values, 1);
  return (
    <div className={styles.spark} aria-label="12-month contribution trend">
      {values.map((v, i) => (
        <div key={i} className={styles.sparkBar} style={{ height: `${Math.max((v / max) * 100, 4)}%` }} />
      ))}
    </div>
  );
}
