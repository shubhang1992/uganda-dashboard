import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ForYou.module.css';

const ROLES = [
  {
    id: 'subscriber',
    label: 'Individuals',
    emoji: '👤',
    headline: 'Save for yourself.',
    desc: 'Whether you are a gig worker, farmer, or self-employed — Universal Pensions is built for you. Start small, stay consistent, and build long-term security.',
    features: [
      'Personal savings dashboard',
      'Flexible contribution amounts',
      'Progress tracking and projections',
      'Mobile and web access',
      'Instant contribution confirmation',
    ],
    cta: 'Open your account',
    bg: 'var(--color-cloud)',
    accent: 'var(--color-indigo)',
  },
  {
    id: 'employer',
    label: 'Employers',
    emoji: '🏢',
    headline: 'Invest in your team.',
    desc: 'Enrol your employees, manage bulk contributions, and track participation — all in one clean, low-friction workspace.',
    features: [
      'Employee enrolment management',
      'Bulk contribution uploads',
      'Participation and compliance reporting',
      'Payroll integration support',
      'Dedicated employer dashboard',
    ],
    cta: 'Set up for your company',
    bg: '#EEF0FA',
    accent: 'var(--color-indigo)',
  },
  {
    id: 'agent',
    label: 'Agents',
    emoji: '🤝',
    headline: 'Help others secure their future.',
    desc: 'Guide subscribers through registration, contributions, and basic servicing. Fast, mobile-ready tools built for the field.',
    features: [
      'Guided onboarding workflows',
      'Mobile-optimised interface',
      'Subscriber status tracking',
      'Task and action queue',
      'Offline-capable key flows',
    ],
    cta: 'Become an agent',
    bg: '#EBF6F2',
    accent: '#2E8B57',
  },
];

export default function ForYou() {
  const [active, setActive] = useState('subscriber');
  const role = ROLES.find((r) => r.id === active);

  return (
    <section className={styles.section} id="for-you">
      <div className="container">
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.sectionTag}>Built for everyone</div>
          <h2 className={styles.heading}>
            Universal Pensions
            <br />
            <span className={styles.headingAccent}>is built for you.</span>
          </h2>
          <p className={styles.subtext}>
            Whether you are saving for yourself, managing a team, or helping others —
            each role has its own tailored experience.
          </p>
        </motion.div>

        <div className={styles.tabs} role="tablist" aria-label="User roles">
          {ROLES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={active === r.id}
              className={styles.tab}
              data-active={active === r.id}
              onClick={() => setActive(r.id)}
            >
              <span className={styles.tabEmoji}>{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className={styles.panel}
            style={{ '--panel-bg': role.bg, '--panel-accent': role.accent }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            role="tabpanel"
            aria-label={`${role.label} features`}
          >
            <div className={styles.panelLeft}>
              <h3 className={styles.panelHeadline}>{role.headline}</h3>
              <p className={styles.panelDesc}>{role.desc}</p>
              <a href={`#${role.id}`} className={styles.panelCta}>{role.cta}</a>
            </div>
            <div className={styles.panelRight}>
              <ul className={styles.featureList} aria-label={`${role.label} features`}>
                {role.features.map((f, i) => (
                  <motion.li
                    key={f}
                    className={styles.featureItem}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className={styles.featureCheck} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    {f}
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
