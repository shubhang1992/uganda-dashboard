import styles from './SkeletonRow.module.css';

/**
 * Reusable virtualised-row skeleton.
 *
 * Renders a stack of placeholder rows that mirror the geometry of a
 * virtualised list item: avatar circle on the left, two text lines in
 * the middle, and a small numeric block on the right. Use this as the
 * `isLoading` branch on any list-style view panel so first-paint is a
 * "loading" frame rather than a misleading "0 of 0" flash.
 *
 * The shimmer animation reuses the same lavender→white sweep and
 * `cubic-bezier(0.16, 1, 0.3, 1)` easing that MetricsRow's skeleton
 * established, so all loading states across the dashboard read as one
 * coherent system. `prefers-reduced-motion` halts the sweep.
 *
 * Defaults match a list view at the typical 460–680px slide-in panel
 * width — override `count` per surface (e.g. 5 for short panels, 10
 * for the full subscribers list).
 *
 * @param {Object} props
 * @param {number} [props.count=8] — number of skeleton rows to render
 * @param {string} [props.variant='avatar'] — 'avatar' (default, mirrors
 *   agent/subscriber rows) | 'compact' (no avatar, mirrors commission
 *   agent rows) | 'card' (mirrors branch list cards with a stat strip)
 * @param {string} [props.label] — accessible label for the busy region.
 *   Defaults to "Loading…" — pass a more specific label (e.g.
 *   "Loading branches") so screen reader users know which surface is
 *   still resolving.
 * @param {string} [props.className] — additional class for the wrapper
 *   when a parent surface needs extra padding/inset.
 */
export default function SkeletonRow({
  count = 8,
  variant = 'avatar',
  label = 'Loading…',
  className,
}) {
  return (
    <div
      className={[styles.list, className].filter(Boolean).join(' ')}
      role="status"
      aria-busy="true"
      aria-label={label}
      data-variant={variant}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={styles.row}
          aria-hidden="true"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {variant !== 'compact' && (
            <span className={styles.avatar} />
          )}
          <div className={styles.body}>
            <span className={`${styles.line} ${styles.lineLg}`} />
            <span className={`${styles.line} ${styles.lineSm}`} />
            {variant === 'card' && (
              <span className={styles.bar} />
            )}
          </div>
          {variant === 'card' ? (
            <div className={styles.statStrip}>
              <span className={styles.statBlock} />
              <span className={styles.statBlock} />
              <span className={styles.statBlock} />
              <span className={styles.statBlock} />
            </div>
          ) : (
            <div className={styles.stat}>
              <span className={`${styles.line} ${styles.lineStat}`} />
              <span className={`${styles.line} ${styles.lineStatLbl}`} />
            </div>
          )}
        </div>
      ))}
      {/* Off-screen status text — gives assistive tech a single, calm
          announcement instead of every skeleton row firing its own
          aria-live update. */}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}
