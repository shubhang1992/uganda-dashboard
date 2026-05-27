// Debounces a rapidly-changing value so downstream effects fire only after
// the value has been stable for `delayMs`. Common use case: search inputs +
// the `useSearch` query in `useEntity.js` — the existing call sites debounce
// in-place; this hook centralises the pattern.

import { useEffect, useState } from 'react';

/**
 * Debounce a value. Returns the value `delayMs` after it stops changing.
 *
 * @template T
 * @param {T} value - The value to debounce.
 * @param {number} [delayMs=300] - Delay in milliseconds. Coerced to >= 0.
 * @returns {T} The most recent value that has been stable for `delayMs`.
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // Coerce non-finite delays to 0 so the effect still completes
    // deterministically — `setTimeout` clamps negatives to 0 anyway, but
    // `NaN` is silently treated as 0 by browsers + node, which is
    // surprising. Be explicit.
    const safeDelay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    const timer = setTimeout(() => setDebounced(value), safeDelay);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
