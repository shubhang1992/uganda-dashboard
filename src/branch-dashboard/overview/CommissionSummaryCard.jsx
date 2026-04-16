import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatUGX, EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './CommissionSummaryCard.module.css';

const COLORS = {
  paid: '#5E63A8',
  due: '#E6A817',
  disputed: '#DC3545',
};

export default function CommissionSummaryCard({ summary }) {
  const { setCommissionsOpen, closeAllPanels } = useDashboard();
  const handleOpen = () => { closeAllPanels(); setCommissionsOpen(true); };
  const { totalPaid = 0, totalDue = 0, totalDisputed = 0, total = 0, settlementRate = 0 } = summary || {};

  const donutData = [
    { name: 'Settled', value: totalPaid, key: 'paid' },
    { name: 'Due', value: totalDue, key: 'due' },
    { name: 'Disputed', value: totalDisputed, key: 'disputed' },
  ].filter(d => d.value > 0);

  // If there's no data at all, show a placeholder ring
  const hasData = donutData.length > 0;

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: EASE_OUT_EXPO }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Commissions</h3>
        <button className={styles.viewBtn} onClick={handleOpen}>
          View All
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className={styles.donutRow}>
        <div className={styles.donutWrap}>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={hasData ? donutData : [{ name: 'Empty', value: 1 }]}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={62}
                paddingAngle={hasData ? 3 : 0}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
                stroke="none"
              >
                {hasData
                  ? donutData.map((entry) => (
                      <Cell key={entry.key} fill={COLORS[entry.key]} />
                    ))
                  : <Cell fill="rgba(41,40,103,0.06)" />
                }
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className={styles.donutCenter}>
            <span className={styles.donutRate}>{Math.round(settlementRate)}%</span>
            <span className={styles.donutRateLabel}>Settled</span>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.dot} data-type="paid" />
            <div className={styles.statText}>
              <span className={styles.statLabel}>Settled</span>
              <span className={styles.statValue}>{formatUGX(totalPaid)}</span>
            </div>
          </div>
          <div className={styles.stat}>
            <span className={styles.dot} data-type="due" />
            <div className={styles.statText}>
              <span className={styles.statLabel}>Due</span>
              <span className={styles.statValue}>{formatUGX(totalDue)}</span>
            </div>
          </div>
          <div className={styles.stat}>
            <span className={styles.dot} data-type="disputed" />
            <div className={styles.statText}>
              <span className={styles.statLabel}>Disputed</span>
              <span className={styles.statValue}>{formatUGX(totalDisputed)}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
