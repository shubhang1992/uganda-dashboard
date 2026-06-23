/* TEMPORARY Phase-0 placeholder for the employer mobile pages. Each route's
 * mobile body is filled in during Phases 2–6; until then the gate renders this.
 * Grep for 'MobilePlaceholder' to find which mobile screens are still stubs. */
export default function MobilePlaceholder({ name }) {
  return (
    <div
      style={{
        padding: 'var(--space-6) var(--space-5)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        color: 'var(--color-gray)',
      }}
    >
      {name} — mobile coming
    </div>
  );
}
