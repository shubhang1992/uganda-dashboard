import { Link } from 'react-router-dom';
import { formatNumber, formatUGX } from '../../../utils/currency';
import styles from './InsuranceCard.module.css';

/**
 * InsuranceCard — agent desktop Home insurance summary. Surfaces life-cover
 * uptake across the agent's book: insured vs uninsured members, the average
 * cover per insured member, and a coverage bar (% of members with active cover).
 *
 * Figures are derived in HomeDesktop from the subscribers' `insurance` field
 * (cover / status), which the agent service now joins. Resilient to zero data
 * (e.g. RLS-filtered insurance on live): renders "None yet" + zeros rather than
 * breaking. Desktop-only surface — not used by the mobile agent Home.
 */
const ShieldIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path
      d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9 12l2 2 4-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function InsuranceCard({
  insured = 0,
  uninsured = 0,
  avgCover = 0,
  coveragePct = 0,
}) {
  return (
    <section className={styles.card} aria-label="Insurance coverage">
      <div className={styles.head}>
        <span className={styles.title}>
          <span className={styles.icon}>{ShieldIcon}</span>
          Insurance
        </span>
      </div>

      <div className={styles.stats}>
        <Link
          className={styles.statLink}
          to="/dashboard/insured"
          aria-label={`View ${formatNumber(insured)} insured members`}
        >
          <span className={styles.k}>Insured members</span>
          <span className={styles.vRow}>
            <span className={styles.v}>{formatNumber(insured)}</span>
            <span className={styles.chev}>{ChevronIcon}</span>
          </span>
          <span className={styles.sub}>have active cover</span>
        </Link>
        <Link
          className={styles.statLink}
          to="/dashboard/uninsured"
          aria-label={`View ${formatNumber(uninsured)} uninsured members and send a reminder`}
        >
          <span className={styles.k}>Uninsured members</span>
          <span className={styles.vRow}>
            <span className={styles.v}>{formatNumber(uninsured)}</span>
            <span className={styles.chev}>{ChevronIcon}</span>
          </span>
          <span className={styles.sub}>no cover yet</span>
        </Link>
        <div className={styles.stat}>
          <span className={styles.k}>Avg. cover / member</span>
          <span className={styles.v}>{formatUGX(avgCover)}</span>
          <span className={styles.sub}>across insured</span>
        </div>
      </div>

      <div className={styles.bar} role="presentation">
        <div className={styles.barFill} style={{ width: `${coveragePct}%` }} />
      </div>
      <div className={styles.cap}>
        <span>
          <span className={styles.pct}>{coveragePct}%</span> of your members are insured
        </span>
        {uninsured > 0 && <span>{formatNumber(uninsured)} to go</span>}
      </div>
    </section>
  );
}
