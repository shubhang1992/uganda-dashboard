import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUGX, EASE_OUT_EXPO as EASE } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './TimePeriodCard.module.css';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function pctChange(curr, prev) {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function ChangeBadge({ value }) {
  return (
    <span className={styles.badge} data-positive={value >= 0}>
      <svg aria-hidden="true" viewBox="0 0 10 10" width="8" height="8" fill="none">
        {value >= 0
          ? <path d="M5 2l3.5 5H1.5z" fill="currentColor"/>
          : <path d="M5 8L1.5 3h7z" fill="currentColor"/>}
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

function MetricRow({ variant, icon, value, label, change, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={styles.row} data-variant={variant} data-clickable={!!onClick} onClick={onClick}>
      <div className={styles.rowIcon} data-variant={variant}>{icon}</div>
      <div className={styles.rowText}>
        <span className={styles.rowValue}>{value}</span>
        <span className={styles.rowLabel}>{label}</span>
      </div>
      {change != null && <ChangeBadge value={change} />}
      {onClick && (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="10" height="10" className={styles.rowChevron}>
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </Tag>
  );
}

const SubsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ContribIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const WithdrawIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M21 12l-4 4-4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 16V4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M3 20h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);
const StarIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M12 2l2.09 6.26L20 9.27l-4.91 3.82L16.18 20 12 16.77 7.82 20l1.09-6.91L4 9.27l5.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function TimePeriodCard({ metrics, topAgent }) {
  const [activeIdx, setActiveIdx] = useState(2);
  const period = PERIODS[activeIdx].key;
  const { setViewReportsOpen, setReportContext, closeAllPanels } = useDashboard();

  function openReport(reportId) {
    closeAllPanels();
    setReportContext(reportId);
    setViewReportsOpen(true);
  }

  const data = {
    today: {
      subs: metrics.newSubscribersToday || 0,
      subsChange: pctChange(metrics.newSubscribersToday, metrics.prevNewSubscribersToday),
      contrib: metrics.dailyContributions || 0,
      contribChange: pctChange(metrics.dailyContributions, metrics.prevDailyContributions),
      withdraw: metrics.dailyWithdrawals || 0,
      withdrawChange: pctChange(metrics.dailyWithdrawals, metrics.prevDailyWithdrawals),
    },
    week: {
      subs: metrics.newSubscribersThisWeek || 0,
      subsChange: pctChange(metrics.newSubscribersThisWeek, metrics.prevNewSubscribersThisWeek),
      contrib: metrics.weeklyContributions || 0,
      contribChange: pctChange(metrics.weeklyContributions, metrics.prevWeeklyContributions),
      withdraw: metrics.weeklyWithdrawals || 0,
      withdrawChange: pctChange(metrics.weeklyWithdrawals, metrics.prevWeeklyWithdrawals),
    },
    month: {
      subs: metrics.newSubscribersThisMonth || 0,
      subsChange: pctChange(metrics.newSubscribersThisMonth, metrics.prevNewSubscribersThisMonth),
      contrib: metrics.monthlyContributions?.[11] || 0,
      contribChange: pctChange(metrics.monthlyContributions?.[11], metrics.monthlyContributions?.[10]),
      withdraw: metrics.monthlyWithdrawals || 0,
      withdrawChange: pctChange(metrics.monthlyWithdrawals, metrics.prevMonthlyWithdrawals),
    },
  };

  const d = data[period];

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
    >
      <div className={styles.tabs} role="tablist">
        {PERIODS.map((p, i) => (
          <button
            key={p.key}
            className={styles.tab}
            data-active={i === activeIdx}
            onClick={() => setActiveIdx(i)}
            role="tab"
            aria-selected={i === activeIdx}
          >
            {p.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={period}
          className={styles.list}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <MetricRow
            variant="subscribers" icon={<SubsIcon />}
            value={d.subs.toLocaleString()} label="New Subscribers"
            change={d.subsChange}
            onClick={() => openReport('subscriber-growth')}
          />
          <MetricRow
            variant="contribution" icon={<ContribIcon />}
            value={formatUGX(d.contrib)} label="Contributions"
            change={d.contribChange}
            onClick={() => openReport('contributions-collections')}
          />
          <MetricRow
            variant="withdrawal" icon={<WithdrawIcon />}
            value={formatUGX(d.withdraw)} label="Withdrawals"
            change={d.withdrawChange}
            onClick={() => openReport('withdrawals-payouts')}
          />
          {topAgent && (
            <MetricRow
              variant="branch" icon={<StarIcon />}
              value={topAgent.name} label={`Top Agent · ${formatUGX(topAgent.metrics?.totalContributions || 0)}`}
              onClick={() => openReport('agent-performance')}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
