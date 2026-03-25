import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import SavingsCalculator from './SavingsCalculator';
import styles from './Hero.module.css';

export default function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} className={styles.hero} aria-label="Hero">
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.grid} />
      </div>

      <motion.div className={styles.content} style={{ y, opacity }}>
        <div className={styles.inner}>
          <div className={styles.left}>
            <motion.div
              className={styles.badge}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={styles.badgeDot} />
              Trusted pension platform · Uganda
            </motion.div>

            <motion.h1
              className={styles.headline}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              Your future is being
              <br />
              <span className={styles.headlineAccent}>built right now.</span>
            </motion.h1>

            <motion.p
              className={styles.subtext}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              Start saving for retirement today — no matter your job, income, or background.
              Every contribution brings you closer to long-term security.
            </motion.p>

            <motion.div
              className={styles.ctaGroup}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <a href="#start" className={styles.primaryCta}>Start saving today</a>
              <a href="#your-journey" className={styles.secondaryCta}>
                See your money grow
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </motion.div>

            <motion.div
              className={styles.stats}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.stat}>
                <span className={styles.statNum}>120K+</span>
                <span className={styles.statLabel}>Active savers</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statNum}>UGX 48B</span>
                <span className={styles.statLabel}>Savings managed</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statNum}>10%</span>
                <span className={styles.statLabel}>Annual return rate</span>
              </div>
            </motion.div>
          </div>

          <motion.div
            className={styles.right}
            initial={{ opacity: 0, x: 32, y: 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.9, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <SavingsCalculator />
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        className={styles.scrollHint}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        style={{ opacity }}
        aria-hidden="true"
      >
        <div className={styles.scrollLine} />
        <span>Scroll to explore</span>
      </motion.div>
    </section>
  );
}
