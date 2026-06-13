// Employer benefits widget — shown only for subscribers an employer onboarded
// (sub.employerId set, 0043). Surfaces the own-vs-employer contribution split so
// the member sees what their employer adds on top of their own savings.
//
// We show ONLY the split (no "total contributed" line): the raw transaction feed
// is sparsely seeded, so its sum never matched the member's real balance and the
// old total contradicted the hero. `deriveEmployerSplit` re-scales the split to
// the member's derived principal (using only the feed's own:employer ratio), so
// own + employer ties out to the hero's "invested".

import { useContributionBreakdown } from '../../../hooks/useSubscriber';
import { formatUGX } from '../../../utils/currency';
import { deriveEmployerSplit } from '../../../utils/finance';
import styles from './EmployerBenefitsWidget.module.css';

export default function EmployerBenefitsWidget({ subscriber }) {
  // breakdown supplies only the member's real own:employer ratio; amounts are
  // re-scaled to the derived principal so the card agrees with the hero balance.
  const { data: breakdown } = useContributionBreakdown(subscriber?.id);
  if (!subscriber?.employerId) return null;

  const { own, employer } = deriveEmployerSplit(subscriber, breakdown);

  return (
    <section className={styles.card} aria-labelledby="employer-benefits-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          Employer benefits
        </span>
        <h3 id="employer-benefits-title" className={styles.title}>Your employer tops up your pension</h3>
      </header>

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
