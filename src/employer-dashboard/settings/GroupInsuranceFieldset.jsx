// Group-insurance fieldset — the company-wide group life cover configuration UI,
// extracted from EmployerSettings so it can be rendered on BOTH the Pension
// contribution tab and the Insurance tab bound to the SAME state (a single
// source of truth for `insuranceEnabled` / `groupCoverAmount`, which live inside
// `default_contribution_config`).
//
// Fully controlled: the parent owns the `insuranceEnabled` / `groupCoverAmount`
// slice of the config draft and passes it down with change handlers. Editing on
// one tab therefore reflects immediately on the other.
//
// Props:
//   • enabled       — boolean, group insurance on/off
//   • coverAmount   — string | number, the flat cover amount (UGX); '' = unset
//   • onToggle(on)  — called with the new boolean when the switch flips
//   • onCoverChange(value) — called with the raw input string when cover changes
//
// Styling reuses EmployerSettings.module.css so the fieldset looks identical on
// both tabs.
import styles from './EmployerSettings.module.css';

export default function GroupInsuranceFieldset({
  enabled,
  coverAmount,
  onToggle,
  onCoverChange,
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Group insurance</legend>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          className={styles.switchInput}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={styles.switchTrack} aria-hidden="true"><span className={styles.switchThumb} /></span>
        <span className={styles.switchLabel}>Provide group life cover to all staff</span>
      </label>

      {enabled && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="emp-default-cover">Flat cover amount — applies to all staff (UGX)</label>
          <input
            id="emp-default-cover"
            className={styles.input}
            type="number"
            min="0"
            step="1000"
            value={coverAmount}
            placeholder="e.g. 15000000"
            onChange={(e) => onCoverChange(e.target.value)}
          />
          <span className={styles.coverNote}>
            Applied to every staff member — insurance is all-or-nothing, with no
            per-member opt-out.
          </span>
        </div>
      )}
    </fieldset>
  );
}
