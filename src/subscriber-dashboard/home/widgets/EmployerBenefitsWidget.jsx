// Employer benefits widget — shown only for subscribers an employer onboarded
// (sub.employerId set, 0043). Surfaces the total / own / employer contribution
// breakdown so the member sees what their employer adds on top of their own
// savings. Data via `useContributionBreakdown`.

import { useContributionBreakdown } from '../../../hooks/useSubscriber';
import { formatUGX } from '../../../utils/currency';
import styles from './EmployerBenefitsWidget.module.css';

export default function EmployerBenefitsWidget({ subscriber }) {
  const { data: breakdown } = useContributionBreakdown(subscriber?.id);
  if (!subscriber?.employerId) return null;

  const own = breakdown?.own ?? 0;
  const employer = breakdown?.employer ?? 0;
  const total = breakdown?.total ?? own + employer;

  return (
    <section className={styles.card} aria-labelledby="employer-benefits-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Employer benefits
        </span>
        <h3 id="employer-benefits-title" className={styles.title}>Your employer tops up your pension</h3>
      </header>

      <div className={styles.total}>
        <span className={styles.totalLabel}>Total contributed</span>
        <span className={styles.totalValue}>{formatUGX(total, { compact: false })}</span>
      </div>

      <div className={styles.split}>
        <div className={styles.splitCell}>
          <span className={styles.splitLabel}>Your savings</span>
          <span className={styles.splitValue}>{formatUGX(own, { compact: false })}</span>
        </div>
        <div className={styles.splitCell} data-accent="true">
          <span className={styles.splitLabel}>Employer added</span>
          <span className={styles.splitValue}>{formatUGX(employer, { compact: false })}</span>
        </div>
      </div>
    </section>
  );
}
