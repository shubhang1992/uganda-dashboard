import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/finance';
import { useIsMobile } from '../hooks/useIsMobile';
import SavingsCalculator from './SavingsCalculator';
import styles from './Hero.module.css';

// ── Floating blobs — soft colored orbs that drift across the hero ────────────
const BLOBS = [
  { size: 320, x: '5%',   y: '10%',  dur: 22, delay: 0,   color: '#5E63A8', opacity: 0.07, blur: 80  },
  { size: 240, x: '70%',  y: '15%',  dur: 26, delay: 1.5, color: '#2F8F9D', opacity: 0.06, blur: 70  },
  { size: 280, x: '50%',  y: '60%',  dur: 28, delay: 3,   color: '#5E63A8', opacity: 0.06, blur: 75  },
  { size: 200, x: '20%',  y: '55%',  dur: 20, delay: 2,   color: '#2E8B57', opacity: 0.05, blur: 60  },
  { size: 160, x: '80%',  y: '50%',  dur: 18, delay: 4,   color: '#D9DCF2', opacity: 0.15, blur: 50  },
];

export default function Hero() {
  const ref = useRef(null);
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });

  // Disable parallax on mobile to prevent scroll fighting
  const y = useTransform(scrollYProgress, [0, 1], isMobile ? ['0%', '0%'] : ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.7], isMobile ? [1, 1] : [1, 0]);

  return (
    <section ref={ref} className={styles.hero} aria-label="Hero">
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.grid} />

        {/* Animated floating blobs */}
        {BLOBS.map((b, i) => (
          <motion.div
            key={i}
            className={styles.blob}
            style={{
              width: b.size,
              height: b.size,
              left: b.x,
              top: b.y,
              background: b.color,
              opacity: b.opacity,
              filter: `blur(${b.blur}px)`,
            }}
            animate={{
              y: [0, -30, 10, -20, 0],
              x: [0, 20, -15, 10, 0],
              scale: [1, 1.15, 0.95, 1.1, 1],
            }}
            transition={{
              duration: b.dur,
              delay: b.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      <motion.div className={styles.content} style={{ y, opacity }}>
        <div className={styles.inner}>
          <div className={styles.left}>
            <motion.div
              className={styles.badge}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT_EXPO }}
            >
              <span className={styles.badgeDot} />
              Trusted pension platform · Uganda
            </motion.div>

            <motion.h1
              className={styles.headline}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35, ease: EASE_OUT_EXPO }}
            >
              Your future is being
              <br />
              <span className={styles.headlineAccent}>built right now.</span>
            </motion.h1>

            <motion.p
              className={styles.subtext}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: EASE_OUT_EXPO }}
            >
              Start saving for retirement today — no matter your job, income, or background.
              Every contribution brings you closer to long-term security.
            </motion.p>

            <motion.div
              className={styles.ctaGroup}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.65, ease: EASE_OUT_EXPO }}
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
              transition={{ duration: 0.7, delay: 0.8, ease: EASE_OUT_EXPO }}
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
            transition={{ duration: 0.9, delay: 0.7, ease: EASE_OUT_EXPO }}
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
