import { motion } from 'framer-motion';
import styles from './Trust.module.css';

const STATS = [
  {
    value: '120K+',
    label: 'Active savers across Uganda',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M17 13.5a4 4 0 013 3.87V21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'UGX 48B',
    label: 'Total savings under management',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M7 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: '97%',
    label: 'On-time contribution rate',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: '5 yrs',
    label: 'Licensed and regulated',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 3L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-4z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'PCI DSS',
    label: 'Certified payment security',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <circle cx="12" cy="15.5" r="1.5" fill="currentColor"/>
      </svg>
    ),
  },
];

const TESTIMONIALS = [
  {
    quote: 'I never thought I could save for retirement — I work for myself. Universal Pensions made it simple. I contribute what I can, when I can.',
    name: 'Aisha Namukasa',
    role: 'Tailoring business, Kampala',
    initials: 'AN',
  },
  {
    quote: 'Managing contributions for 80 employees used to take days. Now I upload a file and it is done. The reporting is clear and our staff appreciate the benefit.',
    name: 'Robert Ochieng',
    role: 'HR Manager, logistics company',
    initials: 'RO',
  },
  {
    quote: 'I enrol up to 15 new subscribers per week. The agent app is fast, guides me through each step, and my clients trust the process.',
    name: 'Grace Atim',
    role: 'Field agent, Northern Uganda',
    initials: 'GA',
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
};

export default function Trust() {
  return (
    <section className={styles.section} id="trust">
      {/* Stats strip */}
      <div className={styles.statsStrip}>
        <div className="container">
          <motion.div
            className={styles.statsGrid}
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            {STATS.map((s) => (
              <motion.div key={s.label} className={styles.statCard} variants={item}>
                <div className={styles.statIcon}>{s.icon}</div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Testimonials */}
      <div className={styles.testimonials}>
        <div className="container">
          <motion.div
            className={styles.header}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.sectionTag}>Real stories</div>
            <h2 className={styles.heading}>People saving for their future.</h2>
          </motion.div>

          <motion.div
            className={styles.testimonialGrid}
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            {TESTIMONIALS.map((t) => (
              <motion.figure key={t.name} className={styles.testimonialCard} variants={item}>
                <svg className={styles.quoteIcon} width="32" height="24" viewBox="0 0 32 24" fill="none" aria-hidden="true">
                  <path d="M0 24V14.4C0 5.28 5.28 1.2 14.4 0l1.44 2.88C10.8 4.32 8.16 7.44 7.68 12H14.4V24H0zm17.6 0V14.4C17.6 5.28 22.88 1.2 32 0l1.44 2.88C28.4 4.32 25.76 7.44 25.28 12H32V24H17.6z" fill="var(--color-lavender)"/>
                </svg>
                <blockquote className={styles.quote}>{t.quote}</blockquote>
                <figcaption className={styles.person}>
                  <div className={styles.avatar} aria-hidden="true">{t.initials}</div>
                  <div>
                    <div className={styles.personName}>{t.name}</div>
                    <div className={styles.personRole}>{t.role}</div>
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
