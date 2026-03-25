import { useRef, useState } from 'react';
import {
  motion,
  useScroll,
  useSpring,
  useMotionValueEvent,
  AnimatePresence,
} from 'framer-motion';
import styles from './TimeJourney.module.css';
import { calcFV, formatUGX } from '../utils/finance';

// ─── Constants ────────────────────────────────────────────────────────────────

const START_YEAR = 2025;
const END_YEAR   = 2065;
const PMT        = 5_000;     // UGX 5K/month
const PTS        = 80;

// ─── Precomputed chart geometry ───────────────────────────────────────────────

const SVG_W = 420, SVG_H = 280;
const PAD   = { t: 16, b: 36, l: 0, r: 16 };
const CW    = SVG_W - PAD.l - PAD.r;  // 404
const CH    = SVG_H - PAD.t - PAD.b;  // 228

const DATA = Array.from({ length: PTS + 1 }, (_, i) => {
  const t = i / PTS;
  return { t, contributed: PMT * t * 40 * 12, total: calcFV(PMT, t * 40) };
});

const MAX_VAL  = DATA[PTS].total;  // ~150M
const tx = (t) => PAD.l + t * CW;
const ty = (v) => PAD.t + CH - (v / MAX_VAL) * CH;
const BASE     = PAD.t + CH;

// Fixed SVG paths (never change)
const GHOST_LINE = `M ${tx(0)} ${ty(0)} ${DATA.map(d => `L ${tx(d.t).toFixed(1)} ${ty(d.total).toFixed(1)}`).join(' ')}`;
const TOTAL_AREA = `M ${tx(0)} ${BASE} ${DATA.map(d => `L ${tx(d.t).toFixed(1)} ${ty(d.total).toFixed(1)}`).join(' ')} L ${tx(1)} ${BASE} Z`;
const CONTRIB_AREA = `M ${tx(0)} ${BASE} ${DATA.map(d => `L ${tx(d.t).toFixed(1)} ${ty(d.contributed).toFixed(1)}`).join(' ')} L ${tx(1)} ${BASE} Z`;

// ─── Stages ───────────────────────────────────────────────────────────────────

const STAGES = [
  {
    range: [2025, 2031],
    title: 'You started. Most people never do.',
    desc: "You joined 120,000+ Ugandans building a different future. Even UGX 5K a month is earning 10% annually in Uganda's treasury markets.",
    bg: '#1B1A4A',
  },
  {
    range: [2031, 2038],
    title: 'Five years in. Your balance is real.',
    desc: "Life happened — a slow month, a tough season. But the habit held. You're approaching UGX 400K. Small deposits, real money.",
    bg: '#202060',
  },
  {
    range: [2038, 2048],
    title: 'Returns now outpace your contributions.',
    desc: "This is the inflection point. Your annual returns exceeded what you added yourself. Compounding has taken over.",
    bg: '#1E4A60',
  },
  {
    range: [2048, 2058],
    title: 'Two decades. The gap is permanent.',
    desc: "Three-quarters of your balance came from returns. Most Ugandans retire with nothing formal. You built something real.",
    bg: '#1A5A48',
  },
  {
    range: [2058, 2065],
    title: 'The end is the beginning.',
    desc: "What started as UGX 5K a month has crossed UGX 30 million. Your retirement is not an idea. It has a date.",
    bg: '#186040',
  },
];

function getStage(year) {
  return STAGES.findIndex(s => year >= s.range[0] && year < s.range[1]) ?? STAGES.length - 1;
}

// ─── Abstract growth plant ──────────────────────────────────────────────────

