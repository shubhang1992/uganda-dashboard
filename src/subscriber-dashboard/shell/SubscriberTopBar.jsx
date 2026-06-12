import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import styles from './SubscriberTopBar.module.css';

// Map the first segment after /dashboard to a human section label. The page
// body still owns its title (the per-page <PageHeader>) — this eyebrow is a
// small orienting context label only, never a heading.
const SECTION_LABELS = {
  '': 'Home',
  save: 'Save',
  withdraw: 'Withdrawals',
  claim: 'Withdrawals',
  activity: 'Activity',
  reports: 'Reports',
  policies: 'Policies',
  help: 'Help',
  agent: 'Your agent',
  settings: 'Settings',
};

// Derive the section label from the routed pathname. Routes live under
// /dashboard (e.g. /dashboard/withdraw/savings), so we read the segment that
// immediately follows "dashboard". Unknown / deeper segments fall back to a
// generic label rather than leaking a raw slug.
function sectionLabelFor(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const dashIdx = segments.indexOf('dashboard');
  const key = dashIdx === -1 ? '' : segments[dashIdx + 1] || '';
  return SECTION_LABELS[key] || 'Dashboard';
}

/**
 * SubscriberTopBar — slim horizontal bar above the routed content in the desktop
 * (>=1024px) subscriber shell's right column. Desktop-only (rendered by
 * SubscriberDesktopShell). Mirrors AgentTopBar.
 *
 * Left:  a small uppercase section/route eyebrow (NOT an <h1> — each page body
 *        owns its own title via PageHeader).
 * Right: the signed-in member's identity (name + "Member" role label).
 *
 * The subscriber dashboard has no in-app notification surface (notifications are
 * agent/branch only), so there is no bell here — only the identity cluster.
 */
export default function SubscriberTopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { data: sub } = useCurrentSubscriber();

  const section = sectionLabelFor(pathname);
  // Prefer the subscriber record's name; fall back to the auth phone so the
  // identity cluster never renders empty before the profile resolves.
  const displayName = sub?.name || user?.name || user?.phone || 'Member';

  return (
    <header className={styles.bar}>
      <p className={styles.eyebrow}>{section}</p>

      <div className={styles.right}>
        <div className={styles.identity}>
          <span className={styles.identityName}>{displayName}</span>
          <span className={styles.identityRole}>Member</span>
        </div>
      </div>
    </header>
  );
}
