import { useId } from 'react';
import styles from './FilterSelect.module.css';

export default function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  const selectId = useId();
  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
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
