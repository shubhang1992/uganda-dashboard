import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.png';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useBranchTicketMetrics } from '../../hooks/useTickets';
import { useBranchAppBar } from './branchAppBarContext';
import styles from './BranchMobileAppBar.module.css';

const BackIcon = (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// Inbox / support glyph — the speech-bubble the branch admin associates with the
// subscriber↔agent support queue they oversee.
const InboxIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const BellIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SparkIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.5 5L19 8.5 13.5 10 12 15l-1.5-5L5 8.5 10.5 7z" />
  </svg>
);

// Primary bottom-nav tabs: title only (no back), actions shown.
const TAB = {
  '/dashboard/agents': 'Agents',
  '/dashboard/commissions': 'Commissions',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/menu': 'Branch',
};
// Focused-task pages: back + title, NO action cluster.
const FLOW = {
  '/dashboard/agents/new': 'Add agent',
  '/dashboard/settings': 'Settings',
};
// Other secondary pages: back + title, actions shown.
const SECONDARY = {
  '/dashboard/support': 'Support inbox',
};

function resolve(pathname) {
  if (pathname === '/dashboard') return { left: 'logo', actions: true };
  if (FLOW[pathname]) return { left: 'back', title: FLOW[pathname], actions: false };
  if (TAB[pathname]) return { left: 'title', title: TAB[pathname], actions: true };
  if (pathname.startsWith('/dashboard/support/')) return { left: 'back', title: 'Support', actions: false };
  if (pathname.startsWith('/dashboard/attention/')) return { left: 'back', title: 'Needs attention', actions: true };
  if (pathname.startsWith('/dashboard/agents/')) return { left: 'back', title: 'Agent', actions: true };
  return { left: 'back', title: SECONDARY[pathname] || '', actions: true };
}

// Cap the numeric badge so a busy inbox never blows out the icon footprint.
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

/**
 * BranchMobileAppBar — the persistent top bar for the branch admin PHONE app
 * (<1024px). Left = brand logo on Home, otherwise the section title (with a back
 * arrow on deep/task pages). Right = Inbox (→ the support queue, with an
 * open-ticket count badge) · Notifications (opens the notif sheet) · Ask AI
 * (opens the Branch Copilot sheet). Hidden by the shell on desktop, which uses
 * BranchDesktopShell's own chrome.
 */
export default function BranchMobileAppBar({ onOpenAI, onOpenNotif }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { backRef } = useBranchAppBar();
  const { branchId } = useBranchScope();
  const { data: ticketMetrics } = useBranchTicketMetrics(branchId);
  const open = ticketMetrics?.openCount ?? 0;
  const meta = resolve(location.pathname);

  // A routed page can register a step-back handler; otherwise fall back to back.
  const handleBack = () => (backRef?.current ? backRef.current() : navigate(-1));

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        {meta.left === 'back' && (
          <button type="button" className={styles.backBtn} onClick={handleBack} aria-label="Back">
            {BackIcon}
          </button>
        )}
        {meta.left === 'logo' ? (
          <img src={logo} alt="Universal Pensions" className={styles.logo} />
        ) : (
          <h1 className={styles.title}>{meta.title}</h1>
        )}
      </div>

      {meta.actions && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => navigate('/dashboard/support')}
            aria-label={open > 0 ? `Support inbox, ${open} open` : 'Support inbox'}
          >
            {InboxIcon}
            {open > 0 && <span className={styles.count} aria-hidden="true">{badgeText(open)}</span>}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenNotif}
            aria-label="Notifications"
          >
            {BellIcon}
            <span className={styles.dot} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.ai}`}
            onClick={onOpenAI}
            aria-label="Ask AI"
          >
            {SparkIcon}
          </button>
        </div>
      )}
    </header>
  );
}
