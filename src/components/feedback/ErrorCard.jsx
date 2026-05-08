import styles from './ErrorCard.module.css';

/**
 * Shared error fallback for React Query consumers and other async surfaces.
 * Variants:
 *   - default: card-style block with icon + message + retry
 *   - inline: compact one-line variant for embedding inside lists/sections
 *
 * Use everywhere a hook can fail (`isError` / catch block) so the user sees
 * a clear message + retry instead of a silently-empty UI.
 *
 * @param {Object} props
 * @param {string} [props.title] — short headline (default: "We couldn't load this")
 * @param {string|Error} [props.message] — body text or Error instance
 * @param {Function} [props.onRetry] — optional retry handler. Hides retry if absent.
 * @param {'default'|'inline'} [props.variant]
 */
export default function ErrorCard({
  title = "We couldn't load this",
  message,
  onRetry,
  variant = 'default',
}) {
  const text = message instanceof Error ? message.message : message;
  return (
    <div className={styles.wrap} data-variant={variant} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 8v5M12 16v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </span>
      <div className={styles.body}>
        <span className={styles.title}>{title}</span>
        {text && <span className={styles.message}>{text}</span>}
      </div>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
