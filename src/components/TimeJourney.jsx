import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './TimeJourney.module.css';
import { calcFV, formatUGX, EASE_OUT_EXPO as EASE } from '../utils/finance';

// ─── Constants ──────────────────────────────────────────────────────────────

const START_YEAR = 2025;
const END_YEAR   = 2065;
const PMT        = 5_000;
const PTS        = 80;

// ─── Life shelf items — what your savings can become ────────────────────────

const SHELF_ITEMS = [
  {
    id: 'emergency',
    label: 'Emergency fund',
    threshold: 60_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 4l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'medical',
    label: 'Medical cover',
    threshold: 300_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <rect x="8" y="8" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M16 12v8M12 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'school',
    label: 'School fees',
    threshold: 600_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M6 14l10-5 10 5-10 5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M10 16v6c0 0 3 2 6 2s6-2 6-2v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'boda',
    label: 'Boda-boda',
    threshold: 1_500_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <circle cx="10" cy="22" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="22" cy="22" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M14 22l3-8h4l2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17 14l-3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'home',
    label: 'Home deposit',
    threshold: 3_000_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M6 16l10-9 10 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 14v11h14V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 25v-6h4v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'land',
    label: 'Plot of land',
    threshold: 5_000_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <rect x="6" y="8" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 20l7-5 5 3 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="22" cy="13" r="2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Family security',
    threshold: 10_000_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 4C16 4 6 8 6 16c0 6 4.5 10 10 12 5.5-2 10-6 10-12 0-8-10-12-10-12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M12 16l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'retire',
    label: 'Retirement',
    threshold: 25_000_000,
    icon: (
      <svg viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 28c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 6l4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

// Live impact text — what your balance covers right now
const IMPACT_TIERS = [
  { min: 0,          text: 'Start your first deposit' },
  { min: 60_000,     text: '3 months of mobile data' },
  { min: 300_000,    text: 'A medical emergency visit' },
  { min: 600_000,    text: '1 year of school fees' },
  { min: 1_500_000,  text: 'A boda-boda for income' },
  { min: 3_000_000,  text: '1 year of rent in Kampala' },
  { min: 5_000_000,  text: 'A plot of land in your district' },
  { min: 10_000_000, text: '5 years of family expenses' },
  { min: 20_000_000, text: '10 years of financial security' },
  { min: 30_000_000, text: 'Full retirement independence' },
];

function getImpact(balance) {
  let result = IMPACT_TIERS[0];
  for (const tier of IMPACT_TIERS) {
    if (balance >= tier.min) result = tier;
  }
  return result;
}
function getImpactIdx(balance) {
  let idx = 0;
  for (let i = 0; i < IMPACT_TIERS.length; i++) {
    if (balance >= IMPACT_TIERS[i].min) idx = i;
  }
  return idx;
}

// ─── Milestones ─────────────────────────────────────────────────────────────

const MILESTONES = [
  { minYear: 2025, maxYear: 2029, text: "You started saving. Most people never do.",               sub: "The habit is forming." },
  { minYear: 2029, maxYear: 2033, text: "Enough to cover a medical emergency.",                    sub: "Your first safety net is real." },
  { minYear: 2033, maxYear: 2037, text: "A full year of school fees — covered.",                   sub: "Your child's future is more secure." },
  { minYear: 2037, maxYear: 2043, text: "Returns now outpace your contributions.",                 sub: "Your money is working harder than you." },
  { minYear: 2043, maxYear: 2050, text: "You could buy a plot of land in your district.",          sub: "This is generational wealth." },
  { minYear: 2050, maxYear: 2058, text: "A decade of financial security — built.",                 sub: "Most Ugandans retire with nothing formal." },
  { minYear: 2058, maxYear: 2066, text: "Your retirement has a date, a number, and a foundation.", sub: "UGX 5K a month became everything." },
];

function getMilestone(year) {
  return MILESTONES.find(m => year >= m.minYear && year < m.maxYear) || MILESTONES[MILESTONES.length - 1];
}
function getMilestoneIdx(year) {
  const idx = MILESTONES.findIndex(m => year >= m.minYear && year < m.maxYear);
  return idx >= 0 ? idx : MILESTONES.length - 1;
}

// ─── Sky color ──────────────────────────────────────────────────────────────

const SKY = [
  { t: 0, c: [27,26,74] }, { t: 0.25, c: [32,32,96] }, { t: 0.5, c: [40,58,110] },
  { t: 0.75, c: [42,90,72] }, { t: 1, c: [24,96,64] },
];

function skyColor(p) {
  p = Math.min(Math.max(p, 0), 1);
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1].t < p) i++;
  const a = SKY[i], b = SKY[i + 1];
  const l = (p - a.t) / (b.t - a.t);
  return `rgb(${Math.round(a.c[0]+(b.c[0]-a.c[0])*l)},${Math.round(a.c[1]+(b.c[1]-a.c[1])*l)},${Math.round(a.c[2]+(b.c[2]-a.c[2])*l)})`;
}

// ─── Life Shelf ─────────────────────────────────────────────────────────────

function LifeShelf({ balance }) {
  return (
    <div className={styles.shelf}>
      {SHELF_ITEMS.map((item) => {
        const unlocked = balance >= item.threshold;
        return (
          <motion.div
            key={item.id}
            className={styles.shelfItem}
            data-unlocked={unlocked}
            animate={{
              opacity: unlocked ? 1 : 0.2,
              scale: unlocked ? 1 : 0.92,
            }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <div className={styles.shelfIcon}>
              {item.icon}
            </div>
            <span className={styles.shelfLabel}>{item.label}</span>
            {unlocked && (
              <motion.div
                className={styles.shelfCheck}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
                  <path d="M3 8l3.5 3.5L13 5" stroke="#2E8B57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function TimeJourney() {
  const cardRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const accumulated = useRef(0);
  const rafPending = useRef(false);

  const SCROLL_RANGE = 2000;

  // Batched progress update — avoids multiple re-renders per frame
  const flushProgress = useCallback(() => {
    rafPending.current = false;
    setProgress(accumulated.current / SCROLL_RANGE);
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (!rafPending.current) {
      rafPending.current = true;
      requestAnimationFrame(flushProgress);
    }
  }, [flushProgress]);

  // ── Desktop: wheel handler ──
  const handleWheel = useCallback((e) => {
    const next = accumulated.current + e.deltaY;
    if (next < 0 || next > SCROLL_RANGE) {
      accumulated.current = Math.max(0, Math.min(SCROLL_RANGE, next));
      scheduleUpdate();
      return;
    }
    e.preventDefault();
    accumulated.current = next;
    scheduleUpdate();
  }, [scheduleUpdate]);

  // ── Mobile: horizontal swipe ──
  const lastX = useRef(0);
  const swipeDecided = useRef(false);
  const swipeLocked = useRef(false);
  const cachedWidth = useRef(350);

  const handleTouchStart = useCallback((e) => {
    lastX.current = e.touches[0].clientX;
    swipeDecided.current = false;
    swipeLocked.current = false;
    cachedWidth.current = cardRef.current?.offsetWidth || 350;
  }, []);

  const handleTouchMove = useCallback((e) => {
    const x = e.touches[0].clientX;

    if (!swipeDecided.current) {
      const dx = Math.abs(x - lastX.current);
      // Decide after just 4px — much snappier
      if (dx < 4) return;
      swipeDecided.current = true;
      // Vertical scroll wins if dy > dx (use the initial touch diff)
      const initDy = Math.abs(e.touches[0].clientY - (cardRef.current?.dataset.touchY || e.touches[0].clientY));
      if (initDy > dx) return;
      swipeLocked.current = true;
    }

    if (!swipeLocked.current) return;

    e.preventDefault();

    const delta = x - lastX.current;
    lastX.current = x;

    // Direct mapping: 1px swipe = proportional progress
    const sensitivity = SCROLL_RANGE / (cachedWidth.current * 0.6);
    const next = Math.max(0, Math.min(SCROLL_RANGE, accumulated.current + delta * sensitivity));
    accumulated.current = next;
    scheduleUpdate();
  }, [scheduleUpdate]);

  const handleTouchEnd = useCallback(() => {
    swipeDecided.current = false;
    swipeLocked.current = false;
  }, []);

  // Store initial Y on touchstart for direction detection
  const handleTouchStartWrapped = useCallback((e) => {
    if (cardRef.current) {
      cardRef.current.dataset.touchY = e.touches[0].clientY;
    }
    handleTouchStart(e);
  }, [handleTouchStart]);

  // Attach listeners
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleWheel, handleTouchMove]);

  // Derived values
  const balance      = calcFV(PMT, progress * 40);
  const year         = Math.round(START_YEAR + progress * (END_YEAR - START_YEAR));
  const yearsElapsed = year - START_YEAR;
  const contributed  = PMT * yearsElapsed * 12;
  const returnAmt    = Math.max(0, balance - contributed);
  const returnPct    = balance > 0 ? Math.round((returnAmt / balance) * 100) : 0;
  const contribPct   = 100 - returnPct;
  const milestone    = getMilestone(year);
  const milestoneIdx = getMilestoneIdx(year);
  const impact       = getImpact(balance);
  const impactIdx    = getImpactIdx(balance);
  const bg           = skyColor(progress);

  return (
    <section className={styles.section} id="your-journey">
      <div className={styles.header}>
        <span className={styles.tag}>Your 40-year journey</span>
        <h2 className={styles.heading}>
          See what <span className={styles.accent}>UGX 5K/month</span> becomes
        </h2>
        <p className={styles.sub}>
          <span className={styles.desktopOnly}>Scroll inside the card to move through 40 years of growth.</span>
          <span className={styles.mobileOnly}>Swipe left and right on the card to move through time.</span>
        </p>
      </div>

      <div
        ref={cardRef}
        className={styles.card}
        style={{ backgroundColor: bg }}
        onTouchStart={handleTouchStartWrapped}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className={styles.cardInner}>
          {/* ── Left: Data ── */}
          <div className={styles.left}>
            <div className={styles.yearRow}>
              <AnimatePresence mode="wait">
                <motion.span className={styles.year} key={year}
                  initial={{ opacity: 0, filter: 'blur(10px)', y: -6 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}>
                  {year}
                </motion.span>
              </AnimatePresence>
              <span className={styles.yearSub}>
                {yearsElapsed > 0 ? `Year ${yearsElapsed}` : 'Today'}
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div className={styles.balance} key={Math.round(balance / 500_000)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}>
                {formatUGX(balance)}
              </motion.div>
            </AnimatePresence>

            {balance > 0 && (
              <div className={styles.compBlock}>
                <div className={styles.compBar}>
                  <div className={styles.compContrib} style={{ width: `${contribPct}%` }} />
                  <div className={styles.compReturns} style={{ width: `${returnPct}%` }} />
                </div>
                <div className={styles.compLabels}>
                  <span><span className={styles.dot} data-c="contrib" />{formatUGX(contributed)} you put in</span>
                  <span><span className={styles.dot} data-c="returns" />{formatUGX(returnAmt)} earned ({returnPct}%)</span>
                </div>
              </div>
            )}

            {/* Milestone */}
            <AnimatePresence mode="wait">
              <motion.div className={styles.milestone} key={milestoneIdx}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: EASE }}>
                <p className={styles.milestoneText}>{milestone.text}</p>
                <p className={styles.milestoneSub}>{milestone.sub}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Right: Life Shelf ── */}
          <div className={styles.right}>
            {/* Live impact ticker */}
            <div className={styles.impactRow}>
              <span className={styles.impactLabel}>Your balance could cover</span>
              <AnimatePresence mode="wait">
                <motion.span className={styles.impactText} key={impactIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: EASE }}>
                  {impact.text}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Shelf of life objects */}
            <LifeShelf balance={balance} />

            <div className={styles.shelfFooter}>
              <span>{SHELF_ITEMS.filter(i => balance >= i.threshold).length}</span>
              <span> of {SHELF_ITEMS.length} life goals unlocked</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
          <span className={styles.progressLabel}>
            {Math.round(progress * 40)} of 40 years
          </span>
        </div>

        {/* Desktop: scroll hint */}
        <AnimatePresence>
          {progress < 0.02 && (
            <motion.div className={`${styles.hint} ${styles.desktopOnly}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5 }}>
              <motion.span
                animate={{ y: [0, 5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}>
                ↓
              </motion.span>
              <span>Scroll here to explore</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile: swipe hint */}
        <AnimatePresence>
          {progress < 0.02 && (
            <motion.div className={`${styles.swipeHint} ${styles.mobileOnly}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5 }}>
              <motion.span
                animate={{ x: [0, 12, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
                →
              </motion.span>
              Swipe to move through time
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
