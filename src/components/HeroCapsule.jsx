import styles from './HeroCapsule.module.css';

/**
 * HeroCapsule — the curved indigo "dome" header for the subscriber mobile
 * redesign. Presentational only (no router knowledge): pass a resolved `onBack`
 * handler — omit it on tab-root pages so no chevron renders — and an `onMenu`
 * handler (omit to hide the ⋮ button). The 3-column top bar keeps the centered
 * title optically centered by reserving a spacer where a button is absent.
 *
 * Layout (top → bottom):
 *   [ ‹back?      ·   TITLE (centered)   ·   ⋮menu? ]
 *   [ eyebrow? ]        small uppercase caption above the amount
 *   [ prefix amount ]   big white number (e.g. "UGX" + "4,820,000")
 *   [ subtitle? ]       muted supporting line
 *   [ statRow? ]        arbitrary node (units · invested · growth)
 *
 * variant="compact" drops the big-number block for dense pages (e.g. Reports):
 * it renders just the top bar plus an optional muted subtitle, so tables keep
 * their vertical budget and avoid a tall hero causing CLS.
 *
 * Captions/eyebrow/subtitle use --color-on-indigo-muted (contrast-checked
 * ≥4.5:1 over the dome); the amount stays solid white. The amount line reserves
 * its height so the display-font swap (Plus Jakarta Sans) doesn't shift layout.
 */
export default function HeroCapsule({
  title,
  eyebrow,
  prefix,
  amount,
  subtitle,
  statRow,
  onBack,
  onMenu,
  variant = 'default',
  className = '',
  children,
}) {
  const compact = variant === 'compact';
  return (
    <header className={`${styles.hero} ${compact ? styles.compact : ''} ${className}`}>
      <div className={styles.topBar}>
        {onBack ? (
          <button type="button" className={styles.iconBtn} onClick={onBack} aria-label="Back">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className={styles.iconSpacer} aria-hidden="true" />
        )}
        {title && <h1 className={styles.title}>{title}</h1>}
        {onMenu ? (
          <button type="button" className={styles.iconBtn} onClick={onMenu} aria-label="More options">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <span className={styles.iconSpacer} aria-hidden="true" />
        )}
      </div>

      {!compact && (
        <div className={styles.body}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          {amount != null && (
            <p className={styles.amount}>
              {prefix && <span className={styles.prefix}>{prefix}</span>}
              <span className={styles.amountValue}>{amount}</span>
            </p>
          )}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {statRow && <div className={styles.statRow}>{statRow}</div>}
        </div>
      )}
      {compact && subtitle && <p className={styles.subtitleCompact}>{subtitle}</p>}
      {children}
    </header>
  );
}
