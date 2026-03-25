import { motion } from 'framer-motion';
import styles from './CTA.module.css';

export default function CTA() {
  return (
    <section className={styles.section} id="start">
      <div className="container">
        <motion.div
          className={styles.card}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.bg} aria-hidden="true">
            <div className={styles.orb1} />
            <div className={styles.orb2} />
          </div>

          <div className={styles.content}>
            <div className={styles.badge}>
              <span className={styles.dot} />
              No minimum. Start anytime.
            </div>
            <h2 className={styles.heading}>
              The best time to start saving
              <br />
              <span className={styles.accent}>was yesterday. Today is second best.</span>
            </h2>
            <p className={styles.subtext}>
              Open your Universal Pensions account in minutes.
              No paperwork, no branch visit, no minimum contribution.
            </p>
            <div className={styles.actions}>
              <a href="#open-account" className={styles.primaryBtn}>
                Open your account
              </a>
              <a href="#learn-more" className={styles.secondaryBtn}>
                Talk to an agent
              </a>
            </div>
          </div>

          <div className={styles.visual} aria-hidden="true">
            <div className={styles.card1}>
              <div className={styles.cardMini}>
                <div className={styles.miniLabel}>Projected balance at 65</div>
                <div className={styles.miniValue}>UGX 32M</div>
                <div className={styles.miniBadge}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 8l2.5-3 2 2 3.5-5" stroke="#2E8B57" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Starting today
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
