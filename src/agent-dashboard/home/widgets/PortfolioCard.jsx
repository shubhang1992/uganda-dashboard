import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../../utils/motion';

import { formatUGX, formatNumber } from '../../../utils/currency';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import styles from './PortfolioCard.module.css';

/**
 * PortfolioCard — white card summarising the agent's book: totals plus an
 * active-vs-dormant split bar. Active is green, dormant is AMBER (dormant is
 * "needs attention", not an error — red is reserved for real errors).
 *
 * Aggregation lifted out of the old PortfolioPulseCard.
 */
export default function PortfolioCard({ agentId }) {
  const reduce = useReducedMotion();
  const { data: subscribers = [] } = useAgentSubscribers(agentId);

  const portfolio = useMemo(() => {
    let lifetime = 0;
    let active = 0;
    for (const s of subscribers) {
      lifetime += s.totalContributions || 0;
      if (s.isActive) active += 1;
    }
    const total = subscribers.length;
    return { total, active, dormant: total - active, lifetime };
  }, [subscribers]);

  const splitTotal = portfolio.active + portfolio.dormant;
  const activePct = splitTotal > 0 ? (portfolio.active / splitTotal) * 100 : 0;
  const dormantPct = splitTotal > 0 ? (portfolio.dormant / splitTotal) * 100 : 0;

  return (
    <section className={styles.card} aria-label="Portfolio">
      <header className={styles.head}>
        <span className={styles.eyebrow}>Portfolio</span>
        <h3 className={styles.title}>Your subscriber book</h3>
      </header>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Subscribers</span>
          <span className={styles.statValue}>{formatNumber(portfolio.total)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total contributions</span>
          <span className={styles.statValue}>{formatUGX(portfolio.lifetime)}</span>
        </div>
      </div>

      <div className={styles.split}>
        <div className={styles.splitHead}>
          <span className={styles.splitLabel}>Active vs dormant</span>
        </div>
        <div
          className={styles.splitBar}
          role="img"
          aria-label={`${Math.round(activePct)}% active, ${Math.round(dormantPct)}% dormant`}
        >
          <motion.span
            className={styles.splitActive}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${activePct}%` }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.08 }}
          />
          <motion.span
            className={styles.splitDormant}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${dormantPct}%` }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.14 }}
          />
        </div>
        <div className={styles.splitLegend}>
          <span className={styles.splitItem}>
            <span className={styles.splitDot} data-tone="active" aria-hidden="true" />
            <span className={styles.splitItemLabel}>Active</span>
            <span className={styles.splitItemValue}>{formatNumber(portfolio.active)}</span>
          </span>
          <span className={styles.splitItem}>
            <span className={styles.splitDot} data-tone="dormant" aria-hidden="true" />
            <span className={styles.splitItemLabel}>Dormant</span>
            <span className={styles.splitItemValue}>{formatNumber(portfolio.dormant)}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
