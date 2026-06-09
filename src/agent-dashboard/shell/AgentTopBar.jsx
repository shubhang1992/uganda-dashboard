import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './AgentTopBar.module.css';

// Map the first segment after /dashboard to a human section label. The page
// body still owns the single <h1> (rule G4) — this eyebrow is a small
// orienting context label only, never a heading.
const SECTION_LABELS = {
  '': 'Home',
  onboard: 'Onboard',
  subscribers: 'Subscribers',
  inbox: 'Inbox',
  analytics: 'Analytics',
  commissions: 'Commissions',
  settings: 'Settings',
};

// Derive the section label from the routed pathname. Routes live under
// /dashboard (e.g. /dashboard/subscribers/:id), so we read the segment that
// immediately follows "dashboard". Unknown / deeper segments fall back to a
// generic label rather than leaking a raw slug.
function sectionLabelFor(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const dashIdx = segments.indexOf('dashboard');
  const key = dashIdx === -1 ? '' : segments[dashIdx + 1] || '';
  return SECTION_LABELS[key] || 'Dashboard';
}

/**
 * AgentTopBar — slim horizontal bar above the routed content in the desktop
 * agent shell's right column. Desktop-only (rendered by AgentDesktopShell).
 *
 * Left:  a small uppercase section/route eyebrow (NOT an <h1> — each page body
 *        owns the single page <h1> per rule G4).
 * Right: the signed-in agent's identity. (A search affordance previously lived
 *        here as an inert placeholder; it is not rendered until a real search is
 *        wired so we never show a dead, non-functional control.)
 *
 * The NotificationBell + inbox entry point live in the desktop sidebar
 * (AgentSideNavDesktop / SideNav) — they are deliberately NOT duplicated here.
 */
export default function AgentTopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const section = sectionLabelFor(pathname);
  // user.name may be omitted by the backend; fall back to the phone so the
  // identity cluster never renders empty.
  const displayName = user?.name || user?.phone || 'Agent';

  return (
    <header className={styles.bar}>
      <p className={styles.eyebrow}>{section}</p>

      <div className={styles.right}>
        {/* The inert search-slot placeholder was removed: it rendered a dead,
            non-functional control. Re-add a real <Search> here when search is
            wired (a later phase). The agent identity stays on the right. */}
        <div className={styles.identity}>
          <span className={styles.identityName}>{displayName}</span>
          {/* "Field agent" (not a bare "Agent") on purpose: the Settings page
              owns the canonical exact-text "Agent" role badge that the E2E
              asserts as a single node — a second exact "Agent" here would be a
              strict-mode collision on the desktop Settings route. */}
          <span className={styles.identityRole}>Field agent</span>
        </div>
      </div>
    </header>
  );
}
