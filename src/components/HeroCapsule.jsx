import styles from './HeroCapsule.module.css';

/**
 * HeroCapsule — the curved indigo "dome" header for the subscriber mobile
 * redesign. Presentational only (no router knowledge): pass an `onMenu`
 * handler (omit to hide the ⋮ button). The 3-column top bar keeps the centered
 * title optically centered by reserving a left spacer. (The top-left back
 * chevron was removed across the subscriber dashboard — the bottom tab bar and
 * in-page navigation make it redundant; any `onBack` prop is now ignored.)
 *
 * Layout (top → bottom):
 *   [ leadingSlot? / (spacer)  ·  TITLE (centered)  ·  trailingSlot? / ⋮menu? ]
 *   [ eyebrow? ]        small uppercase caption above the amount
 *   [ prefix amount ]   big white number (e.g. "UGX" + "4,820,000")
 *   [ subtitle? ]       muted supporting line
 *   [ statRow? ]        arbitrary node (units · invested · growth)
 *
 * variant="compact" drops the big-number block for dense pages (e.g. Reports):
 * it renders just the top bar plus an optional muted subtitle, so tables keep
 * their vertical budget and avoid a tall hero causing CLS.
 *
 * The ⋮ menu button defaults to a three-dot kebab with aria-label "More
 * options"; pass `menuIcon` (any node) and/or `menuLabel` to repurpose it
 * (e.g. a helpdesk/headset icon labelled "Get help").
 *
 * `leadingSlot` / `trailingSlot` let a caller inject an arbitrary node into the
 * left / right top-bar cell (e.g. a notification bell, an inbox button). When
 * present they replace the spacer / built-in menu button; each should keep the
 * 44px footprint so the centered title stays optically centered. `trailingSlot`
 * takes precedence over `onMenu`.
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
  onMenu,
  menuIcon,
  menuLabel = 'More options',
  leadingSlot,
  trailingSlot,
  variant = 'default',
  className = '',
  children,
}) {
  const compact = variant === 'compact';
  return (
    <header className={`${styles.hero} ${compact ? styles.compact : ''} ${className}`}>
      <div className={styles.topBar}>
        {/* Left cell: caller-supplied slot, else a spacer that keeps the title
            optically centered (the back chevron was removed dashboard-wide). */}
        {leadingSlot ?? <span className={styles.iconSpacer} aria-hidden="true" />}
        {title && <h1 className={styles.title}>{title}</h1>}
        {trailingSlot ?? (onMenu ? (
          <button type="button" className={styles.iconBtn} onClick={onMenu} aria-label={menuLabel}>
            {menuIcon ?? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              </svg>
            )}
          </button>
        ) : (
          <span className={styles.iconSpacer} aria-hidden="true" />
        ))}
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
