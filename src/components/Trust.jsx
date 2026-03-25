import { motion } from 'framer-motion';
import styles from './Trust.module.css';

const STATS = [
  { value: '120K+', label: 'Active savers across Uganda', icon: '👥' },
  { value: 'UGX 48B', label: 'Total savings under management', icon: '📈' },
  { value: '97%', label: 'On-time contribution rate', icon: '✓' },
  { value: '5 yrs', label: 'Licensed and regulated', icon: '🏦' },
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
