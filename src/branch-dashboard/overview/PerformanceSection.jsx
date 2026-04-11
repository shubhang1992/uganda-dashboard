import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import styles from './PerformanceSection.module.css';

export default function PerformanceSection({ metrics = {}, commissionSummary }) {
  const { totalSubscribers = 0, activeSubscribers = 0, kycPending = 0, kycIncomplete = 0 } = metrics;
  const { settlementRate = 0 } = commissionSummary || {};

  const dormant = totalSubscribers - activeSubscribers;
  const kycIssues = kycPending + kycIncomplete;

  const mc = metrics.monthlyContributions || [];
  const declining = mc.length >= 2 && mc[11] < mc[10]
    ? Math.round((mc[10] - mc[11]) / (mc[10] || 1) * totalSubscribers * 0.3)
    : 0;

  const cards = [
    { value: dormant, label: 'Dormant', sub: 'Not contributing', severity: dormant > 0 ? 'warning' : 'ok' },
    { value: kycIssues, label: 'KYC Issues', sub: 'Pending or incomplete', severity: kycIssues > 0 ? 'alert' : 'ok' },
    { value: `${Math.round(settlementRate)}%`, label: 'Settled', sub: 'Commission rate', severity: 'neutral' },
    { value: declining, label: 'Declining', sub: 'Contribution dropping', severity: declining > 0 ? 'warning' : 'ok' },
  ];

  return (
    <div className={styles.strip}>
      {cards.map((card, i) => (
        <motion.div key={i} className={styles.card} data-severity={card.severity}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 + i * 0.04, ease: EASE_OUT_EXPO }}
        >
          <span className={styles.accent} aria-hidden="true" />
          <span className={styles.value}>{card.value}</span>
          <div className={styles.text}>
            <span className={styles.label}>{card.label}</span>
            <span className={styles.sub}>{card.sub}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
