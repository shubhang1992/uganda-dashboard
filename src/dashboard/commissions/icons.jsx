/**
 * Inline SVG icons shared across `CommissionPanel` and its extracted
 * children. Exported as a single `Icons` map so call-sites stay identical
 * to the original `<Icons.search />` form.
 */
export const Icons = {
  close: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  back: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  search: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  edit: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="14" height="14">
      <path d="M13.586 3.586a2 2 0 112.828 2.828L7 15.828 3 17l1.172-4L13.586 3.586z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  download: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M10 3v10M10 13l-3-3M10 13l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 15v2h14v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  wallet: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="2" y="4" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="14" cy="12" r="1" fill="currentColor"/>
    </svg>
  ),
  approve: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  reject: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M14 6L6 14M6 6l8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  chev: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};