function GrowthPlant({ progress }) {
  const p = Math.min(progress * 1.15, 1);
  const stemH = p * 48;

  const leaves = [
    { cx: 28, cy: 42, r: 4, t: 0.12, c: 'rgba(46,139,87,0.35)' },
    { cx: 20, cy: 37, r: 5, t: 0.25, c: 'rgba(47,143,157,0.3)' },
    { cx: 36, cy: 32, r: 5, t: 0.38, c: 'rgba(46,139,87,0.35)' },
    { cx: 22, cy: 27, r: 6, t: 0.5,  c: 'rgba(47,143,157,0.3)' },
    { cx: 34, cy: 22, r: 6, t: 0.62, c: 'rgba(46,139,87,0.35)' },
    { cx: 28, cy: 18, r: 7, t: 0.72, c: 'rgba(46,139,87,0.4)' },
    { cx: 22, cy: 14, r: 5, t: 0.82, c: 'rgba(47,143,157,0.3)' },
    { cx: 34, cy: 12, r: 5, t: 0.9,  c: 'rgba(46,139,87,0.35)' },
  ];

  return (
    <svg viewBox="0 0 56 72" width="44" height="56" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="67" r={2 + p} fill="rgba(46,139,87,0.3)" />
      <line
        x1="28" y1="66" x2="28" y2={66 - stemH}
        stroke="rgba(46,139,87,0.45)" strokeWidth="1.5" strokeLinecap="round"
      />
      {p > 0.28 && (
        <line x1="28" y1={66 - stemH * 0.45} x2="20" y2={66 - stemH * 0.58}
          stroke="rgba(46,139,87,0.3)" strokeWidth="1" strokeLinecap="round"
          opacity={Math.min((p - 0.28) * 4, 1)} />
      )}
      {p > 0.5 && (
        <line x1="28" y1={66 - stemH * 0.68} x2="36" y2={66 - stemH * 0.8}
          stroke="rgba(46,139,87,0.3)" strokeWidth="1" strokeLinecap="round"
          opacity={Math.min((p - 0.5) * 4, 1)} />
      )}
      {leaves.filter(l => p > l.t).map((l, i) => (
        <circle key={i} cx={l.cx} cy={l.cy}
          r={l.r * Math.min((p - l.t) * 3, 1)}
          fill={l.c} />
      ))}
    </svg>
  );
}

// ─── Snowball chart ────────────────────────────────────────────────────────────

