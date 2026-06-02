/**
 * commissionsConfig.jsx — non-component exports for the agent Commissions
 * surface (the route-param allow-list, the view labels, and the shared inline
 * SVG icon nodes).
 *
 * Split out of CommissionsParts.jsx so that file can export ONLY React
 * components — react-refresh ("fast refresh only works when a file only exports
 * components") flags any module that mixes component and non-component exports.
 * `Icons` holds JSX, hence the .jsx extension.
 *
 * Consumed by CommissionsParts.jsx, CommissionsPage.jsx, and CommissionsDesktop.jsx.
 */

export const VALID_VIEWS = new Set(['earned', 'owed']);

export const VIEW_LABELS = {
  earned: 'Earned',
  owed: 'Owed',
};

export const Icons = {
  chevDown: (
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16" aria-hidden="true">
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" fill="none" width="20" height="20" aria-hidden="true">
      <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 20 20" fill="none" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="13.5" cy="12" r="1.1" fill="currentColor" />
    </svg>
  ),
};
