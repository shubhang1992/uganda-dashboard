import styles from './ExportButton.module.css';

/**
 * Shared "Export CSV" button used by every subscriber report view (and any
 * future report surface). Handles the icon, copy, and click — the caller
 * passes a single `onExport` handler that drives `downloadCSV`.
 *
 * @param {Object} props
 * @param {() => void} props.onExport — invoked when the button is clicked
 * @param {string} [props.label="Export CSV"]
 * @param {boolean} [props.disabled]
 */
export default function ExportButton({ onExport, label = 'Export CSV', disabled }) {
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onExport}
      disabled={disabled}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="14" height="14">
        <path
          d="M10 3v10M10 13l-3-3M10 13l3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 15v2h14v-2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}
