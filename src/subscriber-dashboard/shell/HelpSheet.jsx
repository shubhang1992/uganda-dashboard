import { useNavigate } from 'react-router-dom';
import { useCurrentSubscriber, useSubscriberAgent } from '../../hooks/useSubscriber';
import { getInitials } from '../../utils/dashboard';
import { SUPPORT_WHATSAPP_URL, SUPPORT_WHATSAPP_DISPLAY, SUPPORT_EMAIL } from '../../config/env';
import BottomSheet from './BottomSheet';
import sheet from './subscriberSheets.module.css';

const HelpIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9.4 9a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.1 1-1.1 1.8M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const UserIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.75" />
    <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const PhoneIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const ChatIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M3 21l1.6-4A8 8 0 1 1 12 20a8 8 0 0 1-4-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const MailIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SparkIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.5 5L19 8.5 13.5 10 12 15l-1.5-5L5 8.5 10.5 7z" />
  </svg>
);
const ChevIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FAQS = [
  'How do I withdraw from my Emergency pot?',
  'When can I access my retirement savings?',
  'How do I update my nominees?',
];

/**
 * HelpSheet — the Help bottom sheet opened from the mobile app bar. Mirrors the
 * full Help Centre's functions: connect to your assigned human AGENT (primary
 * path), the alternate channels (call / WhatsApp / email), Ask AI, popular
 * questions, and a shortcut into the full Help Centre. Demo contact details
 * (CLAUDE.md §10a). Reuses the same agent hook + support config as HelpPage.
 */
export default function HelpSheet({ open, onClose, onAskAI }) {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const { data: agent } = useSubscriberAgent(sub?.id);

  const go = (path) => {
    onClose?.();
    navigate(path);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="How can we help?" icon={HelpIcon} height="86%">
      {/* Primary support path — your assigned human agent. */}
      <button type="button" className={sheet.agentCard} onClick={() => go('/dashboard/agent')}>
        <span className={sheet.agentAv} aria-hidden="true">
          {agent?.name ? getInitials(agent.name) : UserIcon}
        </span>
        <span className={sheet.agentText}>
          <b>{agent?.name || 'Your assigned agent'}</b>
          <small>{agent?.branchName ? `${agent.branchName} branch` : 'Message your agent in the app'}</small>
        </span>
        <span className={sheet.agentCta}>
          Message {ChevIcon}
        </span>
      </button>

      <div className={sheet.faqHd}>Other ways to reach us</div>
      <a className={sheet.row} href="tel:0800100200">
        <span className={sheet.rowIc}>{PhoneIcon}</span>
        <span className={sheet.rowText}>
          <b>Call us</b>
          <small>0800 100 200 · toll free</small>
        </span>
      </a>
      <a className={sheet.row} href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
        <span className={`${sheet.rowIc} ${sheet.green}`}>{ChatIcon}</span>
        <span className={sheet.rowText}>
          <b>WhatsApp</b>
          <small>{SUPPORT_WHATSAPP_DISPLAY}</small>
        </span>
      </a>
      <a className={sheet.row} href={`mailto:${SUPPORT_EMAIL}`}>
        <span className={sheet.rowIc}>{MailIcon}</span>
        <span className={sheet.rowText}>
          <b>Email us</b>
          <small>{SUPPORT_EMAIL}</small>
        </span>
      </a>
      <button
        type="button"
        className={sheet.row}
        onClick={() => {
          onClose?.();
          onAskAI?.();
        }}
      >
        <span className={sheet.rowIc}>{SparkIcon}</span>
        <span className={sheet.rowText}>
          <b>Ask Pensa AI</b>
          <small>Instant answers, any time</small>
        </span>
      </button>

      <div className={sheet.faqHd}>Popular questions</div>
      {FAQS.map((q) => (
        <button type="button" key={q} className={sheet.faq} onClick={() => go('/dashboard/help')}>
          {q}
          <span className={sheet.chev}>{ChevIcon}</span>
        </button>
      ))}

      <button type="button" className={sheet.helpCentreLink} onClick={() => go('/dashboard/help')}>
        Open the Help Centre {ChevIcon}
      </button>
    </BottomSheet>
  );
}
