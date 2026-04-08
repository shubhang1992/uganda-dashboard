import styles from './FilterSelect.module.css';

export default function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <div className={styles.wrap}>
      <label className={styles.label}>{label}</label>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function SearchFilter({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className={styles.searchWrap}>
      <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
        <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <input
        className={styles.searchInput}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
      />
      {value && (
        <button className={styles.clearBtn} onClick={() => onChange('')} aria-label="Clear">
          <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
