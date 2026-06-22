import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useEntity } from '../../hooks/useEntity';
import { useAgentUnreadTicketCount } from '../../hooks/useTickets';
import { getInitials } from '../../utils/dashboard';
import { useAgentAppBar } from '../shell/agentAppBarContext';
import styles from './ProfilePage.module.css';

const AnalyticsIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M7 14l3-4 3 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const InboxIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const WalletIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M16 12h.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const SparkIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.5 5L19 8.5 13.5 10 12 15l-1.5-5L5 8.5 10.5 7z" />
  </svg>
);
const SettingsIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const HelpIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9.4 9a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.1 1-1.1 1.8M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

/**
 * ProfilePage — the agent's "Profile" bottom-nav tab (mobile). A hub: an account
 * card plus a tile grid that fans out to the secondary destinations (Analytics,
 * Inbox, Commissions, Co-Pilot, Settings, Help) kept off the five-slot bottom
 * bar, then Sign out. The desktop rail owns these links directly, so this page is
 * reached only on the phone.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { agentId } = useAgentScope();
  const { data: agent } = useEntity('agent', agentId);
  const { openAskAI } = useAgentAppBar();
  const unread = useAgentUnreadTicketCount(agentId);

  const name = agent?.name || user?.name || 'Agent';
  const subtitle = agent?.phone || user?.phone || 'Universal Pensions agent';

  function handleSignOut() {
    logout();
    navigate('/');
  }

  return (
    <div className={styles.page}>
      <section className={`${styles.card} ${styles.cardGrad}`}>
        <div className={styles.acct}>
          <span className={styles.acctAv}>{getInitials(name)}</span>
          <div>
            <div className={styles.acctName}>{name}</div>
            <div className={styles.acctSub}>{subtitle}</div>
          </div>
        </div>
      </section>

      <div className={styles.tiles}>
        <button type="button" className={styles.tile} onClick={() => navigate('/dashboard/analytics')}>
          <span className={styles.tileIc}>{AnalyticsIcon}</span>
          <span className={styles.tileText}>
            <b>Analytics</b>
            <small>Portfolio insights</small>
          </span>
        </button>
        <button type="button" className={styles.tile} onClick={() => navigate('/dashboard/inbox')}>
          {unread > 0 && <span className={styles.tileCount}>{badgeText(unread)}</span>}
          <span className={styles.tileIc}>{InboxIcon}</span>
          <span className={styles.tileText}>
            <b>Inbox</b>
            <small>Member messages</small>
          </span>
        </button>
        <button type="button" className={styles.tile} onClick={() => navigate('/dashboard/commissions')}>
          <span className={styles.tileIc}>{WalletIcon}</span>
          <span className={styles.tileText}>
            <b>Commissions</b>
            <small>Earned &amp; owed</small>
          </span>
        </button>
        <button type="button" className={styles.tile} onClick={() => openAskAI()}>
          <span className={styles.tileIc}>{SparkIcon}</span>
          <span className={styles.tileText}>
            <b>Co-Pilot</b>
            <small>Ask about your book</small>
          </span>
        </button>
        <button type="button" className={styles.tile} onClick={() => navigate('/dashboard/settings')}>
          <span className={styles.tileIc}>{SettingsIcon}</span>
          <span className={styles.tileText}>
            <b>Settings</b>
            <small>Profile &amp; password</small>
          </span>
        </button>
        <button type="button" className={styles.tile} onClick={() => navigate('/dashboard/help')}>
          <span className={styles.tileIc}>{HelpIcon}</span>
          <span className={styles.tileText}>
            <b>Help</b>
            <small>Guides &amp; support</small>
          </span>
        </button>
      </div>

      <button type="button" className={styles.signout} onClick={handleSignOut}>
        Sign out
      </button>
      <div className={styles.ver}>Universal Pensions Uganda · Agent</div>
    </div>
  );
}
