import { useNavigate } from 'react-router-dom';
import { useSubscriberAgent } from '../../../hooks/useSubscriber';
import { getInitials } from '../../../utils/dashboard';
import styles from './HelpAgentWidget.module.css';

export default function HelpAgentWidget({ subscriber }) {
  const navigate = useNavigate();
  const { data: agent } = useSubscriberAgent(subscriber?.id);

  const initials = getInitials(agent?.name || '');
  const firstName = agent?.name ? agent.name.split(' ')[0] : null;

  return (
    <section className={styles.card} aria-labelledby="help-title">
      <div className={styles.left}>
        {agent ? (
          <span className={styles.avatar} data-status={agent.status === 'active' ? 'online' : 'offline'} aria-hidden="true">
            {initials}
            <span className={styles.statusDot} />
          </span>
        ) : (
          <span className={styles.avatarPlaceholder} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M4 14v-3a8 8 0 1116 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <rect x="2.5" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
              <rect x="17" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
            </svg>
          </span>
        )}
        <div className={styles.text}>
          <h3 id="help-title" className={styles.title}>
            {firstName ? `Talk to ${firstName}` : 'Need a hand?'}
          </h3>
          <p className={styles.sub}>
            {firstName
              ? `Your agent at ${agent.branchName} branch`
              : 'Help is just a tap away'}
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        {firstName && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => navigate('/dashboard/agent')}
          >
            Message
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => navigate('/dashboard/help')}
        >
          Help
        </button>
      </div>
    </section>
  );
}
