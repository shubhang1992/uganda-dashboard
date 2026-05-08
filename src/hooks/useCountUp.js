import { useEffect, useState } from 'react';

/**
 * Animate a numeric value from 0 to `target` over `duration` ms using an
 * ease-out-expo curve. Returns 0 when `run` is false or `target` is invalid.
 *
 * Used by hero cards (subscriber `PulseCard`, agent `PortfolioPulseCard`) so
 * a balance / portfolio metric counts up on first paint.
 *
 * @param {number} target — final value to count up to
 * @param {number} [duration=1100] — animation duration in ms
 * @param {boolean} [run=true] — when false, snaps to 0 (useful for reduced-motion)
 * @returns {number}
 */
export function useCountUp(target, duration = 1100, run = true) {
  const [value, setValue] = useState(0);
  const active = run && Number.isFinite(target) && target > 0;
  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return active ? value : 0;
}
