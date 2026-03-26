import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calcFV, formatUGX, EASE_OUT_EXPO } from '../utils/finance';
import styles from './SavingsCalculator.module.css';

const MIN_PMT = 5_000;
const MAX_PMT = 20_000;
const CIRC = 2 * Math.PI * 32;

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

export default function SavingsCalculator() {
  const [pmt, setPmt] = useState(5_000);
  const [years, setYears] = useState(20);

  const sliderPct = ((pmt - MIN_PMT) / (MAX_PMT - MIN_PMT)) * 100;
  const fv = calcFV(pmt, years);
  const contributed = pmt * years * 12;
  const returnAmt = fv - contributed;
  const returnPct = fv > 0 ? Math.round((returnAmt / fv) * 100) : 0;

  function handleSlider(e) {
    const raw = MIN_PMT + (parseFloat(e.target.value) / 100) * (MAX_PMT - MIN_PMT);
    setPmt(Math.round(raw / 1000) * 1000);
  }

  return (
    <motion.div
      className={styles.card}
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {/* Year tabs */}
      <motion.div className={styles.yearRow} variants={fadeUp}>
        {[10, 20, 30, 40].map(yr => (
          <button
            key={yr}
            className={styles.yearBtn}
            data-active={years === yr}
            onClick={() => setYears(yr)}
          >
            {yr}yr
          </button>
        ))}
      </motion.div>

      {/* Projected value */}
      <motion.div className={styles.projection} variants={fadeUp}>
        <div className={styles.projLabel}>Projected savings</div>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${Math.round(fv / 100_000)}-${years}`}
            className={styles.projValue}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            {formatUGX(fv)}
          </motion.div>
        </AnimatePresence>
        <div className={styles.rateNote}>at 10% annual return</div>
      </motion.div>

      {/* Radial breakdown */}
      <motion.div className={styles.breakdown} variants={fadeUp}>
        <div className={styles.ring}>
          <svg viewBox="0 0 80 80" className={styles.ringSvg}>
            <circle cx="40" cy="40" r="32" fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <circle cx="40" cy="40" r="32" fill="none"
              stroke="rgba(217,220,242,0.2)" strokeWidth="7"
              strokeDasharray={CIRC} strokeDashoffset="0"
              transform="rotate(-90 40 40)" />
            <motion.circle cx="40" cy="40" r="32" fill="none"
              stroke="url(#ringGrad)" strokeWidth="7"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: CIRC * (1 - returnPct / 100) }}
              transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
              transform="rotate(-90 40 40)" strokeLinecap="round" />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2E8B57" />
                <stop offset="100%" stopColor="#2F8F9D" />
              </linearGradient>
            </defs>
          </svg>
          <div className={styles.ringCenter}>
            <AnimatePresence mode="wait">
              <motion.span
                key={returnPct}
                className={styles.ringPct}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {returnPct}%
              </motion.span>
            </AnimatePresence>
            <span className={styles.ringLabel}>returns</span>
          </div>
        </div>
        <div className={styles.breakdownLabels}>
          <div className={styles.breakdownRow}>
            <span className={styles.dot} data-type="contrib" />
            <span className={styles.breakdownText}>You contribute</span>
            <span className={styles.breakdownVal}>{formatUGX(contributed)}</span>
          </div>
          <div className={styles.breakdownRow}>
            <span className={styles.dot} data-type="returns" />
            <span className={styles.breakdownText}>Investment returns</span>
            <span className={styles.breakdownVal}>{formatUGX(returnAmt)}</span>
          </div>
        </div>
      </motion.div>

      {/* Contribution slider */}
      <motion.div className={styles.controls} variants={fadeUp}>
        <div className={styles.sliderTop}>
          <span className={styles.sliderLabel}>Monthly contribution</span>
          <span className={styles.sliderAmt}>{formatUGX(pmt)}</span>
        </div>
        <div className={styles.sliderTrack} style={{ '--pct': `${sliderPct}%` }}>
          <input
            type="range" min="0" max="100" step="1"
            value={sliderPct}
            className={styles.sliderInput}
            aria-label="Monthly contribution"
            onChange={handleSlider}
          />
        </div>
        <div className={styles.sliderLimits}>
          <span>UGX 5K</span>
          <span>UGX 20K</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
