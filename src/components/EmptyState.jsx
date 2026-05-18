import styles from './EmptyState.module.css';

/**
 * Shared empty-state for list views. Differentiates "truly empty" from
 * "filtered to zero" so users aren't told the platform has no data
 * when in fact they just typed an unmatched query.
 *
 * Use this everywhere a list or grid can render with no rows. Pair
 * with `<SkeletonRow />` for the loading branch so each panel has the
 * full triad: loading → empty (zero data) → empty (filter mismatch).
 *
 * Two kinds:
 *   - `no-data` — the source list is genuinely empty. Title leans
 *     "Nothing here yet" and a CTA can be passed to invite creation.
 *   - `no-match` — a non-empty source filtered/searched down to zero.
 *     Title nudges the user to widen the search.
 *
 * The icon swap between kinds is intentional — a "page with lines"
 * for `no-data` signals "create the first entry", whereas a "search
 * with a slash" for `no-match` signals "narrow miss, try again".
 *
 * @param {Object} props
 * @param {'no-data'|'no-match'} props.kind — semantic distinction;
 *   drives icon + default copy.
 * @param {string} [props.title] — override the default title text.
 * @param {string} [props.body] — supporting paragraph; falls back to
 *   a kind-appropriate sentence.
 * @param {{ label: string, onClick: Function }} [props.cta] — optional
 *   primary action. Only rendered when both fields present.
 * @param {string} [props.className] — additional class for layout
 *   integration (e.g. extra padding inside a panel body).
 * @param {React.ReactNode} [props.icon] — override the icon entirely.
 */
export default function EmptyState({
  kind,
  title,
  body,
  cta,
  className,
  icon,
}) {
  const isMatch = kind === 'no-match';
  const resolvedTitle = title || (isMatch ? 'No matches' : 'Nothing here yet');
  const resolvedBody =
    body ||
    (isMatch
      ? 'Try adjusting your search or filters.'
      : 'New entries will appear here as soon as they are added.');

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      data-kind={kind}
      role="status"
    >
      <span className={styles.iconHalo} aria-hidden="true">
        <span className={styles.iconRing} />
        <span className={styles.iconBg}>
          {icon || (isMatch ? <SearchSlashIcon /> : <SeedIcon />)}
        </span>
      </span>
      <div className={styles.text}>
        <h3 className={styles.title}>{resolvedTitle}</h3>
        <p className={styles.body}>{resolvedBody}</p>
      </div>
      {cta && cta.label && cta.onClick && (
        <button
          type="button"
          className={styles.cta}
          onClick={cta.onClick}
        >
          {cta.icon ? <span className={styles.ctaIcon}>{cta.icon}</span> : null}
          {cta.label}
        </button>
      )}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────
   Inline line icons in the project's stroke=1.75, 24×24 viewBox convention.
   Filled-in colour comes from `currentColor` so the parent CSS controls tone. */

function SeedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width="22"
      height="22"
      aria-hidden="true"
    >
      <path
        d="M12 3v9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8 7c-1 2-3 3-5 3 0 3 2 5 5 5 1.5 0 3-.5 4-1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 7c1 2 3 3 5 3 0 3-2 5-5 5-1.5 0-3-.5-4-1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14v7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchSlashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width="22"
      height="22"
      aria-hidden="true"
    >
      <circle
        cx="10.5"
        cy="10.5"
        r="6"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M20 20l-4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M7.5 13.5l6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
