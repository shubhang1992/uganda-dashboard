import { useNavigate } from 'react-router-dom';
import { goBackOrFallback } from '../utils/navigation';
import HeroCapsule from './HeroCapsule';
import styles from './PageHeader.module.css';

/**
 * PageHeader — shared back-aware page title bar (used by 22 files across the
 * subscriber + agent dashboards).
 *
 * The default variant renders the flat header (existing behaviour — unchanged).
 * `variant="hero"` renders the subscriber mobile <HeroCapsule> instead, so any
 * page can opt into the curved indigo dome cheaply. The hero-only props
 * (eyebrow/prefix/amount/statRow/onMenu) are ignored by the default variant.
 * Pass `showBack={false}` to suppress the back chevron on tab-root pages.
 */
export default function PageHeader({
  title,
  subtitle,
  backTo,
  onBack,
  fallback = '/dashboard',
  variant = 'default',
  showBack = true,
  // hero-only passthrough
  eyebrow,
  prefix,
  amount,
  statRow,
  onMenu,
}) {
  const navigate = useNavigate();
  function handleBack() {
    if (onBack) return onBack();
    if (backTo !== undefined) return navigate(backTo);
    goBackOrFallback(navigate, fallback);
  }

  if (variant === 'hero') {
    return (
      <HeroCapsule
        title={title}
        eyebrow={eyebrow}
        prefix={prefix}
        amount={amount}
        subtitle={subtitle}
        statRow={statRow}
        onBack={showBack ? handleBack : undefined}
        onMenu={onMenu}
      />
    );
  }

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={handleBack}
        aria-label="Back"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className={styles.titleStack}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  );
}