function JourneyChart({ progress, ballX, ballY, ballR, clipW, balanceLabel }) {
  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className={styles.chart}
      aria-label="Your savings growth over time"
    >
      <defs>
        <linearGradient id="tjTotal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5E63A8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#2E8B57" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="tjContrib" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
        <linearGradient id="tjStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5E63A8" />
          <stop offset="60%" stopColor="#2F8F9D" />
          <stop offset="100%" stopColor="#2E8B57" />
        </linearGradient>
        <radialGradient id="tjBall" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(94,99,168,0.8)" />
        </radialGradient>
        {/* Scroll-driven clip */}
        <clipPath id="tjReveal">
          <rect x="0" y="0" height={SVG_H} width={clipW} />
        </clipPath>
        {/* Ball glow filter */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Ghost — full 40yr curve, very faint */}
      <path
        d={GHOST_LINE}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />

      {/* Scroll-revealed areas */}
      <g clipPath="url(#tjReveal)">
        <path d={TOTAL_AREA}   fill="url(#tjTotal)" />
        <path d={CONTRIB_AREA} fill="url(#tjContrib)" />
        <path
          d={GHOST_LINE}
          fill="none"
          stroke="url(#tjStroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>

      {/* Year markers on x-axis */}
      {[0, 10, 20, 30, 40].map((yr) => {
        const t = yr / 40;
        const x = tx(t);
        return (
          <g key={yr} opacity={progress * 40 >= yr ? 0.5 : 0.18}>
            <line x1={x} y1={BASE - 2} x2={x} y2={BASE + 4} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <text x={x} y={SVG_H - 4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="Inter, sans-serif">
              {yr === 0 ? 'Now' : `+${yr}`}
            </text>
          </g>
        );
      })}

      {/* Snowball — growing dot at current position */}
      {progress > 0.01 && (
        <>
          {/* Outer glow ring */}
          <motion.circle
            cx={ballX} cy={ballY}
            r={ballR + 8}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
            animate={{ r: [ballR + 6, ballR + 14, ballR + 6] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Main ball */}
          <circle
            cx={ballX} cy={ballY}
            r={ballR}
            fill="url(#tjBall)"
            filter="url(#glow)"
          />
          {/* Core highlight */}
          <circle
            cx={ballX - ballR * 0.2} cy={ballY - ballR * 0.2}
            r={ballR * 0.3}
            fill="rgba(255,255,255,0.5)"
          />
          {/* Balance tooltip */}
          {progress > 0.05 && (
            <text
              x={ballX}
              y={Math.max(ballY - ballR - 10, 12)}
              textAnchor="middle"
              fill="rgba(255,255,255,0.85)"
              fontSize="10"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontWeight="700"
            >
              {balanceLabel}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TimeJourney() {
  const outerRef = useRef(null);

  // 300vh total — 200vh of actual animation scroll
  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 80, damping: 22 });

  const [progress, setProgress] = useState(0);

  useMotionValueEvent(smoothProgress, 'change', (p) => {
    setProgress(p);
  });

  const balance  = calcFV(PMT, progress * 40);
  const year     = Math.round(START_YEAR + progress * (END_YEAR - START_YEAR));
  const clipW    = tx(progress) + 2;
  const ballPos  = { x: tx(progress), y: ty(balance) };
  const ballR    = 3 + progress * 18;
  const stageIdx = Math.min(Math.max(0, getStage(year)), STAGES.length - 1);

  const stage = STAGES[Math.min(stageIdx, STAGES.length - 1)];

  // Contributed vs returns breakdown for the current year
  const yearsElapsed = year - START_YEAR;
  const contributed  = PMT * yearsElapsed * 12;
  const returnAmt    = Math.max(0, balance - contributed);
  const returnPct    = balance > 0 ? Math.round((returnAmt / balance) * 100) : 0;
  const contribPct   = 100 - returnPct;

  return (
    <div ref={outerRef} className={styles.outer} id="your-journey">
      <div className={styles.sticky}>
        {/* Animated background */}
        <motion.div
          className={styles.bg}
          animate={{ backgroundColor: stage.bg }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          <div className={styles.bgGrid} />
        </motion.div>

        <div className={styles.inner}>

          {/* ── Left ── */}
          <div className={styles.left}>
            {/* Growth plant */}
            <GrowthPlant progress={progress} />

            {/* Year + balance */}
            <div className={styles.yearRow}>
              <motion.span
                className={styles.year}
                key={year}
                initial={{ opacity: 0, filter: 'blur(12px)', y: -8 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                aria-live="polite"
              >
                {year}
              </motion.span>
              <span className={styles.yearSub}>
                {yearsElapsed > 0 ? `Year ${yearsElapsed}` : 'Today'}
              </span>
            </div>

            <motion.div
              className={styles.balance}
              key={Math.round(balance / 500_000)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              aria-live="polite"
            >
              {formatUGX(balance)}
            </motion.div>

            {/* Composition bar */}
            {balance > 0 && (
              <div className={styles.compositionBlock}>
                <div className={styles.compositionBar}>
                  <motion.div
                    className={styles.compositionContrib}
                    animate={{ width: `${contribPct}%` }}
                    transition={{ duration: 0.15 }}
                  />
                  <motion.div
                    className={styles.compositionReturns}
                    animate={{ width: `${returnPct}%` }}
                    transition={{ duration: 0.15 }}
                  />
                </div>
                <div className={styles.compositionLabels}>
                  <span>
                    <span className={styles.clDot} data-c="contrib" />
                    {formatUGX(contributed)} you put in
                  </span>
                  <span>
                    <span className={styles.clDot} data-c="returns" />
                    {formatUGX(returnAmt)} earned ({returnPct}%)
                  </span>
                </div>
              </div>
            )}

            {/* Story */}
            <AnimatePresence mode="wait">
              <motion.div
                key={stageIdx}
                className={styles.story}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <h2 className={styles.storyTitle}>{stage.title}</h2>
                <p className={styles.storyDesc}>{stage.desc}</p>
              </motion.div>
            </AnimatePresence>

            {/* Scroll progress */}
            <div className={styles.progressWrap}>
              <div className={styles.progressTrack}>
                <motion.div
                  className={styles.progressFill}
                  animate={{ width: `${Math.min(progress * 100, 100)}%` }}
                  transition={{ duration: 0.05, ease: 'linear' }}
                />
              </div>
              <span className={styles.progressLabel}>
                {Math.round(progress * 40)} of 40 years
              </span>
            </div>
          </div>

          {/* ── Right: SVG chart ── */}
          <div className={styles.right}>
            <div className={styles.chartLabel}>
              Your 40-year journey
              <span className={styles.chartSub}>UGX 5K/mo · 10% return</span>
            </div>
            <JourneyChart
              progress={progress}
              ballX={ballPos.x}
              ballY={ballPos.y}
              ballR={ballR}
              clipW={clipW}
              balanceLabel={formatUGX(balance)}
            />
            {/* Destination reminder */}
            <div className={styles.destination}>
              <span className={styles.destLine} />
              <span className={styles.destText}>
                UGX {(MAX_VAL / 1e6).toFixed(0)}M at year 40 →
              </span>
            </div>
          </div>
        </div>

        {/* Scroll nudge */}
        <AnimatePresence>
          {year === START_YEAR && (
            <motion.div
              className={styles.nudge}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.8 }}
              aria-hidden="true"
            >
              <span className={styles.nudgeText}>Scroll to move through time</span>
              <motion.span
                className={styles.nudgeIcon}
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                ↓
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
