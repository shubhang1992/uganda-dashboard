// Shared Phase-1 stub panel body.
//
// Renders the real EmployerSlidePanel chrome (right-docked slide-in + split-mode
// reflow) with a "coming in Phase N" placeholder body, so every stubbed module
// already behaves like its finished self (opens/closes, reflows the overview,
// Escape-to-close) — only the body content is a placeholder.
//
// Phases 2-8 replace each consumer (ViewEmployees, ContributionRuns, …) with a
// real panel that wraps EmployerSlidePanel directly; this stub then goes away.

import EmployerSlidePanel from './EmployerSlidePanel';
import styles from './StubPanel.module.css';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title - visible heading + aria label.
 * @param {string} props.phase - e.g. 'Phase 3' (used in the placeholder copy).
 * @param {string} [props.description] - one-line module summary.
 * @param {number} [props.width] - docked panel width (kept in sync with PANEL_PADDING).
 * @param {boolean} [props.splitMode] - dock the panel + suppress the backdrop.
 */
export default function StubPanel({ open, onClose, title, phase, description, width = 560, splitMode = false }) {
  return (
    <EmployerSlidePanel
      open={open}
      onClose={onClose}
      title={title}
      width={width}
      splitMode={splitMode}
    >
      <div className={styles.body}>
        <div className={styles.badge}>Coming in {phase}</div>
        <p className={styles.copy}>
          {description ?? `The full ${title} module`} lands in {phase}.
        </p>
        <p className={styles.subcopy}>
          This panel is wired up — its data layer, hooks, and slide-in chrome are
          in place. The interactive content arrives in {phase}.
        </p>
      </div>
    </EmployerSlidePanel>
  );
}
