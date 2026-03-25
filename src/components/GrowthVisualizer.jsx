import { useState, useMemo, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { calcFV, formatUGX, fmtShort, sliderToAmt, amtToSlider } from '../utils/finance';
import styles from './GrowthVisualizer.module.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_PMT = 10_000;
const MAX_PMT = 2_000_000;
const DEFAULT_PMT = 100_000;
const PTS = 60;  // fixed point count — required for path morphing
const YEARS = 40;
const SVG_W = 540;
const SVG_H = 300;
const PAD = { t: 20, b: 44, l: 12, r: 16 };
const CW = SVG_W - PAD.l - PAD.r; // 512
const CH = SVG_H - PAD.t - PAD.b; // 236

// ─── SVG path builder — always PTS+1 L commands ──────────────────────────────

function buildPaths(pmt) {
  const data = Array.from({ length: PTS + 1 }, (_, i) => {
    const t = i / PTS;
    return { t, contributed: pmt * t * YEARS * 12, total: calcFV(pmt, t * YEARS) };
  });

  const maxVal = data[PTS].total;
  const bx = (t) => (PAD.l + t * CW).toFixed(2);
  const by = (v) => (PAD.t + CH - (v / maxVal) * CH).toFixed(2);
  const base = (PAD.t + CH).toFixed(2);

  const totalArea   = `M ${PAD.l} ${base} ${data.map((d) => `L ${bx(d.t)} ${by(d.total)}`).join(' ')} L ${PAD.l + CW} ${base} Z`;
  const contribArea = `M ${PAD.l} ${base} ${data.map((d) => `L ${bx(d.t)} ${by(d.contributed)}`).join(' ')} L ${PAD.l + CW} ${base} Z`;
  const contribLine = `M ${PAD.l} ${base} ${data.map((d) => `L ${bx(d.t)} ${by(d.contributed)}`).join(' ')}`;
  const totalLine   = `M ${PAD.l} ${by(0)} ${data.map((d) => `L ${bx(d.t)} ${by(d.total)}`).join(' ')}`;

  const annPts = [10, 20, 30, 40].map((yr) => {
    const d = data[Math.round((yr / YEARS) * PTS)];
    return { yr, x: parseFloat(bx(d.t)), y: parseFloat(by(d.total)), total: d.total };
  });

  return { totalArea, contribArea, contribLine, totalLine, data, maxVal, bx, by, base, annPts };
}

// ─── Chart SVG ────────────────────────────────────────────────────────────────

function GrowthChart({ pmt, inView }) {
  const paths = useMemo(() => buildPaths(pmt), [pmt]);
  const { totalArea, contribArea, contribLine, totalLine, data, maxVal, bx, by, base, annPts } = paths;

  // Y-axis labels (4 levels)
  const yLabels = [0.25, 0.5, 0.75, 1].map((frac) => ({
    val: maxVal * frac,
    y: parseFloat(by(maxVal * frac)),
  }));

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className={styles.chart}
      aria-label="Compound interest growth chart"
    >
      <defs>
        {/* Total value gradient */}
        <linearGradient id="gvTotal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5E63A8" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#2F8F9D" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2E8B57" stopOpacity="0.2" />
        </linearGradient>
        {/* Contributed gradient */}
        <linearGradient id="gvContrib" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
        {/* Stroke gradient */}
        <linearGradient id="gvStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5E63A8" />
          <stop offset="100%" stopColor="#2E8B57" />
        </linearGradient>
        {/* Clip for left→right reveal */}
        <clipPath id="gvClip">
          <motion.rect
            x="0" y="0" height={SVG_H}
            initial={{ width: 0 }}
            animate={{ width: inView ? SVG_W : 0 }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </clipPath>
      </defs>

      {/* Horizontal grid lines */}
      {yLabels.map(({ val, y }) => (
        <g key={val}>
          <line
            x1={PAD.l} y1={y} x2={PAD.l + CW} y2={y}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 6"
          />
          {/* Y-axis labels on right */}
          <text
            x={PAD.l + CW + 6} y={y + 4}
            fill="rgba(255,255,255,0.28)" fontSize="10"
            fontFamily="Inter, sans-serif"
          >
            {fmtShort(val)}
          </text>
        </g>
      ))}

      {/* Areas — revealed left→right */}
      <g clipPath="url(#gvClip)">
        {/* Total value fill */}
        <motion.path
          d={totalArea}
          fill="url(#gvTotal)"
          animate={{ d: totalArea }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Contributed fill */}
        <motion.path
          d={contribArea}
          fill="url(#gvContrib)"
          animate={{ d: contribArea }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Top stroke — pathLength draws it */}
        <motion.path
          d={totalLine}
          fill="none"
          stroke="url(#gvStroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: inView ? 1 : 0 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
        {/* Contribution divider line */}
        <motion.path
          d={contribLine}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
          strokeDasharray="3 5"
          animate={{ d: contribLine }}
          transition={{ duration: 0.65 }}
        />
      </g>

      {/* Year annotation dots */}
      {annPts.map(({ yr, x, y, total }, i) => (
        <motion.g
          key={yr}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
          transition={{ delay: 1.4 + i * 0.12, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        >
          <circle cx={x} cy={y} r="4" fill="var(--color-white)" opacity="0.9" />
          {/* Callout for year 40 */}
          {yr === 40 && (
            <>
              <line x1={x - 2} y1={y - 8} x2={x - 2} y2={y - 28} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <rect x={x - 52} y={y - 46} width="100" height="18" rx="4" fill="rgba(46,139,87,0.25)" />
              <text x={x - 2} y={y - 33} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="10" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="600">
                {formatUGX(total)}
              </text>
            </>
          )}
        </motion.g>
      ))}

      {/* X-axis labels */}
      {[0, 10, 20, 30, 40].map((yr) => (
        <text
          key={yr}
          x={parseFloat(bx(yr / YEARS))}
          y={SVG_H - 8}
          textAnchor="middle"
          fill="rgba(255,255,255,0.28)"
          fontSize="10"
          fontFamily="Inter, sans-serif"
        >
          {yr === 0 ? 'Today' : `+${yr}yr`}
        </text>
      ))}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GrowthVisualizer() {
  const [pmt, setPmt] = useState(DEFAULT_PMT);
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, margin: '-80px' });

  const sliderVal = amtToSlider(pmt, MIN_PMT, MAX_PMT);
  const fv40 = calcFV(pmt, 40);
  const contributed40 = pmt * 40 * 12;
  const returns40 = fv40 - contributed40;
  const multiplier = (fv40 / contributed40).toFixed(1);
  const returnPct = Math.round((returns40 / fv40) * 100);

  const milestones = [10, 20, 30, 40].map((yr) => ({ yr, val: calcFV(pmt, yr) }));

  return (
    <section ref={sectionRef} className={styles.section} id="see-growth">
      <div className={styles.inner}>

        {/* ── Left: controls ─────────────────────────────────── */}
        <motion.div
          className={styles.left}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: inView ? 1 : 0, x: inView ? 0 : -24 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.tag}>Compound growth calculator</div>
          <h2 className={styles.heading}>
            See what your money<br />
            <span className={styles.headingAccent}>actually becomes.</span>
          </h2>
          <p className={styles.subtext}>
            Adjust your monthly contribution. Watch the gap between what you put in and what you receive grow wider every decade.
          </p>

          {/* Slider */}
          <div className={styles.sliderBlock}>
            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>Monthly contribution</span>
              <span className={styles.sliderAmt}>{formatUGX(pmt)}</span>
            </div>
            <div className={styles.sliderTrack} style={{ '--pct': `${sliderVal}%` }}>
              <input
                type="range" min="0" max="100" step="0.3"
                value={sliderVal}
                className={styles.sliderInput}
                aria-label="Monthly contribution"
                onChange={(e) => setPmt(sliderToAmt(parseFloat(e.target.value), MIN_PMT, MAX_PMT))}
              />
            </div>
            <div className={styles.sliderLimits}>
              <span>UGX 10K</span>
              <span>UGX 2M</span>
            </div>
          </div>

          {/* 40yr big result */}
          <div className={styles.resultBlock}>
            <div className={styles.resultLabel}>In 40 years, you'll have</div>
            <AnimatePresence mode="wait">
              <motion.div
                key={Math.round(fv40 / 5_000_000)}
                className={styles.resultValue}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                {formatUGX(fv40)}
              </motion.div>
            </AnimatePresence>
            <div className={styles.multiplierRow}>
              <span className={styles.multiplierBadge}>{multiplier}×</span>
              <span className={styles.multiplierText}>
                your returns generate <strong>{returnPct}%</strong> of the total
              </span>
            </div>
          </div>

          {/* Milestone row */}
          <div className={styles.milestones}>
            {milestones.map(({ yr, val }) => (
              <div key={yr} className={styles.milestone}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={Math.round(val / 1_000_000)}
                    className={styles.mVal}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                  >
                    {formatUGX(val)}
                  </motion.span>
                </AnimatePresence>
                <span className={styles.mLabel}>{yr} yrs</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={styles.legendSwatch} data-type="contrib" />
              <span>What you contribute</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendSwatch} data-type="returns" />
              <span>What it grows into</span>
            </div>
          </div>
        </motion.div>

        {/* ── Right: chart ───────────────────────────────────── */}
        <motion.div
          className={styles.right}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: inView ? 1 : 0, x: inView ? 0 : 24 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <GrowthChart pmt={pmt} inView={inView} />

          {/* Gap callout */}
          <motion.div
            className={styles.gapCallout}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.9 }}
            transition={{ delay: 1.8, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.gapArrow}>↑</div>
            <div className={styles.gapText}>
              <strong>{formatUGX(returns40)}</strong> generated purely by returns
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
