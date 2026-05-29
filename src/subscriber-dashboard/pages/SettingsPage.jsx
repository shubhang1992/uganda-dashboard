import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, formatUGXExact } from '../../utils/finance';
import { formatDate } from '../../utils/date';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { getInitials } from '../../utils/dashboard';
import PageHeader from '../../components/PageHeader';
import styles from './SettingsPage.module.css';

const SECTIONS = [
  {
    id: 'profile',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M5 20a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Profile',
    helper: 'Name, phone, email',
    to: '/dashboard/settings/profile',
  },
  {
    id: 'nominees',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M2 20a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M16 11a3.5 3.5 0 110-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M22 18a5 5 0 00-7-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Nominees',
    helper: 'Who inherits your savings',
    to: '/dashboard/settings/nominees',
  },
  {
    id: 'insurance',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    label: 'Insurance cover',
    helper: 'Premium and policy level',
    to: '/dashboard/settings/insurance',
  },
  {
    id: 'schedule',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Contribution schedule',
    helper: 'Frequency, amount, split',
    to: '/dashboard/save/schedule',
  },
  {
    id: 'reports',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M13 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Reports & statements',
    helper: 'Certificates, statements, exports',
    to: '/dashboard/reports',
  },
  {
    id: 'agent',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M5 20a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M17.5 5.5l1.8-1.8M19.5 9h2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Your agent',
    helper: 'Contact and support details',
    to: '/dashboard/agent',
  },
  {
    id: 'help',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M9.5 9.5a2.5 2.5 0 014.4 1.6c0 1.7-2.4 2-2.4 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="11.9" cy="17" r="0.9" fill="currentColor"/>
      </svg>
    ),
    label: 'Help',
    helper: 'FAQs and getting in touch',
    to: '/dashboard/help',
  },
  {
    id: 'notifications',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M6 8a6 6 0 1112 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9 21a3 3 0 006 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Notifications',
    helper: 'SMS, email, push',
    to: '/dashboard/settings/notifications',
    soon: true,
  },
  {
    id: 'security',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M8 11V7a4 4 0 118 0v4" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
    label: 'Password & security',
    helper: 'Set or change your password',
    // Opens the shared <Settings /> slide-in panel (same component the
    // distributor and branch shells use) — exposes the password card here
    // since this routed page has no other surface for it.
    panel: 'settings',
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { logout } = useAuth();
  const { setSettingsOpen } = useDashboard();
  const { data: sub } = useCurrentSubscriber();

  const initials = getInitials(sub?.name || '');
  const insurance = sub?.insurance;
  const memberSince = sub?.registeredDate
    ? formatDate(sub.registeredDate, { variant: 'month-year' })
    : null;

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className={styles.page}>
      <PageHeader variant="hero" title="Profile" fallback="/dashboard" />

      <div className={styles.body}>
        <motion.div
          className={styles.step}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE_OUT_EXPO }}
        >
          {/* Profile card */}
          <section className={styles.profile}>
            <span className={styles.avatar} aria-hidden="true">{initials || 'UP'}</span>
            <div className={styles.profileText}>
              <span className={styles.profileName}>{sub?.name || 'Your account'}</span>
              <span className={styles.profileMeta}>
                {sub?.phone && <span>{sub.phone}</span>}
                {memberSince && (
                  <>
                    <span className={styles.profileDot} aria-hidden="true">·</span>
                    <span>Member since {memberSince}</span>
                  </>
                )}
              </span>
            </div>
          </section>

          {/* Quick stats */}
          <section className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Net balance</span>
              <span className={styles.statValue}>{formatUGX(sub?.netBalance || 0)}</span>
            </div>
            <span className={styles.statDivider} aria-hidden="true" />
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Insurance cover</span>
              <span className={styles.statValue}>
                {insurance?.cover ? formatUGX(insurance.cover) : 'None'}
              </span>
            </div>
            <span className={styles.statDivider} aria-hidden="true" />
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Pension nominees</span>
              <span className={styles.statValue}>{(sub?.nominees?.pension || []).length}</span>
            </div>
          </section>

          {/* Sections */}
          <ul className={styles.sectionList}>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.sectionRow}
                  data-soon={s.soon || undefined}
                  aria-disabled={s.soon || undefined}
                  disabled={s.soon}
                  onClick={() => {
                    if (s.soon) return;
                    if (s.panel === 'settings') {
                      setSettingsOpen(true);
                      return;
                    }
                    navigate(s.to);
                  }}
                >
                  <span className={styles.sectionIcon} aria-hidden="true">{s.icon}</span>
                  <span className={styles.sectionText}>
                    <span className={styles.sectionLabel}>{s.label}</span>
                    <span className={styles.sectionHelper}>{s.helper}</span>
                  </span>
                  {s.soon && <span className={styles.soonBadge}>Soon</span>}
                  {!s.soon && (
                    <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.sectionArrow}>
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {sub?.insurance?.cover ? (
            <p className={styles.coverHint}>
              Cover {formatUGX(sub.insurance.cover)} · Premium {formatUGXExact(sub.insurance.premiumMonthly || 0)} / month
            </p>
          ) : null}

          <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
            Sign out
          </button>

          <p className={styles.versionLine}>Universal Pensions Uganda · v1.0</p>
        </motion.div>
      </div>
    </div>
  );
}
