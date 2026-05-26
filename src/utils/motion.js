/**
 * Shared motion / animation primitives.
 *
 * These constants are intentionally framework-agnostic so the same curve is
 * consumed by Framer Motion (JSX, array form) and — via the CSS variable
 * `--ease-out-expo` in `src/index.css` — by CSS Modules (`transition-timing-function`).
 *
 * Keep the two forms in sync: any tweak to the curve below must also be
 * reflected in `src/index.css` so JS animations and CSS transitions stay
 * coherent.
 */

/**
 * Canonical project easing curve — a soft, expo-flavoured ease-out used across
 * Framer Motion transitions in the signup flow, dashboards, and shared UI.
 *
 * Array form matches Framer Motion's cubic-bezier point shape so it can be
 * passed directly to `transition={{ ease: EASE_OUT_EXPO }}`.
 */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];
