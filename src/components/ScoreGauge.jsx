import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/motion';
import styles from './ScoreGauge.module.css';

/**
 * Radial 270° arc gauge. The arc fills to `value` (0–100); the caller overlays
 * the centre number + label (see BranchHealthScore's branch score and
 * EmployerHealthScore's monthly standing).
 *
 * Extracted from BranchHealthScore so the Branch health score and the Employer
 * monthly standing share one gauge. Two refinements over the inlined original:
 *   • gradient/filter ids are unique per instance (useId) so multiple gauges
 *     can render on one page without their <defs> clashing;
 *   • the fill animation respects `prefers-reduced-motion` (snaps to final).
 * Geometry is identical to the original at the default size (cx/cy 80, r 62).
 *
 * @param {object} props
 * @param {number} props.value         Arc fill, 0–100 (clamped).
 * @param {number} [props.size=160]    SVG width/height in px.
 * @param {number} [props.strokeW=13]  Arc stroke width in px.
 * @param {string} [props.className]   Extra class on the <svg>.
 */
export default function ScoreGauge({ value, size = 160, strokeW = 13, className }) {
  const uid = useId();
  const gradId = `scoreGrad-${uid}`;
  const glowId = `scoreGlow-${uid}`;
  const prefersReducedMotion = useReducedMotion();

  const cx = size / 2, cy = size / 2, r = size / 2 - 18;
  const startAngle = 135, sweepAngle = 270;
  const p2c = (a) => { const rad = (a * Math.PI) / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; };
  const s = p2c(startAngle), e = p2c(startAngle + sweepAngle);
  const arcPath = `M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`;
  const totalArc = 2 * Math.PI * r * (sweepAngle / 360);
  const clamped = Math.min(100, Math.max(0, value || 0));
  const gap = totalArc - (clamped / 100) * totalArc;
  const ticks = [0, 25, 50, 75, 100].map((pct) => {
    const angle = startAngle + (pct / 100) * sweepAngle;
    const inner = p2c(angle);
    const outerR = r + strokeW / 2 + 4;
    const rad = (angle * Math.PI) / 180;
    return { inner, outer: { x: cx + outerR * Math.cos(rad), y: cy + outerR * Math.sin(rad) }, pct };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className ? `${styles.gauge} ${className}` : styles.gauge}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-alert)" /><stop offset="35%" stopColor="var(--color-amber)" />
          <stop offset="65%" stopColor="var(--color-accent-mint)" /><stop offset="100%" stopColor="var(--color-positive)" />
        </linearGradient>
        <filter id={glowId}><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW + 6} strokeLinecap="round" />
      <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeW} strokeLinecap="round" />
      {ticks.map((t) => <line key={t.pct} x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />)}
      <motion.path
        d={arcPath} fill="none" stroke={`url(#${gradId})`} strokeWidth={strokeW} strokeLinecap="round" filter={`url(#${glowId})`}
        strokeDasharray={totalArc}
        initial={{ strokeDashoffset: prefersReducedMotion ? gap : totalArc }}
        animate={{ strokeDashoffset: gap }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.4, delay: 0.3, ease: EASE_OUT_EXPO }}
      />
    </svg>
  );
}
