import { useNavigate } from 'react-router-dom';
import { formatUGXExact } from '../../../utils/finance';
import styles from './PoliciesWidget.module.css';

/**
 * "Your policies" home card — a snapshot of the subscriber's insurance cover
 * (life + health, derived in the service via `subscriber.policies`). Each row
 * shows the policy with an Active/Expired pill and opens the full policies
 * page. When the subscriber holds nothing yet, an "Add a policy" affordance
 * routes them to pick cover. "View all" → /dashboard/policies.
 */
function PolicyGlyph({ type }) {
  if (type === 'health') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path d="M12 20s-7-4.35-7-9.5A3.5 3.5 0 0112 7.5 3.5 3.5 0 0119 10.5c0 5.15-7 9.5-7 9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 11.2v3.2M10.4 12.8h3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PoliciesWidget({ subscriber }) {
  const navigate = useNavigate();
  const policies = subscriber?.policies || [];
  const hasAny = policies.length > 0;
  const rows = policies.slice(0, 2);

  const goToPolicies = () => navigate('/dashboard/policies');

  return (
    <section className={styles.card} aria-labelledby="policies-title">
      <header className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Insurance
          </span>
          <h3 id="policies-title" className={styles.title}>Your policies</h3>
        </div>
        {hasAny && (
          <button type="button" className={styles.viewAll} onClick={goToPolicies}>
            View all
            <svg aria-hidden="true" viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </header>

      {hasAny ? (
        <div className={styles.rows}>
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.row}
              onClick={goToPolicies}
              aria-label={`${p.name}, ${p.status === 'active' ? 'active' : 'expired'} — view your policies`}
            >
              <span className={styles.docIcon} data-type={p.type} aria-hidden="true">
                <PolicyGlyph type={p.type} />
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{p.name}</span>
                <span className={styles.rowMeta}>{formatUGXExact(p.cover)} cover</span>
              </span>
              <span className={styles.pill} data-tone={p.status}>
                <span className={styles.pillDot} aria-hidden="true" />
                {p.status === 'active' ? 'Active' : 'Expired'}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className={styles.addRow}
          onClick={() => navigate('/dashboard/settings/insurance')}
          aria-label="Add a policy"
        >
          <span className={styles.addIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </span>
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>Add a policy</span>
            <span className={styles.rowMeta}>Protect your family from UGX 2,000 / mo</span>
          </span>
          <span className={styles.addChevron} aria-hidden="true">
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      )}
    </section>
  );
}
