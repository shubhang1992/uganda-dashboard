import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatUGX, EASE_OUT_EXPO } from '../../utils/finance';
import styles from './ActivityFeed.module.css';

function generateActivity(agents) {
  const events = [];
  const now = Date.now();

  agents.forEach((agent) => {
    const m = agent.metrics || {};

    // New subscribers today → registration events
    const newToday = m.newSubscribersToday || 0;
    for (let i = 0; i < Math.min(newToday, 2); i++) {
      events.push({
        id: `reg-${agent.id}-${i}`,
        type: 'registration',
        text: `New subscriber registered via ${agent.name}`,
        time: now - Math.random() * 8 * 3600_000,
      });
    }

    // Contributions today → contribution events
    const dailyContrib = m.dailyContributions || 0;
    if (dailyContrib > 0) {
      events.push({
        id: `contrib-${agent.id}`,
        type: 'contribution',
        text: `${agent.name} collected ${formatUGX(dailyContrib)}`,
        time: now - Math.random() * 10 * 3600_000,
      });
    }
  });

  return events
    .sort((a, b) => b.time - a.time)
    .slice(0, 12);
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_ICONS = {
  registration: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="14" height="14">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  contribution: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

export default function ActivityFeed({ agents = [] }) {
  const events = useMemo(() => generateActivity(agents), [agents]);

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT_EXPO }}
    >
      <h3 className={styles.title}>Recent Activity</h3>

      <div className={styles.feed}>
        {events.map((event, i) => (
          <div key={event.id} className={styles.event}>
            <div className={styles.timeline}>
              <span className={styles.dot} data-type={event.type} />
              {i < events.length - 1 && <span className={styles.line} />}
            </div>
            <div className={styles.eventContent}>
              <div className={styles.eventIcon} data-type={event.type}>
                {TYPE_ICONS[event.type]}
              </div>
              <div className={styles.eventText}>
                <span className={styles.eventDesc}>{event.text}</span>
                <span className={styles.eventTime}>{timeAgo(event.time)}</span>
              </div>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p className={styles.empty}>No recent activity</p>
        )}
      </div>
    </motion.div>
  );
}
