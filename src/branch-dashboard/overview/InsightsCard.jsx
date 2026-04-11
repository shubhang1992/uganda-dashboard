import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import styles from './InsightsCard.module.css';

function generateInsights(metrics, agents) {
  const insights = [];

  // Top agent vs average
  if (agents.length > 1) {
    const sorted = [...agents].sort((a, b) =>
      (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0)
    );
    const top = sorted[0];
    const avg = agents.reduce((s, a) => s + (a.metrics?.totalContributions || 0), 0) / agents.length;
    const topContrib = top.metrics?.totalContributions || 0;
    if (avg > 0 && topContrib / avg >= 1.3) {
      const ratio = (topContrib / avg).toFixed(1);
      insights.push({
        type: 'positive',
        icon: 'star',
        text: `${top.name.split(' ')[0]} collected ${ratio}x the branch average`,
        detail: `${formatUGX(topContrib)} total contributions`,
      });
    }
  }

  // Active rate trend
  const activeRate = metrics.activeRate || 0;
  if (activeRate >= 75) {
    insights.push({
      type: 'positive',
      icon: 'check',
      text: `Active rate at ${Math.round(activeRate)}% — above target`,
      detail: `${metrics.activeSubscribers || 0} of ${metrics.totalSubscribers || 0} subscribers contributing`,
    });
  } else if (activeRate >= 50) {
    insights.push({
      type: 'warning',
      icon: 'alert',
      text: `Active rate at ${Math.round(activeRate)}% — needs attention`,
      detail: `${(metrics.totalSubscribers || 0) - (metrics.activeSubscribers || 0)} subscribers are dormant`,
    });
  } else {
    insights.push({
      type: 'negative',
      icon: 'alert',
      text: `Active rate dropped to ${Math.round(activeRate)}%`,
      detail: `Only ${metrics.activeSubscribers || 0} of ${metrics.totalSubscribers || 0} are contributing`,
    });
  }

  // Inactive agents
  const inactiveAgents = agents.filter(a => a.status === 'inactive');
  if (inactiveAgents.length > 0) {
    insights.push({
      type: 'warning',
      icon: 'agent',
      text: `${inactiveAgents.length} agent${inactiveAgents.length > 1 ? 's' : ''} currently inactive`,
      detail: inactiveAgents.map(a => a.name.split(' ')[0]).join(', '),
    });
  }

  // Month-over-month growth
  const mc = metrics.monthlyContributions || [];
  const curr = mc[11] || 0;
  const prev = mc[10] || 0;
  if (prev > 0) {
    const pctChange = Math.round(((curr - prev) / prev) * 100);
    if (pctChange > 5) {
      insights.push({
        type: 'positive',
        icon: 'trending',
        text: `Collections up ${pctChange}% this month`,
        detail: `${formatUGX(curr)} vs ${formatUGX(prev)} last month`,
      });
    } else if (pctChange < -5) {
      insights.push({
        type: 'negative',
        icon: 'trending',
        text: `Collections down ${Math.abs(pctChange)}% this month`,
        detail: `${formatUGX(curr)} vs ${formatUGX(prev)} last month`,
      });
    }
  }

  // New subscriber momentum
  const newMonth = metrics.newSubscribersThisMonth || 0;
  const prevNewMonth = metrics.prevNewSubscribersThisMonth || 0;
  if (newMonth > prevNewMonth && prevNewMonth > 0) {
    insights.push({
      type: 'positive',
      icon: 'growth',
      text: `Subscriber growth accelerating`,
      detail: `${newMonth} new this month vs ${prevNewMonth} last month`,
    });
  }

  return insights.slice(0, 4);
}

const ICONS = {
  star: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
      <path d="M12 2l2.09 6.26L20 9.27l-4.91 3.82L16.18 20 12 16.77 7.82 20l1.09-6.91L4 9.27l5.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  alert: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  agent: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M18 8l-4 4M14 8l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  trending: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
      <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 6h6v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  growth: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
};

export default function InsightsCard({ metrics, agents }) {
  const insights = useMemo(() => generateInsights(metrics, agents), [metrics, agents]);

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: EASE_OUT_EXPO }}
    >
      <h3 className={styles.title}>Key Insights</h3>

      <div className={styles.list}>
        {insights.map((insight, i) => (
          <motion.div
            key={i}
            className={styles.insight}
            data-type={insight.type}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.5 + i * 0.08, ease: EASE_OUT_EXPO }}
          >
            <div className={styles.insightIcon} data-type={insight.type}>
              {ICONS[insight.icon]}
            </div>
            <div className={styles.insightContent}>
              <span className={styles.insightText}>{insight.text}</span>
              <span className={styles.insightDetail}>{insight.detail}</span>
            </div>
          </motion.div>
        ))}
        {insights.length === 0 && (
          <p className={styles.empty}>No notable insights right now</p>
        )}
      </div>
    </motion.div>
  );
}
